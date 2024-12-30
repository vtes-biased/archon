import aiohttp
import datetime
import dotenv
import fastapi.security
import fastapi.templating
import functools
import importlib.resources
import itsdangerous.url_safe
import jwt
import logging
import orjson
import os
import pydantic.dataclasses
import typing
import urllib.parse
import uuid


from .. import db
from .. import engine
from .. import models


# ############################################################################### Config
dotenv.load_dotenv()

SESSION_KEY = os.getenv("SESSION_KEY", "dev_key")
SITE_URL_BASE = os.getenv("SITE_URL_BASE", "http://127.0.0.1:8000")
DISCORD_CLIENT_ID = os.getenv("DISCORD_CLIENT_ID")
DISCORD_CLIENT_SECRET = os.getenv("DISCORD_CLIENT_SECRET")
DISCORD_REDIRECT_URI = urllib.parse.urljoin(SITE_URL_BASE, "/auth/discord")
DISCORD_AUTH_URL = functools.partial(
    "https://discord.com/oauth2/authorize?"
    "response_type=code&"
    "client_id={client_id}&"
    "scope=identify+email&"
    "state={state}&"
    "redirect_uri={redirect_uri}&"
    "prompt=none".format,
    client_id=DISCORD_CLIENT_ID,
    redirect_uri=DISCORD_REDIRECT_URI,
)
TOKEN_SECRET = os.getenv("TOKEN_SECRET")
JWT_ALGORITHM = "HS256"
LOG = logging.getLogger()


# ############################################################################### Models
@pydantic.dataclasses.dataclass
class Token:
    access_token: str
    token_type: str


@pydantic.dataclasses.dataclass
class TournamentUrl:
    uid: str
    url: str


@pydantic.dataclasses.dataclass
class DiscordAuth:
    access_token: str
    token_type: str  # "Bearer"
    expires_in: int  # seconds
    refresh_token: str
    scope: str  # "identify email"


# ########################################################################## Static data
class StaticData:
    countries: list[models.Country]
    cities: dict[str, list[models.City]]

    def __init__(self):
        with importlib.resources.path("archon", "geodata") as geodata:

            with importlib.resources.as_file(geodata / "countries.json") as countries:
                self.countries = [
                    models.Country(**d) for d in orjson.loads(countries.read_bytes())
                ]
                self.countries.sort(key=lambda x: x.country)
            self.cities = {}
            with importlib.resources.as_file(geodata / "cities.json") as cities:
                for data in orjson.loads(cities.read_bytes()):
                    city = models.City(**data)
                    self.cities.setdefault(city.country_name, [])
                    self.cities[city.country_name].append(city)
                    # some cities are listed as part of multiple countries
                    for cc in city.cc2:
                        self.cities.setdefault(cc, [])
                        self.cities[cc].append(city)
                for l in self.cities.values():
                    l.sort(key=lambda x: (x.name, x.admin1, x.admin2))


# just load the static data at import time
STATIC_DATA = StaticData()


# ############################################################################# Database
async def get_db_op():
    async with db.POOL.connection() as conn:
        yield db.Operator(conn)


DbOperator = typing.Annotated[db.Operator, fastapi.Depends(get_db_op)]


async def get_tournament(
    op: DbOperator,
    uid: typing.Annotated[str, fastapi.Path(title="Tournament unique ID")],
) -> models.Tournament:
    return await op.get_tournament(uid)


async def get_tournament_config(
    op: DbOperator,
    uid: typing.Annotated[str, fastapi.Path(title="Tournament unique ID")],
) -> models.Tournament:
    return await op.get_tournament(uid, models.TournamentConfig)


async def get_tournament_orchestrator(
    op: DbOperator,
    uid: typing.Annotated[str, fastapi.Path(title="Tournament unique ID")],
) -> engine.TournamentOrchestrator:
    ret = await op.get_tournament(uid, engine.TournamentOrchestrator)
    if not ret:
        raise fastapi.HTTPException(fastapi.status.HTTP_404_NOT_FOUND)
    return ret


Tournament = typing.Annotated[models.Tournament, fastapi.Depends(get_tournament)]
TournamentConfig = typing.Annotated[
    models.TournamentConfig, fastapi.Depends(get_tournament_config)
]
TournamentOrchestrator = typing.Annotated[
    engine.TournamentOrchestrator, fastapi.Depends(get_tournament_orchestrator)
]


# ################################################################################## Doc
def custom_openapi(app: fastapi.FastAPI):
    def get_openapi():
        if app.openapi_schema:
            return app.openapi_schema
        app.openapi_schema = fastapi.openapi.utils.get_openapi(
            title="Archon API",
            version=importlib.metadata.version("vtes-archon"),
            summary="VTES tournament management",
            description="You can use this API to build tournament management tools",
            routes=[
                r
                for r in app.routes
                if r.path.startswith("/api/") or r.path.startswith("/auth/oauth")
            ],
        )
        return app.openapi_schema

    return get_openapi


# #################################################################### Security: Session
def hash_state(state: str):
    """URL-safe signed hash of the state"""
    return itsdangerous.url_safe.URLSafeSerializer(SESSION_KEY, "state").dumps(state)


async def get_session_context(
    request: fastapi.Request, op: DbOperator
) -> dict[str, typing.Any]:
    """Provide the 'member' model in the session context when logged in.
    If anonymous, provides relevant OAuth URLs for login against a provider
    """
    member = None
    uid = request.session.get("user_id", None)
    if uid:
        member = await op.get_member(uid)
        if member:
            return {"member": member}
    anonymous_session(request)
    return {
        "discord_oauth": DISCORD_AUTH_URL(state=hash_state(request.session["state"]))
    }


def authenticated_session(request: fastapi.Request, member: models.Member):
    """Switch the session to authenticated"""
    request.session.pop("state", None)
    request.session["user_id"] = member.uid


def anonymous_session(request: fastapi.Request):
    """Switch (or keep) the session anonymous"""
    request.session.pop("user_id", None)
    request.session.setdefault("state", str(uuid.uuid4))


#: Provide easy access to the session context for templating
SessionContext = typing.Annotated[
    dict[str, typing.Any], fastapi.Depends(get_session_context)
]


class LoginRequired(Exception): ...


def get_member_uid_from_session(request: fastapi.Request) -> str:
    if not request.session.get("user_id", None):
        anonymous_session(request)
        raise LoginRequired()
    return request.session["user_id"]


#: Check we're in an authenticated session and return the member UID
MemberUidFromSession = typing.Annotated[
    str, fastapi.Depends(get_member_uid_from_session)
]


async def get_member_from_session(
    request: fastapi.Request, member_uid: MemberUidFromSession, op: DbOperator
):
    member = await op.get_member(member_uid)
    # Valid user_id in session, but member not in DB
    if not member:
        anonymous_session(request)
        raise LoginRequired()
    return member


#: Check we're in an authenticated session and return the member data from DB
MemberFromSession = typing.Annotated[
    models.Member, fastapi.Depends(get_member_from_session)
]


# ############################################################### Security: Social Login
async def discord_login(
    request: fastapi.Request,
    code: typing.Annotated[str, fastapi.Query()],
    state: typing.Annotated[str, fastapi.Query()],
    op: DbOperator,
) -> bool:
    """Login using Discord OAuth autorization code"""
    if state != hash_state(request.session["state"]):
        LOG.warning("wrong state %s", state)
        return False

    user = None
    async with aiohttp.ClientSession("https://discord.com") as session:
        async with session.post(
            "/api/v10/oauth2/token",
            data={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": DISCORD_REDIRECT_URI,
            },
            auth=aiohttp.BasicAuth(DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET),
        ) as res:
            data = await res.json()
            auth = DiscordAuth(**data)

            async with session.get(
                "/api/v10/users/@me",
                headers={"Authorization": f"Bearer {auth.access_token}"},
            ) as res:
                data = await res.json()
                user = models.DiscordUser(**data)
    if user:
        async with db.operator() as op:
            member = await op.upsert_member_discord(user)
            authenticated_session(request, member)
            return True
    # reset state on login failure
    request.session["state"] = str(uuid.uuid4)
    return False


DiscordLogin = typing.Annotated[bool, fastapi.Depends(discord_login)]

# ################################################################## Security: OAuth 2.0
oauth2_scheme = fastapi.security.OAuth2AuthorizationCodeBearer(
    authorizationUrl="/auth/oauth", tokenUrl="/auth/oauth/token"
)


# cache expected auth tokens in memory
# TODO: remove the keys after an hour has passed
EXPECTED_AUTH_TOKENS = set()


def create_authorization_code(client_id, member_uid, redirect_uri) -> str:
    """Use RFC 9608 -like self-encoded JWT auth codes
    https://www.oauth.com/oauth2-servers/access-tokens/authorization-code-request/
    https://datatracker.ietf.org/doc/html/rfc9068#JWTATLRequest
    """
    token_id = str(uuid.uuid4())
    EXPECTED_AUTH_TOKENS.add(token_id)
    expiry = datetime.datetime.now(tz=datetime.timezone.utc) + datetime.timedelta(
        hours=1
    )
    to_encode = {
        "client_id": client_id,
        "sub": member_uid,
        "aud": redirect_uri,
        "jti": token_id,
        "exp": expiry,
    }
    return jwt.encode(to_encode, TOKEN_SECRET, algorithm=JWT_ALGORITHM)


def check_authorization_code(client_id, code, redirect_uri) -> str:
    payload = jwt.decode(
        code, TOKEN_SECRET, algorithms=[JWT_ALGORITHM], audience=redirect_uri
    )
    expected = EXPECTED_AUTH_TOKENS.pop(payload.get("jti"), None)
    member_uid: str = payload.get("sub")
    payload_client_id: str = payload.get("client_id")
    if not expected or payload_client_id != client_id:
        raise fastapi.HTTPException(status_code=403)
    return member_uid


html_basic = fastapi.security.HTTPBasic()


async def client_login(
    op: DbOperator,
    basic: typing.Annotated[
        fastapi.security.HTTPBasicCredentials | None, fastapi.Depends(html_basic)
    ] = None,
    client_id: typing.Annotated[str | None, fastapi.Form()] = None,
    client_secret: typing.Annotated[str | None, fastapi.Form()] = None,
):
    if basic:
        client_id, client_secret = basic.username, basic.password
    if await op.check_client_secret(client_id, client_secret):
        return client_id
    raise fastapi.HTTPException(status_code=401)


ClientLogin = typing.Annotated[str, fastapi.Depends(client_login)]


def create_access_token(user_id: str):
    to_encode = {"sub": user_id}
    expire = datetime.datetime.now(tz=datetime.timezone.utc) + datetime.timedelta(
        days=7
    )
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, TOKEN_SECRET, algorithm=JWT_ALGORITHM)
    return encoded_jwt


def get_member_uid_from_token(
    token: typing.Annotated[str, fastapi.Depends(oauth2_scheme)],
) -> models.Member:
    credentials_exception = fastapi.HTTPException(
        status_code=fastapi.status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, TOKEN_SECRET, algorithms=[JWT_ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except jwt.exceptions.InvalidTokenError:
        raise credentials_exception
    return user_id


MemberUidFromToken = typing.Annotated[str, fastapi.Depends(get_member_uid_from_token)]


async def get_member_from_token(
    member_uid: MemberUidFromToken,
    op: DbOperator,
) -> models.Member:
    member = await op.get_member(member_uid)
    if member is None:
        raise fastapi.HTTPException(
            status_code=fastapi.status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return member


MemberFromToken = typing.Annotated[
    models.Member, fastapi.Depends(get_member_from_token)
]
