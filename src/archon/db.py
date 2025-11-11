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
import psycopg.types.json
import psycopg_pool
import secrets
import textwrap
import typing
import uuid
import zoneinfo

from . import events
from . import geo
from . import models
from . import engine

LOG = logging.getLogger()

dotenv.load_dotenv()
DB_USER = os.getenv("DB_USER", "archon")
DB_PWD = os.getenv("DB_PWD", "")
CONNINFO = f"postgresql://{DB_USER}:{DB_PWD}@localhost/archondb"
HASH_KEY = base64.b64decode(os.getenv("HASH_KEY", ""))


psycopg.types.json.set_json_dumps(
    lambda o: orjson.dumps(o, option=orjson.OPT_NON_STR_KEYS)
)
psycopg.types.json.set_json_loads(orjson.loads)


def reconnect_failed(_pool: psycopg_pool.AsyncConnectionPool):
    LOG.error("Failed to reconnect to the PostgreSQL database")


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
        await conn.set_autocommit(True)
        async with conn.cursor() as cursor:
            LOG.debug("Initialising DB")
            # ################################################################## members
            await cursor.execute(
                "CREATE TABLE IF NOT EXISTS members("
                "uid UUID DEFAULT gen_random_uuid() PRIMARY KEY, "
                "vekn TEXT DEFAULT '', "
                "last_updated TIMESTAMP WITH TIME ZONE "
                "DEFAULT now(), "
                "data jsonb)"
            )
            # TODO; remove after migration
            await cursor.execute(
                "ALTER TABLE members "
                "ADD COLUMN IF NOT EXISTS "
                "last_updated TIMESTAMP WITH TIME ZONE DEFAULT now()"
            )
            # Unique index on discord ID
            await cursor.execute(
                "CREATE UNIQUE INDEX IF NOT EXISTS idx_member_discord_id "
                "ON members "
                "USING BTREE ((data -> 'discord' ->> 'id'::text))"
            )
            # Unique index on email
            # TODO remove after migration
            await cursor.execute("DROP INDEX IF EXISTS idx_member_email")
            await cursor.execute(
                "CREATE UNIQUE INDEX IF NOT EXISTS idx_member_email "
                "ON members "
                "USING BTREE ((data ->> 'email'::text)) "
                "WHERE (data->>'email') IS NOT NULL AND (data->>'email') <> ''::text "
            )
            # Index vekn ID#
            # TODO remove after migration
            await cursor.execute("DROP INDEX IF EXISTS idx_member_email")
            await cursor.execute(
                "CREATE UNIQUE INDEX IF NOT EXISTS idx_member_vekn "
                "ON members "
                "USING BTREE (vekn) "
                "WHERE vekn IS NOT NULL AND vekn <> ''::text "
            )
            # Indexes for fast ranking queries
            for category in models.RankingCategoy:
                await cursor.execute(
                    f"CREATE INDEX IF NOT EXISTS idx_member_ranking_{category.name} "
                    "ON members "
                    f"USING BTREE (((data -> 'ranking' -> '{category.value}')::int))"
                )
            # Index roles
            await cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_member_roles "
                "ON members "
                "USING GIN ((data -> 'roles'::text))"
            )
            # Trigram index for member names, for quick completion
            await cursor.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
            await cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_member_name_trgm "
                "ON members "
                "USING GIST ((data ->> 'name') gist_trgm_ops)"
            )
            # Index last_updated
            await cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_member_last_updated "
                "ON members "
                "USING BTREE (last_updated)"
            )
            # keep last_updated up to date automatically
            await cursor.execute(
                "CREATE OR REPLACE FUNCTION update_last_updated_if_changed() "
                "RETURNS TRIGGER AS $$ "
                "DECLARE "
                "new_json jsonb; "
                "old_json jsonb; "
                "BEGIN "
                "new_json := to_jsonb(NEW) - 'last_updated'; "
                "old_json := to_jsonb(OLD) - 'last_updated'; "
                ""
                "IF new_json IS DISTINCT FROM old_json THEN "
                "    NEW.last_updated = now(); "
                "END IF; "
                ""
                "RETURN NEW; "
                "END; "
                "$$ LANGUAGE plpgsql; "
            )
            await cursor.execute(
                "CREATE OR REPLACE TRIGGER set_last_updated "
                "BEFORE UPDATE ON members "
                "FOR EACH ROW "
                "EXECUTE FUNCTION update_last_updated_if_changed(); "
            )
            # log members deletions
            await cursor.execute(
                "CREATE TABLE IF NOT EXISTS member_deletions( "
                "uid UUID PRIMARY KEY, "
                "deleted_at TIMESTAMP WITH TIME ZONE)"
            )
            # Index deleted_at
            await cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_member_deletions_deleted_at "
                "ON member_deletions "
                "USING BTREE (deleted_at)"
            )
            await cursor.execute(
                "CREATE OR REPLACE FUNCTION log_member_deletion() "
                "RETURNS TRIGGER AS $$ "
                "BEGIN "
                "INSERT INTO member_deletions (uid, deleted_at) "
                "VALUES (OLD.uid, now()); "
                "RETURN OLD; "
                "END; "
                "$$ LANGUAGE plpgsql; "
            )
            await cursor.execute(
                "CREATE OR REPLACE TRIGGER track_member_deletion "
                "AFTER DELETE ON members "
                "FOR EACH ROW "
                "EXECUTE FUNCTION log_member_deletion()"
            )
            # ############################################################## tournaments
            await cursor.execute(
                "CREATE TABLE IF NOT EXISTS tournaments("
                "uid UUID DEFAULT gen_random_uuid() PRIMARY KEY, "
                "data jsonb)"
            )
            await cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_tournament_players "
                "ON tournaments "
                "USING GIN ((data->'players'::text))"
            )
            await cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_tournament_vekn "
                "ON tournaments "
                "USING BTREE ((data->'extra'->>'vekn_id'::text))"
            )
            # state indexation (used for rankings computation)
            await cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_tournament_state "
                "ON tournaments "
                "USING BTREE ((data->>'state'::text))"
            )
            # timetz function to help index tournaments by date
            await cursor.execute(
                "CREATE OR REPLACE FUNCTION timetz(text, text) RETURNS timestamptz "
                "AS $$select ($1 || ' ' || $2)::timestamptz$$ "
                "LANGUAGE SQL IMMUTABLE RETURNS NULL ON NULL INPUT"
            )
            # year extraction function for indexing
            await cursor.execute(
                "CREATE OR REPLACE FUNCTION year_from_timetz(text, text) RETURNS integer "
                "AS $$select EXTRACT(YEAR FROM ($1 || ' ' || $2)::timestamptz)::integer$$ "
                "LANGUAGE SQL IMMUTABLE RETURNS NULL ON NULL INPUT"
            )
            await cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_tournament_start "
                "ON tournaments "
                "USING BTREE ("
                "(timetz(data ->> 'start'::text, data ->> 'timezone'::text)), "
                "(uid::text)"
                ")"
            )
            await cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_tournament_year "
                "ON tournaments "
                "USING BTREE ((year_from_timetz(data ->> 'start', data ->> 'timezone')))"
            )
            await cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_tournament_name_trgm "
                "ON tournaments "
                "USING GIST ((data ->> 'name') gist_trgm_ops)"
            )
            await cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_tournament_country "
                "ON tournaments "
                "USING BTREE((data->>'country'::text))"
            )
            await cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_tournament_league "
                "ON tournaments "
                "USING BTREE((data->'league'->>'uid'::text))"
            )
            # ################################################################### league
            await cursor.execute(
                "CREATE TABLE IF NOT EXISTS leagues("
                "uid UUID DEFAULT gen_random_uuid() PRIMARY KEY, "
                "start TIMESTAMPTZ NOT NULL, "
                "finish TIMESTAMPTZ, "
                "data jsonb)"
            )
            await cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_league_start "
                "ON leagues "
                "USING BTREE ((start), (uid::text))"
            )
            await cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_league_finish "
                "ON leagues "
                "USING BTREE ((finish), (uid::text))"
            )
            await cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_league_parent "
                "ON leagues "
                "USING BTREE((data->'parent'->>'uid'::text))"
            )
            await cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_league_type "
                "ON leagues "
                "USING BTREE((data->>'kind'::text))"
            )
            # ################################################################## clients
            await cursor.execute(
                "CREATE TABLE IF NOT EXISTS clients("
                "uid UUID DEFAULT gen_random_uuid() PRIMARY KEY, "
                "secret_hash BYTEA,"
                "data jsonb)"
            )
            # ######################################################## tournament_events
            await cursor.execute(
                "CREATE TABLE IF NOT EXISTS tournament_events("
                "uid UUID PRIMARY KEY, "
                "timestamp TIMESTAMP WITH TIME ZONE NOT NULL, "
                "tournament_uid UUID REFERENCES tournaments(uid) ON DELETE CASCADE, "
                "member_uid UUID REFERENCES members(uid) ON DELETE SET NULL, "
                "data jsonb)"
            )
        await conn.set_autocommit(False)


class IsDataclass(typing.Protocol):
    # https://stackoverflow.com/a/55240861
    __dataclass_fields__: typing.ClassVar[dict[str, typing.Any]]


def jsonize(datacls: IsDataclass):
    return psycopg.types.json.Jsonb(dataclasses.asdict(datacls))


async def reset(keep_members: bool = True):
    """ONLY FROM CLI - LOSES ALL DATA"""
    async with POOL.connection() as conn:
        async with conn.cursor() as cursor:
            LOG.warning("Reset DB")
            await cursor.execute("DROP TABLE IF EXISTS tournament_events")
            await cursor.execute("DROP TABLE IF EXISTS tournaments")
            await cursor.execute("DROP TABLE IF EXISTS leagues")
            await cursor.execute("DROP TABLE IF EXISTS clients")
            if not keep_members:
                await cursor.execute("DROP TABLE IF EXISTS members")
                await cursor.execute("DROP TABLE IF EXISTS member_deletions")


T = typing.TypeVar("T", bound=models.TournamentMinimal)
P = typing.TypeVar("P", bound=models.PublicPerson)


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
                "INSERT INTO clients (uid, data) VALUES (%s, %s) RETURNING uid",
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

    async def get_client(self, client_uid: str) -> models.Client | None:
        """Get a client by uid"""
        async with self.conn.cursor() as cursor:
            res = await cursor.execute(
                "SELECT data FROM clients WHERE uid=%s",
                [client_uid],
            )
            data = await res.fetchone()
            if data:
                return self._instanciate(data[0], models.Client)
            return None

    async def get_all_clients(
        self, client_uids: list[str] = None
    ) -> list[models.Client]:
        """Get all clients"""
        async with self.conn.cursor() as cursor:
            Q = "SELECT data FROM clients"
            if client_uids:
                Q += " WHERE uid = ANY(%s)"
                args = [client_uids]
            else:
                args = []
            return [
                self._instanciate(row[0], models.Client)
                async for row in cursor.stream(Q, args)
            ]

    async def create_tournament(self, tournament: models.TournamentConfig) -> str:
        """Create a tournament, returns its uid"""
        uid = uuid.uuid4()
        tournament.uid = str(uid)
        async with self.conn.cursor() as cursor:
            res = await cursor.execute(
                "INSERT INTO tournaments (uid, data) VALUES (%s, %s) RETURNING uid",
                [uid, self._jsonize(tournament)],
            )
            return str((await res.fetchone())[0])

    async def upsert_vekn_tournament(self, tournament: models.Tournament) -> str:
        """Insert or update a VEKN tournament.
        Note if it was ours to begin with (and synced down to VEKN when finished),
        we don't sync anything from VEKN.
        """
        async with self.conn.cursor() as cursor:
            res = await cursor.execute(
                "SELECT data FROM tournaments "
                "WHERE data->'extra'->>'vekn_id'::text = %s "
                "FOR UPDATE",
                [tournament.extra.get("vekn_id")],
            )
            data = await res.fetchone()
            if data:
                # TODO remove the "external" check once the vekn sync is stabilized
                # we don't want to overwrite, see update tournament
                # we overwrite tournaments finished in vekn archon and not here
                if not data[0]["extra"].get("external") and (
                    not tournament.state == models.TournamentState.FINISHED
                    or data[0]["state"] == models.TournamentState.FINISHED
                ):
                    return
                uid = uuid.UUID(data[0]["uid"])
                tournament.uid = str(uid)
                tournament.extra["external"] = True
                res = await cursor.execute(
                    "UPDATE tournaments SET data=%s WHERE uid=%s",
                    [self._jsonize(tournament), uid],
                )
                return str(uid)
            else:
                uid = uuid.uuid4()
                tournament.uid = str(uid)
                tournament.extra["external"] = True
                res = await cursor.execute(
                    "INSERT INTO tournaments (uid, data) VALUES (%s, %s) RETURNING uid",
                    [uid, self._jsonize(tournament)],
                )
                return str((await res.fetchone())[0])

    async def get_tournaments(
        self,
        filter: models.TournamentFilter | None = None,
    ) -> tuple[models.TournamentFilter, list[models.TournamentMinimal]]:
        """List all tournaments with minimal information"""
        Q = (
            "SELECT "
            "(data ->> 'name') AS name, "
            "(data ->> 'format') AS format, "
            "(data ->> 'start') AS start, "
            "(data ->> 'finish') AS finish, "
            "(data ->> 'timezone') AS timezone, "
            "(uid::text) AS uid, "
            "(data ->> 'country') AS country, "
            "(data ->> 'country_iso') AS country_iso, "
            "(data ->> 'online') AS online, "
            "(data -> 'league') AS league, "
            "(data ->> 'rank') AS rank, "
            "(data ->> 'state') AS state "
            "FROM tournaments"
        )
        pieces = []
        args = []
        if filter:
            # Note: bad practice to use OFFSET, it becomes inefficient the larger it is
            # using cursor in the WHERE clause with the appropriate index is the way.
            Q += " WHERE "
            if filter.uid:
                pieces.append(
                    "(timetz(data ->> 'start', data ->> 'timezone') < %s::timestamptz "
                    "OR ("
                    "timetz(data ->> 'start', data ->> 'timezone') = %s::timestamptz "
                    "AND uid < %s))"
                )
                args.extend([filter.date, filter.date, uuid.UUID(filter.uid)])
            if filter.country:
                pieces.append(
                    "(data ->> 'country' IS NULL OR data ->> 'country' IN ('', %s))"
                )
                args.append(filter.country)
            if not filter.online:
                pieces.append("(data ->> 'online')::boolean IS FALSE")
            if filter.states:
                pieces.append("data ->> 'state' = ANY(%s)")
                args.append(filter.states)
            if filter.member_uid:
                pieces.append("(data->'players' ? %s OR data->'judges' @> %s)")
                args.extend(
                    [
                        filter.member_uid,
                        psycopg.types.json.Jsonb([{"uid": filter.member_uid}]),
                    ]
                )
            if filter.year:
                pieces.append(
                    "year_from_timetz(data ->> 'start', data ->> 'timezone') = %s"
                )
                args.append(filter.year)
            if filter.name and len(filter.name) > 2:
                pieces.append("data ->> 'name' ILIKE %s")
                args.append(f"%{filter.name}%")
        Q += " AND ".join(pieces)
        Q += (
            " ORDER BY timetz(data ->> 'start', data ->> 'timezone') DESC, uid DESC "
            "LIMIT 100"
        )
        async with self.conn.cursor(row_factory=psycopg.rows.dict_row) as cursor:
            ret = [
                self._instanciate(row, models.TournamentMinimal)
                async for row in cursor.stream(Q, args)
            ]
            ret_filter = models.TournamentFilter()
            if filter:
                ret_filter.country = filter.country
                ret_filter.online = filter.online
                ret_filter.states = filter.states
                ret_filter.member_uid = filter.member_uid
                ret_filter.year = filter.year
                ret_filter.name = filter.name
            if ret and len(ret) == 100:
                ret_filter.date = ret[-1].start.isoformat() + " " + ret[-1].timezone
                ret_filter.uid = ret[-1].uid
            return (ret_filter, ret)

    async def get_tournament(
        self, uid: str, for_update=False, cls: typing.Type[T] = models.Tournament
    ) -> T:
        """Get a tournament by its uid, None if not found"""
        async with self.conn.cursor() as cursor:
            Q = "SELECT data FROM tournaments WHERE uid=%s"
            if for_update:
                Q += " FOR UPDATE"
            res = await cursor.execute(Q, [uuid.UUID(uid)])
            data = await res.fetchone()
            if not data:
                return None
            return self._instanciate(data[0], cls)

    async def venue_completion(self, country: str) -> list[models.VenueCompletion]:
        """Get recent venues in given country"""
        Q = (
            "SELECT "
            "data->>'venue', "
            "data->>'venue_url', "
            "data->>'address', "
            "data->>'map_url' "
            "FROM tournaments "
            "WHERE timetz(data->>'start', data->>'timezone') > %s::timestamptz "
        )
        cutoff = datetime.datetime.now()
        cutoff = cutoff.replace(year=cutoff.year - 3)
        args = [cutoff.isoformat()]
        if country:
            Q += "AND data->>'country'=%s "
            args.append(country)
        else:
            Q += "AND (data->>'country' IS NULL OR data->>'country'='') "
        Q += "ORDER BY timetz(data->>'start', data->>'timezone') DESC"
        async with self.conn.cursor() as cursor:
            return [
                models.VenueCompletion(*row) async for row in cursor.stream(Q, args)
            ]

    async def update_tournament(self, tournament: models.Tournament) -> str:
        """Update a tournament, returns its uid"""
        uid = uuid.UUID(tournament.uid)
        async with self.conn.cursor() as cursor:
            # if we update it, we take ownership
            # TODO: remove once we become source of truth
            tournament.extra.pop("external", None)
            # denormalize ratings inside the tournament object itself
            # for any update on a finished tournament
            tournament_ratings = {}
            if tournament.state == models.TournamentState.FINISHED:
                tournament_ratings = engine.ratings(tournament)
                for player in tournament.players.values():
                    if rating := tournament_ratings.get(player.uid):
                        player.rating_points = rating.rating_points
                    else:
                        player.rating_points = None
            res = await cursor.execute(
                "UPDATE tournaments SET data=%s WHERE uid=%s",
                [self._jsonize(tournament), uid],
            )
            if res.rowcount < 1:
                raise KeyError(f"Tournament {uid} not found")
            if tournament_ratings:
                await cursor.executemany(
                    f"""UPDATE members
                    SET data=jsonb_set(data, '{{ratings,{tournament.uid}}}', %s, true)
                    WHERE uid=%s
                    """,
                    [
                        [jsonize(rating), uuid.UUID(uid)]
                        for uid, rating in tournament_ratings.items()
                    ],
                )
            return str(uid)

    async def delete_tournament(self, uid: str) -> None:
        """Delete a tournament"""
        async with self.conn.cursor() as cursor:
            # take a lock on the tournament
            await cursor.execute(
                "SELECT uid FROM tournaments WHERE uid=%s FOR UPDATE", [uuid.UUID(uid)]
            )
            res = await cursor.execute(
                "SELECT jsonb_object_keys(data->'players') "
                "FROM tournaments WHERE uid=%s",  # no FOR UPDATE allowed because of aggregate
                [uuid.UUID(uid)],
            )
            player_uids = await res.fetchall()
            res = await cursor.execute(
                "DELETE FROM tournaments WHERE uid=%s", [uuid.UUID(uid)]
            )
            if res.rowcount < 1:
                raise KeyError(f"Tournament {uid} not found")
            await cursor.executemany(
                f"""UPDATE members 
                    SET data=jsonb_set(data, '{{ratings}}', (data->'ratings') - '{uid}') 
                    WHERE uid=%s
                    """,
                [[uuid.UUID(p)] for p in player_uids],
            )

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

    async def close_old_tournaments(self) -> int:
        """Close tournaments that are > 30 days old and not finished.
        Returns the number of tournaments closed.
        """
        cutoff = datetime.datetime.now(datetime.timezone.utc)
        cutoff -= datetime.timedelta(days=30)
        async with self.conn.cursor() as cursor:
            res = await cursor.execute(
                "UPDATE tournaments "
                "SET data = jsonb_set(data, '{state}', %s) "
                "WHERE data->>'state' != %s "
                "AND timetz(data ->> 'start', data ->> 'timezone') < %s",
                [
                    psycopg.types.json.Jsonb(models.TournamentState.FINISHED),
                    models.TournamentState.FINISHED,
                    cutoff,
                ],
            )
            return res.rowcount

    async def insert_members(self, members: list[models.Member]) -> None:
        """Insert members from VEKN.
        Modify the members list in place to match DB (ie. uuids).
        """
        async with self.conn.cursor() as cursor:
            # get existing VEKN, lock the table
            res = await cursor.execute(
                "SELECT vekn FROM members WHERE vekn=ANY(%s)",
                [[m.vekn for m in members]],
            )
            existing = {e[0] for e in await res.fetchall()}
            # do not overwrite existing members
            members = [m for m in members if m.vekn not in existing]
            # insert new
            await cursor.executemany(
                "INSERT INTO members (uid, vekn, data) VALUES (%s, %s, %s)",
                [
                    [uuid.UUID(m.uid), m.vekn, self._jsonize(m)]
                    for m in members
                    if m.vekn not in existing
                ],
            )

    async def insert_member(self, member: P) -> P:
        """Insert a new member"""
        # vekn must not be set
        member.vekn = ""
        async with self.conn.cursor() as cursor, member_consistency():
            # insert new
            await cursor.execute(
                "INSERT INTO members (uid, data) VALUES (%s, %s)",
                [uuid.UUID(member.uid), self._jsonize(member)],
            )
            if cursor.rowcount < 1:
                raise RuntimeError("INSERT failed")
            return member

    async def get_member(
        self, uid: str, for_update=False, cls: typing.Type[P] = models.Member
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
                return self._instanciate(data[0], cls)
            return None

    async def get_members(self, uids: list[str]) -> list[models.PublicPerson]:
        """Get multiple members by UID"""
        async with self.conn.cursor() as cursor:
            return [
                self._instanciate(row[0], models.PublicPerson)
                async for row in cursor.stream(
                    "SELECT data FROM members WHERE uid = ANY(%s)", [uids]
                )
            ]

    async def get_members_since(
        self, timestamp: datetime.datetime, vekn_only: bool
    ) -> tuple[datetime.datetime, models.PersonsUpdate]:
        async with self.conn.cursor() as cursor:
            Q = "SELECT last_updated, data FROM members WHERE last_updated > %s"
            if vekn_only:
                Q += " AND vekn IS NOT NULL AND vekn <> ''"
            updated = await cursor.execute(
                Q,
                [timestamp],
            )
            updated = await updated.fetchall()
            deleted = await cursor.execute(
                "SELECT deleted_at, uid FROM member_deletions WHERE deleted_at > %s",
                [timestamp],
            )
            deleted = await deleted.fetchall()
            if deleted or updated:
                last_modified = max(
                    datetime.datetime.min.replace(tzinfo=datetime.timezone.utc),
                    *(row[0] for row in updated),
                    *(row[0] for row in deleted),
                )
                LOG.info("last modified from DB: %s", last_modified)
            else:
                return None, None
            return last_modified, models.PersonsUpdate(
                update=[self._instanciate(row[1], models.Person) for row in updated],
                delete=[str(row[1]) for row in deleted],
            )

    async def get_members_generator(
        self, vekn_only: bool
    ) -> tuple[
        datetime.datetime,
        typing.Callable[[None], typing.AsyncGenerator[models.Person, None]],
    ]:
        """Streams all members. returns a 'fuzzy' timestamp in the past."""
        if not self.conn.autocommit:
            raise RuntimeError(
                "Operator.get_members_generator() can only be called in autocommit mode"
            )
        async with self.conn.cursor() as cursor:
            timestamp_data = await cursor.execute(
                "SELECT (now() - INTERVAL '1 hour')::timestamptz"
            )
            timestamp = (await timestamp_data.fetchone())[0]
        Q = "SELECT data FROM members"
        if vekn_only:
            Q += " WHERE vekn IS NOT NULL AND vekn <> ''"

        async def generator():
            async with self.conn.cursor() as cursor:
                await cursor.execute("SET statement_timeout='120s'")
                async for row in cursor.stream(Q):
                    yield self._instanciate(row[0], models.Person)

        return timestamp, generator

    async def get_ranked_members(
        self, category: models.RankingCategoy
    ) -> list[models.Person]:
        """Get members with a prominant rank in a category"""
        async with self.conn.cursor() as cursor:
            return [
                self._instanciate(data[0], models.Person)
                async for data in cursor.stream(
                    "SELECT data FROM members "
                    f"WHERE (data->'ranking'->'{category.value}')::int IS NOT NULL "
                    f"ORDER BY (data->'ranking'->'{category.value}')::int DESC "
                    "LIMIT 600"
                )
            ]

    async def get_members_vekn_dict(self) -> dict[str, models.Person]:
        """Get all members with a VEKN"""
        if not self.conn.autocommit:
            raise RuntimeError(
                "Operator.get_members_vekn_dict() can only be called in autocommit mode"
            )
        async with self.conn.cursor() as cursor:
            await cursor.execute("SET statement_timeout='120s'")
            return {
                data[0]: self._instanciate(data[1], models.Person)
                async for data in cursor.stream(
                    "SELECT vekn, data FROM members WHERE vekn <> ''"
                )
            }

    async def get_externally_visible_members(
        self, user: models.Person
    ) -> list[models.PublicPerson]:
        """Get all members that can be contacted by non-vekn members"""
        async with self.conn.cursor() as cursor:
            return [
                self._instanciate(data[0], models.PublicPerson)
                async for data in cursor.stream(
                    "SELECT data FROM members "
                    "WHERE data->'roles' ? 'NC' OR data->'roles' ? 'Prince' OR uid=%s",
                    [user.uid],
                )
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
            member = self._instanciate(data[0], models.Member)
            self._update_discord_data(member, user)
            await cursor.execute(
                "UPDATE members SET data=%s WHERE uid = %s",
                [self._jsonize(member), uuid.UUID(member_uid)],
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
                member = self._instanciate(data[0], models.Member)
                self._update_discord_data(member, user)
                await cursor.execute(
                    "UPDATE members SET data=%s WHERE data -> 'discord' ->> 'id' = %s",
                    [self._jsonize(member), user.id],
                )
                if cursor.rowcount < 1:
                    raise RuntimeError(f"Failed to update Discord ID# {user.id}")
                return member
            # if the email exists already, use it
            if user.email:
                res = await cursor.execute(
                    "SELECT data FROM members WHERE data ->> 'email' = %s FOR UPDATE",
                    [user.email],
                )
                data = await res.fetchone()
                if data:
                    member = self._instanciate(data[0], models.Member)
                    self._update_discord_data(member, user)
                    await cursor.execute(
                        "UPDATE members SET data=%s WHERE data ->> 'email' = %s",
                        [self._jsonize(member), user.email],
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
                [uid, member.vekn, self._jsonize(member)],
            )
            if cursor.rowcount < 1:
                raise RuntimeError("INSERT failed")
            return member

    async def upsert_member_email(self, email: str) -> models.Member:
        async with self.conn.cursor() as cursor, member_consistency():
            res = await cursor.execute(
                "SELECT data FROM members WHERE data ->> 'email' = %s FOR UPDATE",
                [email],
            )
            data = await res.fetchone()
            if data:
                member = self._instanciate(data[0], models.Member)
                member.verified = True
                await cursor.execute(
                    "UPDATE members SET data=%s WHERE data ->> 'email' = %s",
                    [self._jsonize(member), email],
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
                    [uid, member.vekn, self._jsonize(member)],
                )
                if cursor.rowcount < 1:
                    raise RuntimeError("INSERT failed")
            return member

    async def get_member_by_email(self, email: str) -> models.Member:
        async with self.conn.cursor() as cursor:
            res = await cursor.execute(
                "SELECT data FROM members WHERE data ->> 'email' = %s",
                [email],
            )
            data = await res.fetchone()
            if data:
                member = self._instanciate(data[0], models.Member)
                return member
            raise NotFound(f"Member not found by email: {email}")

    async def update_member(self, member: P) -> P:
        async with self.conn.cursor() as cursor, member_consistency():
            await cursor.execute(
                "UPDATE members SET data=%s WHERE uid=%s",
                [self._jsonize(member), member.uid],
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
                textwrap.dedent(
                    """
                    WITH next_vekn AS ((
                            SELECT (vekn::int + 1)::text AS value
                            FROM members
                            WHERE vekn <> '' AND vekn::int >= 1000000
                        ) EXCEPT (
                            SELECT vekn FROM members 
                        ) LIMIT 1
                    )
                    UPDATE members
                    SET (vekn, data) = (
                        next_vekn.value, 
                        jsonb_set(data, '{vekn}', to_jsonb(next_vekn.value))
                    )
                    FROM next_vekn
                    WHERE uid = %s AND vekn = ''
                    RETURNING vekn"""
                ),
                [uuid.UUID(member.uid)],
            )
            data = await res.fetchone()
            if not data:
                raise RuntimeError(f"Failed to assign a new VEKN to {member.uid}")
            member.vekn = data[0]
            # also set the vekn in all tournaments the player has been in
            await cursor.execute(
                f"""UPDATE tournaments
                SET data=jsonb_set(data, '{{players,{member.uid},vekn}}', %s, false)
                WHERE data->'players' ? %s
                """,
                [psycopg.types.json.Jsonb(member.vekn), member.uid],
            )
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
            member = self._instanciate(data[1], models.Member)
            if old_vekn == vekn:
                #  no change
                LOG.info("%s claiming %s but already has it", uid, vekn)
                return member
            if old_vekn:
                LOG.warning("%s claiming %s, previously had %s", uid, vekn, old_vekn)
                raise RuntimeError("Cannot claim a VEKN: already has one")
            res = await cursor.execute(
                "SELECT data FROM members WHERE vekn=%s FOR UPDATE", [vekn]
            )
            data = await res.fetchone()
            if not data:
                LOG.warning("no VEKN record found for %s", vekn)
                return None
            vekn_member = self._instanciate(data[0], models.Member)
            if vekn_member.discord:
                if vekn_member.discord.id != member.discord.id:
                    LOG.warning(
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
                [self._jsonize(vekn_member), vekn],
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
                LOG.warning("User not found: %s", uid)
                return None
            vekn = data[0]
            member = self._instanciate(data[1], models.Member)
            if not vekn:
                LOG.info("No vekn for %s, nothing to do", uid)
                return member
            new_member = models.Member(**dataclasses.asdict(member))
            new_uid = uuid.uuid4()
            new_member.vekn = ""
            new_member.roles = []
            new_member.sanctions = []
            new_member.ranking = {}
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
                [self._jsonize(member), uuid.UUID(uid)],
            )
            if cursor.rowcount < 1:
                raise RuntimeError(f"Failed to find Member {uid}")
            LOG.debug("Old member updated: %s", uid)
            if new_member.discord:
                nick = new_member.discord.global_name or new_member.discord.username
                new_member.name = nick
                new_member.nickname = nick
                new_member.email = new_member.discord.email
                new_member.verified = new_member.discord.verified
            await cursor.execute(
                "INSERT INTO members (uid, data) VALUES (%s, %s)",
                [new_uid, self._jsonize(new_member)],
            )
            LOG.debug("New member created: %s - %s", new_member.uid, data)
            return new_member

    async def set_sponsor_on_prefix(self, prefix: str, sponsor_uid: str):
        async with self.conn.cursor() as cursor:
            res = await cursor.execute(
                "SELECT data FROM members WHERE vekn LIKE %s FOR UPDATE",
                [prefix.replace("%", "") + "%"],
            )
            recruits = [
                self._instanciate(data[0], models.Member)
                for data in await res.fetchall()
            ]
            for recruit in recruits:
                recruit.sponsor = sponsor_uid
            await cursor.executemany(
                "UPDATE members SET data=%s WHERE uid=%s",
                [[self._jsonize(m), uuid.UUID(m.uid)] for m in recruits],
            )

    async def recompute_all_ratings(self):
        # Make sur not to lock everything - no transaction should be running
        if not self.conn.autocommit:
            raise RuntimeError(
                "Operator.recompute_all_ratings() can only be called in autocommit mode"
            )
        async with self.conn.cursor() as cursor:
            # prevent statement timeout: we are streaming a lot of tournaments here
            await cursor.execute("SET statement_timeout='120s'")
            # first get all the tournaments and compute the ratings for everyone
            res = cursor.stream(
                """SELECT data FROM tournaments
                WHERE data->>'state'::text = %s
                """,
                [models.TournamentState.FINISHED],
            )
            all_ratings: dict[str, dict[str, models.TournamentRating]] = (
                collections.defaultdict(dict)
            )
            async for row in res:
                tournament = self._instanciate(row[0], models.Tournament)
                for uid, rating in engine.ratings(tournament).items():
                    all_ratings[uid][tournament.uid] = rating
            # compute ranking cutoff: 18 months before today (UTC) at 00:00
            cutoff = datetime.datetime.now(datetime.timezone.utc)
            cutoff = cutoff.replace(hour=0, minute=0, second=0, microsecond=0)
            cutoff = cutoff.replace(year=cutoff.year - 1)
            if cutoff.month > 6:
                cutoff = cutoff.replace(month=cutoff.month - 6)
            else:
                cutoff = cutoff.replace(year=cutoff.year - 1)
                cutoff = cutoff.replace(month=cutoff.month + 6)
            # build a temporary staging table for ratings and rankings
            await cursor.execute(
                "CREATE TEMP TABLE staging_ratings ( uid UUID PRIMARY KEY, data JSONB )"
            )
            async with cursor.copy(
                "COPY staging_ratings (uid, data) FROM STDIN"
            ) as copy:
                while all_ratings:
                    uid, ratings = all_ratings.popitem()
                    # compute ranking from ratings
                    ranking = collections.defaultdict(list)
                    for rating in ratings.values():
                        # ignore tournaments before cutoff
                        if (
                            rating.tournament.start.replace(
                                tzinfo=zoneinfo.ZoneInfo(tournament.timezone)
                            )
                            < cutoff
                        ):
                            continue
                        if rating.tournament.format in [
                            models.TournamentFormat.Standard,
                            models.TournamentFormat.V5,
                        ]:
                            if rating.tournament.online:
                                category = models.RankingCategoy.CONSTRUCTED_ONLINE
                            else:
                                category = models.RankingCategoy.CONSTRUCTED_ONSITE
                        else:
                            if rating.tournament.online:
                                category = models.RankingCategoy.LIMITED_ONLINE
                            else:
                                category = models.RankingCategoy.LIMITED_ONSITE
                        ranking[category].append(rating.rating_points)
                    data = psycopg.types.json.Jsonb(
                        {
                            "ratings": {
                                k: dataclasses.asdict(v) for k, v in ratings.items()
                            },
                            "ranking": {
                                # take top 8
                                category: sum(sorted(r, reverse=True)[:8])
                                for category, r in ranking.items()
                                if r
                            },
                        }
                    )
                    await copy.write_row([uid, data])
            # use staging to update members, then drop staging
            # note we need a clean update to avoid triggering last_updated unnecessarily
            await cursor.execute(
                "UPDATE members m "
                "SET data = m.data || s.data "
                "FROM staging_ratings s "
                "WHERE m.uid = s.uid "
            )
            await cursor.execute(
                "UPDATE members m "
                """SET data = data || '{"ratings": {}, "ranking": {}}'::jsonb """
                "WHERE m.uid NOT IN (SELECT uid FROM staging_ratings)"
            )
            await cursor.execute("DROP TABLE staging_ratings")

    def _jsonize(self, obj: any):
        data = dataclasses.asdict(obj)
        if "country" in data:
            if data["country"]:
                country = geo.COUNTRIES_BY_NAME[data["country"]]
                data["country_flag"] = country.flag
                data["country_iso"] = country.iso
                data["country_geoname_id"] = country.geoname_id
            else:
                data.pop("country", None)
                data.pop("city", None)
        else:
            data.pop("city", None)
        if "city" in data:
            cities = geo.CITIES_BY_COUNTRY.get(data["country"], {})
            geocity = cities.get(data["city"], None)
            if geocity:
                data["city_geoname_id"] = geocity.geoname_id
            else:
                data.pop("city", None)
        return psycopg.types.json.Jsonb(data)

    def _instanciate(self, data: dict, cls: typing.Type[T]) -> T:
        if "country_iso" in data and data["country_iso"] in geo.COUNTRIES_BY_ISO:
            country = geo.COUNTRIES_BY_ISO[data["country_iso"]]
            data["country"] = country.country
            data["country_flag"] = country.flag
        if (
            "city_geoname_id" in data
            and data["city_geoname_id"] in geo.CITIES_BY_GEONAME_ID
        ):
            data["city"] = geo.CITIES_BY_GEONAME_ID[data["city_geoname_id"]].unique_name
        else:
            data.pop("city", None)
        return cls(**data)

    async def create_league(self, league: models.League) -> str:
        """Create a league, returns its uid (validation done at API layer)"""
        uid = uuid.uuid4()
        league.uid = str(uid)
        async with self.conn.cursor() as cursor:
            res = await cursor.execute(
                "INSERT INTO leagues (uid, start, finish, data) "
                "VALUES (%s, %s, %s, %s) RETURNING uid",
                [uid, league.start, league.finish, self._jsonize(league)],
            )
            return str((await res.fetchone())[0])

    async def get_league(self, uid: str) -> models.League:
        """Get a single league for update (locks)"""
        async with self.conn.cursor() as cursor:
            res = await cursor.execute(
                "SELECT data FROM leagues WHERE uid=%s FOR UPDATE", [uuid.UUID(uid)]
            )
            data = await res.fetchone()
            if not data:
                raise NotFound("League %s not found", uid)
            return self._instanciate(data[0], models.League)

    async def get_league_with_tournaments(
        self, uid: str
    ) -> models.LeagueWithTournaments:
        """Get a league, with tournaments, sub-leagues and ranking data

        For META leagues, this includes tournaments from child leagues.
        """
        async with self.conn.cursor() as cursor:
            res = await cursor.execute(
                "SELECT data FROM leagues WHERE uid=%s", [uuid.UUID(uid)]
            )
            data = await res.fetchone()
            if not data:
                raise NotFound("League %s not found", uid)
            league: models.LeagueWithTournaments = self._instanciate(
                data[0], models.LeagueWithTournaments
            )
            # get child leagues if this is a meta-league
            res = await cursor.execute(
                "SELECT data FROM leagues "
                "WHERE (data->'parent'->>'uid')::text=%s "
                "ORDER BY start DESC",
                [uid],
            )
            child_leagues = await res.fetchall()
            child_league_uids = [uid]  # include parent league itself
            for row in child_leagues:
                child_league = self._instanciate(row[0], models.LeagueMinimal)
                league.leagues.append(child_league)
                child_league_uids.append(child_league.uid)

            # get tournaments from this league and all child leagues, latest first
            res = await cursor.execute(
                "SELECT data FROM tournaments "
                "WHERE (data->'league'->>'uid')::text = ANY(%s) "
                "ORDER BY timetz(data ->> 'start', data ->> 'timezone') DESC",
                [child_league_uids],
            )
            tournaments = await res.fetchall()
            for row in tournaments:
                league.tournaments.append(
                    self._instanciate(row[0], models.TournamentInfo)
                )
            # count points
            players: dict[str, models.LeaguePlayer] = {}
            for tournament in league.tournaments:
                if tournament.state != models.TournamentState.FINISHED:
                    continue
                ratings = engine.ratings(tournament)
                finals_score = {
                    seat.player_uid: seat.result
                    for seat in tournament.rounds[-1].tables[0].seating
                }
                for player in tournament.players.values():
                    if player.uid not in players:
                        players[player.uid] = models.LeaguePlayer(
                            name=player.name,
                            uid=player.uid,
                            city=player.city,
                            country=player.country,
                            country_flag=player.country_flag,
                            vekn=player.vekn,
                        )
                    players[player.uid].tournaments.append(tournament.uid)
                    players[player.uid].score += player.result
                    # leagues subtelty: do not count finals score
                    # if we're opting for score, it's to avoid favoring finalists
                    # and instead encourage participation more than with RTPs
                    if player.uid in finals_score:
                        players[player.uid].score -= finals_score[player.uid]
                    players[player.uid].points = 0
                    # some players are not in ratings (registerd but did not play)
                    if player.uid in ratings:
                        match league.ranking:
                            case models.LeagueRanking.RTP:
                                players[player.uid].points += ratings[
                                    player.uid
                                ].rating_points
                            case models.LeagueRanking.GP:
                                players[player.uid].points += ratings[
                                    player.uid
                                ].gp_points

            match league.ranking:
                case models.LeagueRanking.RTP:
                    key = "points"
                case models.LeagueRanking.GP:
                    key = "points"
                case models.LeagueRanking.Score:
                    key = "score"

            def sort(p):
                return getattr(p, key)

            sorted_players = sorted(players.values(), key=sort, reverse=True)
            rank, passed, points = 1, 0, None
            for player in sorted_players:
                if points is None or sort(player) < points:
                    rank += passed
                    points = sort(player)
                    passed = 0
                league.rankings.append((rank, player))
                passed += 1
            return league

    async def update_league(self, league: models.League) -> str:
        """Update a league, returns its uid (validation done at API layer)"""
        uid = uuid.UUID(league.uid)
        async with self.conn.cursor() as cursor:
            res = await cursor.execute(
                "UPDATE leagues SET (start, finish, data)=(%s, %s, %s) WHERE uid=%s",
                [league.start, league.finish, self._jsonize(league), uid],
            )
            if res.rowcount < 1:
                raise KeyError(f"League {uid} not found")
            return str(uid)

    async def delete_league(self, uid: str) -> str:
        """Delete a league"""
        async with self.conn.cursor() as cursor:
            res = await cursor.execute(
                "DELETE FROM leagues WHERE uid=%s", [uuid.UUID(uid)]
            )
            if res.rowcount < 1:
                raise KeyError(f"League {uid} not found")
            await cursor.execute(
                "UPDATE tournaments SET data->>'league' = NULL::jsonb "
                "WHERE data->'league'->>'uid'::text = %s",
                [uid],
            )

    async def get_leagues(
        self, filter: models.LeagueFilter | None
    ) -> list[models.LeagueMinimal]:
        """Get paginated leagues, filtered and ordered by start date, 100 per page"""
        Q = "SELECT data FROM leagues "
        pieces, args = [], []
        if filter:
            # Note: bad practice to use OFFSET, it becomes inefficient the larger it is
            # using cursor in the WHERE clause with the appropriate index is the way.
            Q += "WHERE "
            if filter.uid:
                pieces.append(
                    "(timetz(data ->> 'start', data ->> 'timezone') < %s::timestamptz "
                    "OR ("
                    "timetz(data ->> 'start', data ->> 'timezone') = %s::timestamptz "
                    "AND uid < %s))"
                )
                args.extend([filter.date, filter.date, uuid.UUID(filter.uid)])
            if filter.country:
                pieces.append(
                    "(data ->> 'country' IS NULL OR data ->> 'country' IN ('', %s))"
                )
                args.append(filter.country)
            if not filter.online:
                pieces.append("(data ->> 'online')::boolean IS FALSE")
            Q += " AND ".join(pieces)
        Q += (
            " ORDER BY timetz(data ->> 'start', data ->> 'timezone') DESC, uid DESC "
            "LIMIT 100"
        )
        async with self.conn.cursor() as cursor:
            ret = [
                self._instanciate(row[0], models.LeagueMinimal)
                async for row in cursor.stream(Q, args)
            ]
            ret_filter = models.LeagueFilter()
            if filter:
                ret_filter.country = filter.country
                ret_filter.online = filter.online
            if ret and len(ret) == 100:
                ret_filter.date = ret[-1].start.isoformat() + " " + ret[-1].timezone
                ret_filter.uid = ret[-1].uid
            return (ret_filter, ret)

    async def get_minimal_leagues(
        self, kind: models.LeagueKind | None = None
    ) -> list[models.LeagueMinimal]:
        """Get minimal leagues, optionally filtered by type, ordered by start date"""
        if kind:
            # Filter by specific league type
            Q = (
                "SELECT data FROM leagues "
                "WHERE (data->>'kind')::text = %s "
                "ORDER BY timetz(data ->> 'start', data ->> 'timezone') DESC, uid DESC"
            )
            async with self.conn.cursor() as cursor:
                return [
                    self._instanciate(row[0], models.LeagueMinimal)
                    async for row in cursor.stream(Q, [kind.value])
                ]
        else:
            # Return all leagues
            Q = (
                "SELECT data FROM leagues "
                "ORDER BY timetz(data ->> 'start', data ->> 'timezone') DESC, uid DESC"
            )
            async with self.conn.cursor() as cursor:
                return [
                    self._instanciate(row[0], models.LeagueMinimal)
                    async for row in cursor.stream(Q)
                ]


@contextlib.asynccontextmanager
async def operator(autocommit: bool = False) -> typing.AsyncIterator[Operator]:
    """Yields an async DB Operator to execute DB operations.

    Does not use a transaction if autocommit=True
    """
    async with POOL.connection() as conn:
        try:
            if autocommit:
                await conn.set_autocommit(True)
            yield Operator(conn)
        finally:
            if autocommit:
                await conn.set_autocommit(False)
