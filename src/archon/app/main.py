import contextlib
import dotenv
import fastapi
import fastapi.staticfiles
import importlib.resources
import os
import starlette.middleware.sessions

from .. import db
from . import dependencies
from .api import tournament
from .api import vekn
from .html import website

dotenv.load_dotenv()
SESSION_KEY = os.getenv("SESSION_KEY", "dev_key")


@contextlib.asynccontextmanager
async def lifespan(app: fastapi.FastAPI):
    """Initialize the DB pool"""
    async with db.POOL:
        # idempotent init, call it every time
        await db.init()
        yield


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


app = fastapi.FastAPI(lifespan=lifespan, tags_metadata=tags_metadata)
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
