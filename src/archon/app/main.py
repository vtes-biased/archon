import asyncio
import contextlib
import dotenv
import fastapi
import fastapi.exceptions
import fastapi.responses
import fastapi.staticfiles
import importlib.resources
import krcg.vtes
import logging
import os
import psycopg.errors
import starlette.middleware.sessions
import uvicorn.logging

from .. import db
from .. import engine
from .. import vekn
from . import dependencies
from .api import admin as api__admin
from .api import league as api__league
from .api import tournament as api__tournament
from .api import vekn as api__vekn
from .html import website as html__website

dotenv.load_dotenv()
SESSION_KEY = os.getenv("SESSION_KEY", "dev_key")

LOG = logging.getLogger()
handler = logging.StreamHandler()
handler.setFormatter(uvicorn.logging.DefaultFormatter("%(levelprefix)s %(message)s"))
LOG.addHandler(handler)
if __debug__ or os.getenv("DEBUG"):
    LOG.setLevel(logging.DEBUG)
    handler.setLevel(logging.DEBUG)


async def sync_vekn_members(op: db.Operator) -> None:
    prefixes_map = {}  # prefix owners
    async for members in vekn.get_members_batches():
        # note insert members modifies the passed members list
        # after this call, all members have the right DB uid and data
        async with op.conn.transaction():
            await op.insert_members(members)
        for member in members:
            if member.prefix and len(member.prefix) == 3:
                if member.prefix in prefixes_map:
                    assert prefixes_map[member.prefix].vekn == member.vekn
                prefixes_map[member.prefix] = member.uid
        del members
    for prefix, uid in prefixes_map.items():
        async with op.conn.transaction():
            await op.set_sponsor_on_prefix(prefix, uid)
    del prefixes_map


async def sync_vekn() -> int | None:
    if __debug__:
        return 1
    async with db.operator(autocommit=True) as op:
        await op.purge_tournament_events()
        await op.close_old_tournaments()
        await sync_vekn_members(op)
        members = await op.get_members_vekn_dict()
        async for event in vekn.get_events_serial(members):
            async with op.conn.transaction():
                await op.upsert_vekn_tournament(event)
            del event
        del members
        await op.recompute_all_ratings()


def log_sync_errors(task: asyncio.Task) -> None:
    if task.cancelled():
        LOG.info("VEKN sync cancelled")
        return
    exception = task.exception()
    if exception:
        LOG.exception("VEKN sync failed", exc_info=exception)
        return
    if task.result():
        LOG.info("VEKN sync omitted (debug mode)")
    else:
        LOG.info("VEKN sync done")


@contextlib.asynccontextmanager
async def lifespan(app: fastapi.FastAPI):
    """Initialize the DB pool"""
    LOG.debug("Entering APP lifespan")
    async with db.POOL:
        # idempotent init, call it every time
        await db.init()
        # sync VEKN asynchronously, start in the meantime
        task = asyncio.create_task(sync_vekn())
        task.add_done_callback(log_sync_errors)
        krcg.vtes.VTES.load()
        yield
        task.cancel()
    LOG.debug("Exiting APP lifespan")


tags_metadata = [
    {
        "name": "vekn",
        "description": "VEKN profile management. The **login** logic is also here.",
    },
    {
        "name": "tournament",
        "description": "Tournament management.",
    },
]


app = fastapi.FastAPI(
    lifespan=lifespan,
    tags_metadata=tags_metadata,
    debug=__debug__,
    swagger_ui_parameters={"favIconUrl": "/img/favicon.ico"},  # Set custom favicon path
)

app.add_middleware(
    starlette.middleware.sessions.SessionMiddleware,
    secret_key=SESSION_KEY,
)
app.openapi = dependencies.custom_openapi(app)

# mount static files
with (
    importlib.resources.path("archon", "img") as img,
    importlib.resources.path("archon", "static") as static,
):
    app.mount(
        "/img",
        app=fastapi.staticfiles.StaticFiles(directory=img),
        name="img",
    )
    app.mount(
        "/static",
        app=fastapi.staticfiles.StaticFiles(directory=static),
        name="static",
    )


# mount routers
app.include_router(html__website.router)
app.include_router(api__admin.router)
app.include_router(api__league.router)
app.include_router(api__tournament.router)
app.include_router(api__vekn.router)


# login redirection
@app.exception_handler(dependencies.LoginRequired)
def auth_exception_handler(
    request: fastapi.Request, exc: dependencies.LoginRequired
) -> fastapi.responses.HTMLResponse:
    """
    Redirect the user to the login page if not logged in
    """
    LOG.debug("Login failed", exc_info=exc.with_traceback(None))
    request.session["message"] = "You need to log in"
    return fastapi.responses.RedirectResponse(
        url=request.url_for("login").include_query_params(next=str(request.url))
    )


# 403 Forbidden handler (website endpoints only)
@app.exception_handler(fastapi.HTTPException)
def forbidden_exception_handler(
    request: fastapi.Request, exc: fastapi.HTTPException
) -> fastapi.responses.HTMLResponse:
    """
    Redirect to 403 page for HTML requests on website endpoints only
    """
    if exc.status_code == 403 and not request.url.path.startswith("/api/"):
        return html__website.TEMPLATES.TemplateResponse(
            request=request,
            name="403.html.j2",
            context={},
            status_code=403,
        )
    raise exc


# engine errors display
@app.exception_handler(engine.TournamentError)
def engine_exception_handler(
    request: fastapi.Request, exc: engine.TournamentError
) -> fastapi.responses.JSONResponse:
    """
    Returns a well-serialized JSON error message
    """
    if __debug__:
        LOG.exception("tournament error", exc_info=exc)
    else:
        LOG.warning(exc.args[0])
    return fastapi.responses.JSONResponse({"detail": str(exc)}, 400)


# members consistency errors
@app.exception_handler(db.IndexError)
def db_exception_handler(
    request: fastapi.Request, exc: engine.TournamentError
) -> fastapi.responses.JSONResponse:
    """
    Returns a well-serialized JSON error message
    """
    if __debug__:
        LOG.exception("member index error", exc_info=exc)
    else:
        LOG.warning(exc.args[0])
    return fastapi.responses.JSONResponse({"detail": exc.args[0]}, 400)


# pydantic validation errors with detailed messages
@app.exception_handler(fastapi.exceptions.RequestValidationError)
def validation_exception_handler(
    request: fastapi.Request, exc: fastapi.exceptions.RequestValidationError
) -> fastapi.responses.JSONResponse:
    """
    Returns detailed validation error messages
    """
    LOG.warning("Validation error: %s", exc.errors())
    return fastapi.responses.JSONResponse({"detail": exc.errors()}, 422)


# DB issue
@app.exception_handler(psycopg.errors.Error)
def psycopg_exception_handler(
    request: fastapi.Request, exc: psycopg.errors.Error
) -> fastapi.responses.JSONResponse:
    """
    Returns a well-serialized JSON error message
    """
    if __debug__:
        LOG.exception("Database error", exc_info=exc)
    else:
        LOG.warning(exc.args[0])
    return fastapi.responses.JSONResponse({"detail": str(exc)}, 500)


# Runtime errors
@app.exception_handler(RuntimeError)
def default_exception_handler(
    request: fastapi.Request, exc: RuntimeError
) -> fastapi.responses.JSONResponse:
    """
    Returns a well-serialized JSON error message
    """
    if __debug__:
        LOG.exception("runtime error", exc_info=exc)
    else:
        LOG.warning(exc.args[0])
    return fastapi.responses.JSONResponse({"detail": str(exc)}, 500)
