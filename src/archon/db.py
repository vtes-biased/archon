import base64
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
from . import models

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
            # Index on discord ID
            await cursor.execute(
                "CREATE UNIQUE INDEX IF NOT EXISTS idx_member_discord_id "
                "ON members "
                "USING BTREE ((data -> 'discord' ->> 'id'))"
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
            # Index on tournaments start date (as text)
            await cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_tournament_json_start "
                "ON tournaments "
                "USING BTREE ((data ->> 'start'))"
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
    return psycopg.types.json.Json(dataclasses.asdict(datacls))


def reset(keep_members: bool = True):
    """Only called as a specific special-case CLI command, so not async"""
    with psycopg.connect(CONNINFO) as conn:
        with conn.cursor() as cursor:
            logger.warning("Reset DB")
            cursor.execute("DROP TABLE IF EXISTS tournament_events")
            cursor.execute("DROP TABLE IF EXISTS tournaments")
            if not keep_members:
                cursor.execute("DROP TABLE IF EXISTS members")


T = typing.TypeVar("T", bound=models.Tournament)


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
                "INSERT INTO tournaments (uid, data) " "VALUES (%s, %s) RETURNING uid",
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
            return str(uid)

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
        """Insert members from VEKN"""
        async with self.conn.cursor() as cursor:
            # get existing VEKN, lock the table
            res = await cursor.execute(
                "SELECT vekn, uid FROM members WHERE vekn=ANY(%s) FOR UPDATE",
                [[m.vekn for m in members]],
            )
            existing = await res.fetchall()
            existing = {e[0]: e[1] for e in existing}
            # assign uids
            # note checking for duplicates is pointless: duplicate chance is lower than
            # the chance of a random gama flipping the test for its detection
            # the whole point of UUID in the first place is to allow this shortcut
            for m in members:
                m.uid = existing.get(m.vekn, str(uuid.uuid4()))
            # update existing
            # cannot run two prepared statements in parallel, just wait
            await cursor.executemany(
                "UPDATE members SET data=%s WHERE vekn=%s",
                [[jsonize(m), m.vekn] for m in members if m.vekn in existing],
            )
            # insert new
            await cursor.executemany(
                "INSERT INTO members (uid, vekn, data) VALUES (%s, %s, %s)",
                [
                    [uuid.UUID(m.uid), m.vekn, jsonize(m)]
                    for m in members
                    if m.vekn not in existing
                ],
            )

    async def insert_member(self, member: models.Member) -> models.Member:
        """Insert a new member"""
        # vekn must not be set
        member.vekn = ""
        async with self.conn.cursor() as cursor:
            # insert new
            await cursor.execute(
                "INSERT INTO members (uid, vekn, data) VALUES (%s, %s, %s)",
                [uuid.UUID(member.uid), "", jsonize(member)],
            )
            if cursor.rowcount < 1:
                raise RuntimeError("INSERT failed")
            return member

    async def get_member(self, uid: str, for_update=False) -> models.Member:
        """Get a member from their uid"""
        async with self.conn.cursor() as cursor:
            if for_update:
                query = "SELECT data FROM members WHERE uid=%s FOR UPDATE"
            else:
                query = "SELECT data FROM members WHERE uid=%s"
            res = await cursor.execute(query, [uuid.UUID(uid)])
            data = await res.fetchone()
            if data:
                return models.Member(**data[0])
            return None

    async def get_members(self) -> list[models.Member]:
        """Get all members"""
        async with self.conn.cursor() as cursor:
            res = await cursor.execute("SELECT data FROM members")
            return [models.Member(**data[0]) for data in await res.fetchall()]

    async def upsert_member_discord(self, user: models.DiscordUser) -> models.Member:
        """Get or create a member from their discord profile"""
        async with self.conn.cursor() as cursor:
            res = await cursor.execute(
                "SELECT data FROM members "
                "WHERE data -> 'discord' ->> 'id' = %s FOR UPDATE",
                [user.id],
            )
            data = await res.fetchone()
            if data:
                member = models.Member(**data[0])
                member.discord = user
                member.name = member.name or user.global_name or user.username
                member.nickname = member.nickname or user.global_name or user.username
                member.email = member.email or user.email
                if member.email == user.email:
                    member.verified = user.verified
                await cursor.execute(
                    "UPDATE members SET data=%s WHERE data -> 'discord' ->> 'id' = %s",
                    [jsonize(member), user.id],
                )
                if cursor.rowcount < 1:
                    raise RuntimeError(f"Failed to update Discord ID# {user.id}")
            else:
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
                    [uid, member.vekn, jsonize(member)],
                )
                if cursor.rowcount < 1:
                    raise RuntimeError("INSERT failed")
            return member

    async def update_member(self, member: models.Member) -> models.Member:
        async with self.conn.cursor() as cursor:
            await cursor.execute(
                "UPDATE members SET data=%s WHERE uid = %s",
                [jsonize(member), member.uid],
            )
            if cursor.rowcount < 1:
                raise RuntimeError(f"Failed to update member {member.uid}")
            return member

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
            member = models.Member(**data[1])
            if old_vekn == vekn:
                #  no change
                logger.warning("%s claiming %s but already has it", uid, vekn)
                return member

            res = await cursor.execute(
                "SELECT data FROM members WHERE vekn=%s FOR UPDATE", [vekn]
            )
            data = await res.fetchone()
            if not data:
                logger.warning("no VEKN record found for %s", vekn)
                return None
            vekn_member = models.Member(**data[0])
            if vekn_member.discord:
                if vekn_member.discord.id != member.discord.id:
                    logger.warning(
                        "VEKN %s already owned by %s", vekn, vekn_member.discord.id
                    )
                    return None
            # assign discord elements
            vekn_member.discord = member.discord
            vekn_member.nickname = member.nickname
            vekn_member.email = member.email
            vekn_member.verified = member.verified
            if old_vekn:
                logger.warning("%s claiming %s, previously had %s", uid, vekn, old_vekn)
                # reset old vekn member
                member.discord = None
                vekn_member.nickname = None
                vekn_member.email = None
                vekn_member.verified = False
                await cursor.execute(
                    "UPDATE members SET data=%s WHERE uid=%s",
                    [jsonize(vekn_member), uuid.UUID(uid)],
                )
                if cursor.rowcount < 1:
                    raise RuntimeError(f"Failed to update Member {uid}")
            else:
                # delete initial (non-vekn) member
                await cursor.execute("DELETE FROM members WHERE uid=%s", [uid])
            # update the VEKN record
            await cursor.execute(
                "UPDATE members SET data=%s WHERE vekn=%s",
                [jsonize(vekn_member), vekn],
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
            member = models.Member(**data[1])
            if not vekn:
                logger.warning("No vekn for %s, nothing to do", uid)
                return member
            new_member = models.Member(
                uid=str(uuid.uuid4()), vekn="", name=member.name, discord=member.discord
            )
            member.discord = None
            member.nickname = None
            member.email = None
            member.verified = False
            await cursor.execute(
                "UPDATE members SET data=%s WHERE uid=%s",
                [jsonize(member), uuid.UUID(uid)],
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
                    [uuid.UUID(new_member.uid), jsonize(new_member)],
                )
                logger.warning("New member created: %s - %s", new_member.uid, data)
            else:
                logger.warning("No discord detected! %s", member)
                return None
            return new_member


@contextlib.asynccontextmanager
async def operator() -> typing.AsyncIterator[Operator]:
    """Yields an async DB Operator to execute DB operations in a single transaction"""
    async with POOL.connection() as conn:
        yield Operator(conn)
