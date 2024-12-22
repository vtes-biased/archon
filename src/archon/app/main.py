import contextlib
import dotenv
import fastapi
import fastapi.responses
import fastapi.staticfiles
import importlib.resources
import logging
import os
import starlette.middleware.sessions
import uvicorn.logging

from .. import db
from .. import engine
from . import dependencies
from .api import tournament
from .api import vekn
from .html import website

dotenv.load_dotenv()
SESSION_KEY = os.getenv("SESSION_KEY", "dev_key")

LOG = logging.getLogger()
handler = logging.StreamHandler()
handler.setFormatter(uvicorn.logging.DefaultFormatter("%(levelprefix)s %(message)s"))
LOG.addHandler(handler)


@contextlib.asynccontextmanager
async def lifespan(app: fastapi.FastAPI):
    """Initialize the DB pool"""
    LOG.debug("Entering APP lifespan")
    async with db.POOL:
        # idempotent init, call it every time
        await db.init()
        yield
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


app = fastapi.FastAPI(lifespan=lifespan, tags_metadata=tags_metadata, debug=__debug__)
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
app.include_router(website.router)
app.include_router(tournament.router)
app.include_router(vekn.router)


# login redirection
@app.exception_handler(dependencies.LoginRequired)
def auth_exception_handler(
    request: fastapi.Request, exc: dependencies.LoginRequired
) -> fastapi.responses.HTMLResponse:
    """
    Redirect the user to the login page if not logged in
    """
    LOG.debug("Login failed", exc_info=exc.with_traceback(None))
    return fastapi.responses.RedirectResponse(
        url=request.url_for("login").include_query_params(next=str(request.url))
    )


# engine errors display
@app.exception_handler(engine.TournamentError)
def engine_exception_handler(
    request: fastapi.Request, exc: dependencies.LoginRequired
) -> fastapi.responses.JSONResponse:
    """
    Returns a well-serialized JSON error message
    """
    if __debug__:
        LOG.exception("tournament error", exc_info=exc)
    else:
        LOG.warning(exc.args[0])
    return fastapi.responses.JSONResponse({"detail": str(exc)}, 400)
