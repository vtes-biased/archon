import contextlib
import dataclasses
import logging
import orjson
import os
import psycopg
import psycopg.rows
import psycopg.types.json
import psycopg_pool

from . import models

logger = logging.getLogger()

DB_USER = os.getenv("DB_USER", "archon")
DB_PWD = os.getenv("DB_PWD", "")
CONNINFO = f"postgresql://{DB_USER}:{DB_PWD}@localhost/archon"
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
            cursor.execute("DROP TABLE members")
            cursor.execute("DROP TABLE tournaments")


class Operator:
    def __init__(self, conn: psycopg.AsyncConnection):
        self.conn = conn

    async def create_tournament(self, tournament: models.Tournament) -> None:
        async with self.conn.cursor() as cursor:
            await cursor.execute(
                "INSERT INTO tournaments COLUMNS (data) VALUES (%s) ",
                [psycopg.types.json.Json(dataclasses.asdict(tournament))],
            )

    async def get_tournaments(self) -> list[models.Tournament]:
        async with self.conn.cursor() as cursor:
            res = await cursor.execute("SELECT data FROM tournaments")
            return [models.Tournament(**row) for row in res]


@contextlib.asynccontextmanager
async def operator():
    with POOL.connection() as conn:
        yield Operator(conn)
