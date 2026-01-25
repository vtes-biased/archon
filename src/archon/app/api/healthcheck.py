import asyncio
import fastapi
import importlib.metadata
import pydantic

from ... import db


class DatabaseStatus(pydantic.BaseModel):
    status: str
    version: str | None = None
    pool_size: int | None = None
    pool_available: int | None = None


class VeknSyncStatus(pydantic.BaseModel):
    status: str
    timestamp: str | None = None


class HealthcheckDetailed(pydantic.BaseModel):
    version: str
    database: DatabaseStatus
    vekn_sync: VeknSyncStatus


router = fastapi.APIRouter(tags=["healthcheck"])

#: Updated by main.log_sync_errors callback
vekn_sync_status: dict = {"status": "pending", "timestamp": None}


@router.get("/healthcheck")
async def healthcheck():
    """Returns 200 with empty body if the system is up, 503 if the database is down."""
    try:
        async with asyncio.timeout(0.3):
            async with db.POOL.connection() as conn:
                await conn.execute("SELECT 1")
        return fastapi.responses.Response(status_code=200)
    except Exception:
        return fastapi.responses.Response(status_code=503)


@router.get("/healthcheck/detailed", response_model=HealthcheckDetailed)
async def healthcheck_detailed():
    stats = db.POOL.get_stats()
    try:
        async with asyncio.timeout(0.3):
            async with db.POOL.connection() as conn:
                cursor = await conn.execute("SHOW server_version")
                pg_version = (await cursor.fetchone())[0]
        db_status = {
            "status": "ok",
            "version": pg_version,
            "pool_size": stats["pool_size"],
            "pool_available": stats["pool_available"],
        }
    except Exception:
        db_status = {"status": "down"}
    return {
        "version": importlib.metadata.version("vtes-archon"),
        "database": db_status,
        "vekn_sync": vekn_sync_status,
    }
