import contextlib
import dataclasses
import logging
import orjson
import os
import psycopg
import psycopg.rows
import psycopg.types.json
import psycopg_pool
import typing
import uuid

from . import models

logger = logging.getLogger()

DB_USER = os.getenv("DB_USER", "archon")
DB_PWD = os.getenv("DB_PWD", "")
CONNINFO = f"postgresql://{DB_USER}:{DB_PWD}@localhost/archondb"
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
                "data json)"
            )
            await cursor.execute(
                "CREATE TABLE IF NOT EXISTS tournaments("
                "uid UUID DEFAULT gen_random_uuid() PRIMARY KEY, "
                "organizer UUID REFERENCES members(uid), "
                "data json)"
            )


def reset():
    """Only called as a specific special-case CLI command, so not async"""
    with psycopg.connect(CONNINFO) as conn:
        with conn.cursor() as cursor:
            logger.warning("Reset DB")
            cursor.execute("DROP TABLE tournaments")
            cursor.execute("DROP TABLE members")


class Operator:
    """All async operations available for the API layer"""

    def __init__(self, conn: psycopg.AsyncConnection):
        self.conn = conn

    async def create_tournament(self, tournament: models.Tournament) -> uuid.UUID:
        """Create a tournament, returns its uid"""
        uid = uuid.uuid4()
        tournament.uid = str(uid)
        async with self.conn.cursor() as cursor:
            res = await cursor.execute(
                "INSERT INTO tournaments (uid, data) VALUES (%s, %s) RETURNING uid",
                [uid, psycopg.types.json.Json(dataclasses.asdict(tournament))],
            )
            return (await res.fetchone())[0]

    async def get_tournaments(self) -> list[models.Tournament]:
        """List all tournaments.
        TODO: paginate. We'll need an index on tournament.start
        """
        async with self.conn.cursor() as cursor:
            res = await cursor.execute("SELECT data FROM tournaments")
            return [models.Tournament(**row[0]) for row in await res.fetchall()]

    async def get_tournament(self, uid: str) -> models.Tournament:
        """Get a tournament by its uid"""
        async with self.conn.cursor() as cursor:
            res = await cursor.execute(
                "SELECT data FROM tournaments WHERE uid=%s", [uid]
            )
            return (await res.fetchone())[0]

    async def update_tournament(self, tournament: models.Tournament) -> uuid.UUID:
        """Update a tournament, returns its uid"""
        uid = uuid.UUID(tournament.uid)
        async with self.conn.cursor() as cursor:
            res = await cursor.execute(
                "UPDATE tournaments SET data=%s WHERE uid=%s",
                [psycopg.types.json.Json(dataclasses.asdict(tournament)), uid],
            )
            if res.rowcount < 1:
                raise KeyError(f"Tournament {uid} not found")
            return uid


@contextlib.asynccontextmanager
async def operator() -> typing.AsyncIterator[Operator]:
    """Yields an async DB Operator to execute DB operations in a single transaction"""
    async with POOL.connection() as conn:
        yield Operator(conn)
