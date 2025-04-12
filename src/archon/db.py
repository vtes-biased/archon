import base64
import collections
import contextlib
import dataclasses
import datetime
import dotenv
import hmac
import logging
import orjson
import os
import psycopg
import psycopg.rows
import psycopg.sql
import psycopg.types.json
import psycopg_pool
import secrets
import typing
import uuid

from . import events
from . import geo
from . import models
from . import engine

logger = logging.getLogger()

dotenv.load_dotenv()
DB_USER = os.getenv("DB_USER", "archon")
DB_PWD = os.getenv("DB_PWD", "")
CONNINFO = f"postgresql://{DB_USER}:{DB_PWD}@localhost/archondb"
HASH_KEY = base64.b64decode(os.getenv("HASH_KEY", ""))

psycopg.types.json.set_json_dumps(orjson.dumps)
psycopg.types.json.set_json_loads(orjson.loads)


def reconnect_failed(_pool: psycopg_pool.AsyncConnectionPool):
    logger.error("Failed to reconnect to the PostgreSQL database")


#: await POOL.open() before using this module, and POOL.close() when finished
POOL = psycopg_pool.AsyncConnectionPool(
    CONNINFO,
    open=False,
    max_size=10,
    reconnect_failed=reconnect_failed,
)


class IndexError(RuntimeError): ...


class NotFound(RuntimeError): ...


async def init():
    """Idempotent DB initialization"""
    async with POOL.connection() as conn:
        async with conn.cursor() as cursor:
            logger.debug("Initialising DB")
            await cursor.execute(
                "CREATE TABLE IF NOT EXISTS members("
                "uid UUID DEFAULT gen_random_uuid() PRIMARY KEY, "
                "vekn TEXT DEFAULT '', "
                "data jsonb)"
            )
            # Unique index on discord ID
            await cursor.execute(
                "CREATE UNIQUE INDEX IF NOT EXISTS idx_member_discord_id "
                "ON members "
                "USING BTREE ((data -> 'discord' ->> 'id'))"
            )
            # Unique index on email
            await cursor.execute(
                "CREATE UNIQUE INDEX IF NOT EXISTS idx_member_email "
                "ON members "
                "USING BTREE ((data ->> 'email'))"
            )
            # Index roles
            await cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_member_roles "
                "ON members "
                "USING GIN ((data -> 'roles'))"
            )
            # Trigram index for member names, for quick completion
            await cursor.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
            await cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_member_name_trgm "
                "ON members "
                "USING GIST ((data ->> 'name') gist_trgm_ops)"
            )
            await cursor.execute(
                "CREATE TABLE IF NOT EXISTS tournaments("
                "uid UUID DEFAULT gen_random_uuid() PRIMARY KEY, "
                "data jsonb)"
            )
            # Index on tournaments players (and all other JSON keys and paths)
            await cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_tournament_json "
                "ON tournaments "
                "USING GIN (data jsonb_path_ops)"
            )
            await cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_tournament_players "
                "ON tournaments "
                "USING GIN ((data->'players'))"
            )
            await cursor.execute(
                "CREATE TABLE IF NOT EXISTS clients("
                "uid UUID DEFAULT gen_random_uuid() PRIMARY KEY, "
                "secret_hash BYTEA,"
                "data jsonb)"
            )
            await cursor.execute(
                "CREATE TABLE IF NOT EXISTS tournament_events("
                "uid UUID PRIMARY KEY, "
                "timestamp TIMESTAMP WITH TIME ZONE NOT NULL, "
                "tournament_uid UUID REFERENCES tournaments(uid) ON DELETE CASCADE, "
                "member_uid UUID REFERENCES members(uid) ON DELETE SET NULL, "
                "data jsonb)"
            )


class IsDataclass(typing.Protocol):
    # https://stackoverflow.com/a/55240861
    __dataclass_fields__: typing.ClassVar[dict[str, typing.Any]]


def jsonize(datacls: IsDataclass):
    return psycopg.types.json.Jsonb(dataclasses.asdict(datacls))


async def reset(keep_members: bool = True):
    """ONLY FROM CLI - LOSES ALL DATA"""
    async with POOL.connection() as conn:
        async with conn.cursor() as cursor:
            logger.warning("Reset DB")
            await cursor.execute("DROP TABLE IF EXISTS tournament_events")
            await cursor.execute("DROP TABLE IF EXISTS tournaments")
            if not keep_members:
                await cursor.execute("DROP TABLE IF EXISTS members")


T = typing.TypeVar("T", bound=models.Tournament)


@contextlib.asynccontextmanager
async def member_consistency() -> typing.AsyncIterator[None]:
    try:
        yield
    except psycopg.errors.IntegrityError as err:
        if err.diag.constraint_name == "idx_member_email":
            raise IndexError("This email already exists")
        if err.diag.constraint_name == "idx_member_discord_id":
            raise IndexError("Discord ID already taken")
        raise


class Operator:
    """All async operations available for the API layer"""

    def __init__(self, conn: psycopg.AsyncConnection):
        self.conn = conn

    async def create_client(self, client: models.Client) -> str:
        """Create a client, returns its uid"""
        client.uid = client.uid or str(uuid.uuid4())
        async with self.conn.cursor() as cursor:
            res = await cursor.execute(
                "INSERT INTO clients (uid, data) " "VALUES (%s, %s) RETURNING uid",
                [client.uid, jsonize(client)],
            )
            return str((await res.fetchone())[0])

    async def reset_client_secret(self, client_uid: str) -> str:
        """Reset a client secret, store its hash, return the secret."""
        secret = secrets.token_urlsafe(32)
        if not HASH_KEY:
            raise RuntimeError("No HASH_KEY provided by the environment")
        secret_hash = hmac.digest(
            HASH_KEY, base64.urlsafe_b64decode(secret + "=="), "sha3_512"
        )
        async with self.conn.cursor() as cursor:
            res = await cursor.execute(
                "UPDATE clients SET secret_hash=%s WHERE uid=%s",
                [secret_hash, client_uid],
            )
            if res.rowcount < 1:
                raise KeyError(f"Client {client_uid} not found")
            return secret

    async def check_client_secret(self, client_uid: str, secret: str) -> bool:
        if not HASH_KEY:
            raise RuntimeError("No HASH_KEY provided by the environment")
        secret_hash = hmac.digest(
            HASH_KEY, base64.urlsafe_b64decode(secret + "=="), "sha3_512"
        )
        async with self.conn.cursor() as cursor:
            res = await cursor.execute(
                "SELECT secret_hash FROM clients WHERE uid=%s",
                [client_uid],
            )
            stored_hash = (await res.fetchone())[0]
        return hmac.compare_digest(secret_hash, stored_hash)

    async def create_tournament(self, tournament: models.TournamentConfig) -> str:
        """Create a tournament, returns its uid"""
        uid = uuid.uuid4()
        tournament.uid = str(uid)
        async with self.conn.cursor() as cursor:
            res = await cursor.execute(
                "INSERT INTO tournaments (uid, data) VALUES (%s, %s) RETURNING uid",
                [uid, jsonize(tournament)],
            )
            return str((await res.fetchone())[0])

    async def upsert_vekn_tournament(self, tournament: models.Tournament) -> str:
        """Create a tournament, returns its uid"""
        uid = uuid.uuid4()
        tournament.uid = str(uid)
        async with self.conn.cursor() as cursor:
            res = await cursor.execute(
                "SELECT data FROM tournaments WHERE data->'extra'->>'vekn_id' = %s",
                [tournament.extra.get("vekn_id")],
            )
            data = await res.fetchone()
            if data:
                uid = uuid.UUID(data[0]["uid"])
                tournament.uid = str(uid)
                res = await cursor.execute(
                    "UPDATE tournaments SET data=%s WHERE uid=%s",
                    [jsonize(tournament), uid],
                )
                return str(uid)
            else:
                uid = uuid.uuid4()
                tournament.uid = str(uid)
                res = await cursor.execute(
                    "INSERT INTO tournaments (uid, data) "
                    "VALUES (%s, %s) RETURNING uid",
                    [uid, jsonize(tournament)],
                )
                return str((await res.fetchone())[0])

    async def get_tournaments(
        self, cls: typing.Type[T] = models.Tournament
    ) -> list[models.Tournament]:
        """List all tournaments.
        TODO: paginate. We'll need an index on tournament.start
        """
        async with self.conn.cursor() as cursor:
            res = await cursor.execute("SELECT data FROM tournaments")
            return [cls(**row[0]) for row in await res.fetchall()]

    async def get_tournament(
        self, uid: str, cls: typing.Type[T] = models.Tournament
    ) -> T:
        """Get a tournament by its uid"""
        async with self.conn.cursor() as cursor:
            res = await cursor.execute(
                "SELECT data FROM tournaments WHERE uid=%s", [uuid.UUID(uid)]
            )
            data = await res.fetchone()
            if not data:
                return None
            return cls(**(data[0]))

    async def played_tournaments(self, uid: str) -> list[models.Tournament]:
        """Get all tournament played by a given member"""
        async with self.conn.cursor() as cursor:
            res = await cursor.execute(
                "SELECT data FROM tournaments WHERE data->'players' ? %s", [uid]
            )
            return [models.Tournament(**data[0]) for data in await res.fetchall()]

    async def update_tournament(self, tournament: models.Tournament) -> str:
        """Update a tournament, returns its uid"""
        uid = uuid.UUID(tournament.uid)
        async with self.conn.cursor() as cursor:
            res = await cursor.execute(
                "UPDATE tournaments SET data=%s WHERE uid=%s",
                [jsonize(tournament), uid],
            )
            if res.rowcount < 1:
                raise KeyError(f"Tournament {uid} not found")
            if tournament.state == models.TournamentState.FINISHED:
                await cursor.executemany(
                    f"""UPDATE members 
                    SET data=jsonb_set(data, '{{ratings,{tournament.uid}}}', %s, true) 
                    WHERE uid=%s
                    """,
                    [
                        [jsonize(rating), uuid.UUID(uid)]
                        for uid, rating in engine.ratings(tournament).items()
                    ],
                )
            return str(uid)

    async def delete_tournament(self, uid: str) -> None:
        """Delete a tournament"""
        async with self.conn.cursor() as cursor:
            res = await cursor.execute(
                "DELETE FROM tournaments WHERE uid=%s", [uuid.UUID(uid)]
            )
            if res.rowcount < 1:
                raise KeyError(f"Tournament {uid} not found")

    async def record_event(
        self, tournament_uid: str, member_uid: str, event: events.TournamentEvent
    ) -> None:
        tournament_uid = uuid.UUID(tournament_uid)
        member_uid = uuid.UUID(member_uid)
        timestamp = datetime.datetime.now(datetime.timezone.utc)
        async with self.conn.cursor() as cursor:
            await cursor.execute(
                "INSERT INTO tournament_events VALUES (%s, %s, %s, %s, %s)",
                [event.uid, timestamp, tournament_uid, member_uid, jsonize(event)],
            )
            if cursor.rowcount < 1:
                raise RuntimeError("INSERT failed")

    async def purge_tournament_events(self) -> int:
        cutoff = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(
            days=366
        )
        async with self.conn.cursor() as cursor:
            res = await cursor.execute(
                "DELETE FROM tournament_events WHERE timestamp < %s", [cutoff]
            )
            return res.rowcount

    async def insert_members(self, members: list[models.Member]) -> None:
        """Insert members from VEKN.
        Modify the members list in place to match DB (ie. uuids).
        """
        async with self.conn.cursor() as cursor:
            # get existing VEKN, lock the table
            res = await cursor.execute(
                "SELECT vekn, data FROM members WHERE vekn=ANY(%s) FOR UPDATE",
                [[m.vekn for m in members]],
            )
            existing = await res.fetchall()
            existing = {e[0]: self._instanciate_member(e[1]) for e in existing}
            # do not overwrite local data & lose relevant info (sanctions, login, etc.)
            # don't revert changes on name
            # TODO: also don't revert country, city, roles and sponsor changes
            # once we're stable on this
            for i, m in enumerate(members):
                if m.vekn in existing:
                    local: models.Member = existing[m.vekn]
                    # TODO remove country & city
                    local.country = m.country
                    local.city = m.city
                    local.ranking = m.ranking
                    local.roles = m.roles
                    local.prefix = m.prefix
                    local.sponsor = None
                    members[i] = local
            # update existing
            # cannot run two prepared statements in parallel, just wait
            await cursor.executemany(
                "UPDATE members SET data=%s WHERE vekn=%s",
                [
                    [self._jsonize_member(m), m.vekn]
                    for m in members
                    if m.vekn in existing
                ],
            )
            # insert new
            await cursor.executemany(
                "INSERT INTO members (uid, vekn, data) VALUES (%s, %s, %s)",
                [
                    [uuid.UUID(m.uid), m.vekn, self._jsonize_member(m)]
                    for m in members
                    if m.vekn not in existing
                ],
            )

    async def insert_member(self, member: models.Member) -> models.Member:
        """Insert a new member"""
        # vekn must not be set
        member.vekn = ""
        async with self.conn.cursor() as cursor, member_consistency():
            # insert new
            await cursor.execute(
                "INSERT INTO members (uid, data) VALUES (%s, %s)",
                [uuid.UUID(member.uid), self._jsonize_member(member)],
            )
            if cursor.rowcount < 1:
                raise RuntimeError("INSERT failed")
            return member

    async def get_member(
        self, uid: str, for_update=False, cls: typing.Type[T] = models.Member
    ) -> T:
        """Get a member from their uid"""
        async with self.conn.cursor() as cursor:
            if for_update:
                query = "SELECT data FROM members WHERE uid=%s FOR UPDATE"
            else:
                query = "SELECT data FROM members WHERE uid=%s"
            res = await cursor.execute(query, [uuid.UUID(uid)])
            data = await res.fetchone()
            if data:
                return self._instanciate_member(data[0], cls)
            return None

    async def get_members(self, uids: list[str] | None = None) -> list[models.Person]:
        """Get all members"""
        async with self.conn.cursor() as cursor:
            if uids:
                res = await cursor.execute(
                    "SELECT data FROM members WHERE uid = ANY(%s)", [uids]
                )
            else:
                res = await cursor.execute("SELECT data FROM members")
            return [
                self._instanciate_member(data[0], models.Person)
                for data in await res.fetchall()
            ]

    async def get_externally_visible_members(
        self, user: models.Person
    ) -> list[models.Person]:
        """Get all members that can be contacted by non-vekn members"""
        async with self.conn.cursor() as cursor:
            res = await cursor.execute(
                "SELECT data FROM members "
                "WHERE data->'roles' ? 'NC' OR data->'roles' ? 'Prince' OR uid=%s",
                [user.uid],
            )
            return [
                self._instanciate_member(data[0], models.Person)
                for data in await res.fetchall()
            ]

    def _update_discord_data(self, member: models.Member, user: models.DiscordUser):
        member.discord = user
        member.name = member.name or user.global_name or user.username
        member.nickname = member.nickname or user.global_name or user.username
        # do not update the email by default
        member.email = member.email or user.email
        if member.email == user.email:
            member.verified = user.verified

    async def update_member_discord(
        self, member_uid: str, user: models.DiscordUser
    ) -> models.Member:
        """Update an existing member, set their discord profile"""
        async with self.conn.cursor() as cursor:
            res = await cursor.execute(
                "SELECT data FROM members WHERE uid = %s FOR UPDATE",
                [uuid.UUID(member_uid)],
            )
            data = await res.fetchone()
            if not data:
                raise RuntimeError(f"Unknown member {member_uid}")
            member = self._instanciate_member(data[0])
            self._update_discord_data(member, user)
            await cursor.execute(
                "UPDATE members SET data=%s WHERE uid = %s",
                [self._jsonize_member(member), uuid.UUID(member_uid)],
            )
            if cursor.rowcount < 1:
                raise RuntimeError(
                    f"Failed to update discord info for member {member_uid}"
                )
            return member

    async def upsert_member_discord(self, user: models.DiscordUser) -> models.Member:
        """Get or create a member from their discord profile"""
        async with self.conn.cursor() as cursor:
            # if this discord ID already exists, use it
            res = await cursor.execute(
                "SELECT data FROM members "
                "WHERE data -> 'discord' ->> 'id' = %s FOR UPDATE",
                [user.id],
            )
            data = await res.fetchone()
            if data:
                member = self._instanciate_member(data[0])
                self._update_discord_data(member, user)
                await cursor.execute(
                    "UPDATE members SET data=%s WHERE data -> 'discord' ->> 'id' = %s",
                    [self._jsonize_member(member), user.id],
                )
                if cursor.rowcount < 1:
                    raise RuntimeError(f"Failed to update Discord ID# {user.id}")
                return member
            # if the email exists already, use it
            if user.email:
                res = await cursor.execute(
                    "SELECT data FROM members "
                    "WHERE data ->> 'email' = %s FOR UPDATE",
                    [user.email],
                )
                data = await res.fetchone()
                if data:
                    member = self._instanciate_member(data[0])
                    self._update_discord_data(member, user)
                    await cursor.execute(
                        "UPDATE members SET data=%s WHERE data ->> 'email' = %s",
                        [self._jsonize_member(member), user.email],
                    )
                    if cursor.rowcount < 1:
                        raise RuntimeError(f"Failed to update Discord ID# {user.id}")
                    return member
            # otherwise create a new member
            uid = uuid.uuid4()
            member = models.Member(
                uid=str(uid),
                vekn="",
                name=user.global_name or user.username,
                nickname=user.global_name or user.username,
                email=user.email,
                verified=user.verified,
                discord=user,
            )
            await cursor.execute(
                "INSERT INTO members (uid, vekn, data) VALUES (%s, %s, %s)",
                [uid, member.vekn, self._jsonize_member(member)],
            )
            if cursor.rowcount < 1:
                raise RuntimeError("INSERT failed")
            return member

    async def upsert_member_email(self, email: str) -> models.Member:
        async with self.conn.cursor() as cursor, member_consistency():
            res = await cursor.execute(
                "SELECT data FROM members " "WHERE data ->> 'email' = %s FOR UPDATE",
                [email],
            )
            data = await res.fetchone()
            if data:
                member = self._instanciate_member(data[0])
                member.verified = True
                await cursor.execute(
                    "UPDATE members SET data=%s WHERE data ->> 'email' = %s",
                    [self._jsonize_member(member), email],
                )
                if cursor.rowcount < 1:
                    raise RuntimeError(f"Failed to update email {email}")
            else:
                uid = uuid.uuid4()
                member = models.Member(
                    uid=str(uid),
                    vekn="",
                    name="",
                    nickname="",
                    email=email,
                    verified=True,
                )
                await cursor.execute(
                    "INSERT INTO members (uid, vekn, data) VALUES (%s, %s, %s)",
                    [uid, member.vekn, self._jsonize_member(member)],
                )
                if cursor.rowcount < 1:
                    raise RuntimeError("INSERT failed")
            return member

    async def get_member_by_email(self, email: str) -> models.Member:
        async with self.conn.cursor() as cursor:
            res = await cursor.execute(
                "SELECT data FROM members " "WHERE data ->> 'email' = %s",
                [email],
            )
            data = await res.fetchone()
            if data:
                member = self._instanciate_member(data[0])
                return member
            raise NotFound(f"Member not found by email: {email}")

    async def update_member(self, member: models.Member) -> models.Member:
        async with self.conn.cursor() as cursor, member_consistency():
            await cursor.execute(
                "UPDATE members SET data=%s WHERE uid=%s",
                [self._jsonize_member(member), member.uid],
            )
            if cursor.rowcount < 1:
                raise RuntimeError(f"Failed to update member {member.uid}")
            return member

    async def update_member_new_vekn(self, member: models.Member) -> models.Member:
        """Use an atomic query with subquery to set a new VEKN

        This avoid concurrency issues. Also update member data (usually set the sponsor)
        """
        async with self.conn.cursor() as cursor:
            res = await cursor.execute(
                """UPDATE members
                SET vekn=next_vekn.n
                FROM (
                    SELECT n from generate_series(1000001, 9999999) as n
                    WHERE n NOT IN (select vekn::int from members where vekn <> '')
                    LIMIT 1
                ) as next_vekn 
                WHERE uid=%s
                RETURNING vekn
                """,
                [uuid.UUID(member.uid)],
            )
            data = await res.fetchone()
            if not data:
                raise RuntimeError(f"Failed to assign a new VEKN to {member.uid}")
            member.vekn = data[0]
            await cursor.execute(
                "UPDATE members SET data=%s WHERE uid=%s",
                [self._jsonize_member(member), member.uid],
            )
            if cursor.rowcount < 1:
                raise RuntimeError(f"Failed to update member {member.uid}")
            # also set the vekn in all tournaments the player has been in
            await cursor.execute(
                f"""UPDATE tournaments
                SET data=jsonb_set(data, '{{players,{member.uid},vekn}}', %s, false)
                WHERE data->'players' ? %s
                """,
                [psycopg.types.json.Jsonb(member.vekn), member.uid],
            )
            return await self.update_member(member)

    async def claim_vekn(self, uid: str, vekn: str) -> models.Member | None:
        """Claim an existing vekn ID: returns a **new uid** for the member."""
        async with self.conn.cursor() as cursor:
            res = await cursor.execute(
                "SELECT vekn, data FROM members WHERE uid=%s FOR UPDATE",
                [uuid.UUID(uid)],
            )
            data = await res.fetchone()
            if not data:
                return None
            old_vekn = data[0]
            member = self._instanciate_member(data[1])
            if old_vekn == vekn:
                #  no change
                logger.warning("%s claiming %s but already has it", uid, vekn)
                return member
            if old_vekn:
                logger.warning("%s claiming %s, previously had %s", uid, vekn, old_vekn)
                raise RuntimeError("Cannot claim a VEKN: already has one")
            res = await cursor.execute(
                "SELECT data FROM members WHERE vekn=%s FOR UPDATE", [vekn]
            )
            data = await res.fetchone()
            if not data:
                logger.warning("no VEKN record found for %s", vekn)
                return None
            vekn_member = self._instanciate_member(data[0])
            if vekn_member.discord:
                if vekn_member.discord.id != member.discord.id:
                    logger.warning(
                        "VEKN %s already owned by %s", vekn, vekn_member.discord.id
                    )
                    return None
            # assign personal elements
            vekn_member.discord = member.discord
            vekn_member.nickname = member.nickname
            vekn_member.email = member.email
            vekn_member.whatsapp = member.whatsapp
            vekn_member.verified = member.verified
            # delete initial (non-vekn) member
            await cursor.execute("DELETE FROM members WHERE uid=%s", [uid])
            # update the VEKN record
            await cursor.execute(
                "UPDATE members SET data=%s WHERE vekn=%s",
                [self._jsonize_member(vekn_member), vekn],
            )
            if cursor.rowcount < 1:
                raise RuntimeError(f"Failed to update VEKN {vekn}")
            return vekn_member

    async def abandon_vekn(self, uid: str) -> models.Member | None:
        """Abandon vekn ID: returns a **new uid** for the member."""
        async with self.conn.cursor() as cursor:
            res = await cursor.execute(
                "SELECT vekn, data FROM members WHERE uid=%s FOR UPDATE",
                [uuid.UUID(uid)],
            )
            data = await res.fetchone()
            if not data:
                logger.warning("User not found: %s", uid)
                return None
            vekn = data[0]
            member = self._instanciate_member(data[1])
            if not vekn:
                logger.warning("No vekn for %s, nothing to do", uid)
                return member
            new_member = models.Member(**dataclasses.asdict(member))
            new_uid = uuid.uuid4()
            new_member.vekn = ""
            new_member.roles = []
            new_member.sanctions = []
            new_member.ranking = models.Ranking()
            new_member.ratings = {}
            new_member.sponsor = ""
            new_member.uid = str(new_uid)
            member.discord = None
            member.nickname = None
            member.email = None
            member.whatsapp = None
            member.verified = False
            await cursor.execute(
                "UPDATE members SET data=%s WHERE uid=%s",
                [self._jsonize_member(member), uuid.UUID(uid)],
            )
            if cursor.rowcount < 1:
                raise RuntimeError(f"Failed to find Member {uid}")
            logger.warning("Old member updated: %s", uid)
            if new_member.discord:
                nick = new_member.discord.global_name or new_member.discord.username
                new_member.name = nick
                new_member.nickname = nick
                new_member.email = new_member.discord.email
                new_member.verified = new_member.discord.verified
            await cursor.execute(
                "INSERT INTO members (uid, data) VALUES (%s, %s)",
                [new_uid, self._jsonize_member(new_member)],
            )
            logger.warning("New member created: %s - %s", new_member.uid, data)
            return new_member

    async def set_sponsor_on_prefix(self, prefix: str, sponsor_uid: str):
        async with self.conn.cursor() as cursor:
            res = await cursor.execute(
                "SELECT data FROM members WHERE vekn LIKE %s FOR UPDATE",
                [prefix.replace("%", "") + "%"],
            )
            recruits = [
                self._instanciate_member(data[0]) for data in await res.fetchall()
            ]
            for recruit in recruits:
                recruit.sponsor = sponsor_uid
            await cursor.executemany(
                "UPDATE members SET data=%s WHERE uid=%s",
                [[self._jsonize_member(m), uuid.UUID(m.uid)] for m in recruits],
            )

    async def recompute_all_ratings(self):
        # that's how to compute cutoff: 18 months ago
        # cutoff = datetime.datetime.now(datetime.timezone.utc)
        # cutoff.year -= 1
        # if cutoff.month > 6:
        #     cutoff.month -= 6
        # else:
        #     cutoff.year -= 1
        #     cutoff.month += 6
        # that's how you'd check the cutoff to compute rankings
        # tournament.start.replace(tzinfo=zoneinfo.ZoneInfo(tournament.timezone))
        async with self.conn.cursor() as cursor:
            res = await cursor.execute(
                """SELECT data FROM tournaments
                WHERE data->>'state' = %s
                """,
                [models.TournamentState.FINISHED],
            )
            all_ratings = collections.defaultdict(dict)
            async for row in res:
                tournament = models.Tournament(**row[0])
                for uid, rating in engine.ratings(tournament).items():
                    all_ratings[uid][tournament.uid] = dataclasses.asdict(rating)
            await cursor.execute(
                "UPDATE members SET data=jsonb_set(data, '{ratings}', '{}', true)"
            )
            await cursor.executemany(
                """UPDATE members
                SET data=jsonb_set(data, '{ratings}', %s, false)
                WHERE uid=%s
                """,
                [
                    [psycopg.types.json.Jsonb(ratings), uuid.UUID(uid)]
                    for uid, ratings in all_ratings.items()
                ],
            )

    def _jsonize_member(self, member: models.Member):
        data = dataclasses.asdict(member)
        if member.country:
            country = geo.COUNTRIES_BY_NAME[member.country]
            data["country_flag"] = country.flag
            data["country_iso"] = country.iso
            data["country_geoname_id"] = country.geoname_id
        else:
            member.city = ""
        if member.city:
            data["city_geoname_id"] = geo.CITIES_BY_COUNTRY[member.country][
                member.city
            ].geoname_id
        return psycopg.types.json.Json(data)

    def _instanciate_member(self, data: dict, cls: typing.Type[T] = models.Member) -> T:
        if "country_iso" in data:
            country = geo.COUNTRIES_BY_ISO[data["country_iso"]]
            data["country"] = country.country
            data["country_flag"] = country.flag
        if "city_geoname_id" in data:
            data["city"] = geo.CITIES_BY_GEONAME_ID[data["city_geoname_id"]].unique_name
        return cls(**data)


@contextlib.asynccontextmanager
async def operator() -> typing.AsyncIterator[Operator]:
    """Yields an async DB Operator to execute DB operations in a single transaction"""
    async with POOL.connection() as conn:
        yield Operator(conn)
