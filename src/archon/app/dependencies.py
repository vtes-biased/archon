import aiohttp
import asyncio
import base64
import datetime
import dotenv
import fastapi_mail
import fastapi.security
import functools
import hashlib
import hmac
import importlib
import itsdangerous.url_safe
import jwt
import logging
import os
import pydantic.dataclasses
import typing
import urllib.parse
import uuid


from .. import db
from .. import engine
from .. import models
from .. import vekn


# ############################################################################### Config
dotenv.load_dotenv()

SESSION_KEY = os.getenv("SESSION_KEY", "dev_key")
SITE_URL_BASE = os.getenv("SITE_URL_BASE", "http://127.0.0.1:8000")
DISCORD_CLIENT_ID = os.getenv("DISCORD_CLIENT_ID")
DISCORD_CLIENT_SECRET = os.getenv("DISCORD_CLIENT_SECRET")
DISCORD_REDIRECT_URI = urllib.parse.urljoin(SITE_URL_BASE, "/auth/discord")
EMAIL_LOGIN_URI = urllib.parse.urljoin(SITE_URL_BASE, "/auth/email/reset")
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


DISCORD_LOGIN_HASH = itsdangerous.url_safe.URLSafeSerializer(
    SESSION_KEY, "discord-login"
)
EMAIL_LOGIN_HASH = itsdangerous.url_safe.URLSafeTimedSerializer(
    SESSION_KEY, "email-login"
)

MAIL_CONFIG = fastapi_mail.ConnectionConfig(
    MAIL_SERVER=os.getenv("MAIL_SERVER"),
    MAIL_PORT=os.getenv("MAIL_PORT"),
    MAIL_USERNAME=os.getenv("MAIL_USERNAME"),
    MAIL_PASSWORD=os.getenv("MAIL_PASSWORD"),
    MAIL_FROM=os.getenv("MAIL_FROM"),
    MAIL_FROM_NAME=os.getenv("MAIL_FROM_NAME"),
    MAIL_STARTTLS=True,
    MAIL_SSL_TLS=False,
)


# ############################################################################### Models
@pydantic.dataclasses.dataclass
class Token:
    access_token: str
    token_type: str


@pydantic.dataclasses.dataclass
class ItemUrl:
    uid: str
    url: str


@pydantic.dataclasses.dataclass
class DiscordAuth:
    access_token: str
    token_type: str  # "Bearer"
    expires_in: int  # seconds
    refresh_token: str
    scope: str  # "identify email"


# ############################################################################# Database
async def get_db_op():
    async with db.POOL.connection() as conn:
        yield db.Operator(conn)


DbOperator = typing.Annotated[db.Operator, fastapi.Depends(get_db_op)]


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
) -> models.Person:
    member = await op.get_member(member_uid, cls=models.Person)
    # Valid user_id in session, but member not in DB
    if not member:
        anonymous_session(request)
        raise LoginRequired()
    return member


#: Check we're in an authenticated session and return the member data from DB
PersonFromSession = typing.Annotated[
    models.Person, fastapi.Depends(get_member_from_session)
]


async def get_tournament(
    op: DbOperator,
    uid: typing.Annotated[str, fastapi.Path(title="Tournament unique ID")],
    member: PersonFromSession,
) -> models.Tournament:
    tournament = await op.get_tournament(uid)
    check_can_admin_tournament(member, tournament)
    return tournament


async def get_tournament_config(
    op: DbOperator,
    uid: typing.Annotated[str, fastapi.Path(title="Tournament unique ID")],
) -> models.Tournament:
    return await op.get_tournament(uid, cls=models.TournamentConfig)


async def get_tournament_info(
    op: DbOperator,
    uid: typing.Annotated[str, fastapi.Path(title="Tournament unique ID")],
) -> models.Tournament:
    return await op.get_tournament(uid, cls=models.TournamentInfo)


# the only one that locks, always use that for updates
async def get_tournament_orchestrator(
    op: DbOperator,
    uid: typing.Annotated[str, fastapi.Path(title="Tournament unique ID")],
) -> engine.TournamentOrchestrator:
    ret = await op.get_tournament(uid, True, engine.TournamentOrchestrator)
    if not ret:
        raise fastapi.HTTPException(fastapi.status.HTTP_404_NOT_FOUND)
    return ret


# Check the member (from their token) can administrate the tournament
Tournament = typing.Annotated[models.Tournament, fastapi.Depends(get_tournament)]
# Check there is a member token (not public) or filter data (players names)
TournamentInfo = typing.Annotated[
    models.TournamentConfig, fastapi.Depends(get_tournament_info)
]
# This is public information
TournamentConfig = typing.Annotated[
    models.TournamentConfig, fastapi.Depends(get_tournament_config)
]
# Locks tournament for update
TournamentOrchestrator = typing.Annotated[
    engine.TournamentOrchestrator, fastapi.Depends(get_tournament_orchestrator)
]


# ################################################################################ Utils
async def vekn_sync(tournament: models.Tournament, rounds: int, user: models.Person):
    if not user.vekn:
        raise fastapi.HTTPException(fastapi.status.HTTP_403_FORBIDDEN)
    try:
        if not tournament.extra.get("vekn_id"):
            await vekn.upload_tournament(tournament, rounds, user.vekn)
        if tournament.state == models.TournamentState.FINISHED:
            await vekn.upload_tournament_result(tournament)
    except vekn.NoVEKN:
        raise fastapi.HTTPException(
            fastapi.status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="VEKN is not available at the moment, please try again later.",
        )


def async_timed_cache(duration: datetime.timedelta = datetime.timedelta(minutes=5)):
    def wrapper(async_fun):
        lock = asyncio.Lock()
        cache = []

        @functools.wraps(async_fun)
        async def inner(*args, **kwargs):
            if not cache or datetime.datetime.now() - cache[0] > duration:
                async with lock:
                    ret = await async_fun(*args, **kwargs)
                    cache.clear()
                    cache.append(datetime.datetime.now())
                    cache.append(ret)
            else:
                LOG.debug("Using cached value for %s", async_fun.__name__)
            return cache[1]

        return inner

    return wrapper


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


# ########################################################################## Permissions
def check_can_change_role(
    member: models.Person, target: models.Person, role: models.MemberRole
) -> None:
    initiator_roles = set(member.roles)
    match role:
        case (
            models.MemberRole.ADMIN
            | models.MemberRole.RULEMONGER
            | models.MemberRole.ETHICS
            | models.MemberRole.NC
            | models.MemberRole.PTC
        ):
            if models.MemberRole.ADMIN not in initiator_roles:
                raise fastapi.HTTPException(fastapi.status.HTTP_403_FORBIDDEN)
        case models.MemberRole.PRINCE:
            if models.MemberRole.ADMIN in initiator_roles:
                return
            if (
                models.MemberRole.NC in initiator_roles
                and member.country == target.country
            ):
                return
            raise fastapi.HTTPException(fastapi.status.HTTP_403_FORBIDDEN)
        case models.MemberRole.PLAYTESTER:
            if models.MemberRole.ADMIN in initiator_roles:
                return
            if models.MemberRole.PTC in initiator_roles:
                return
            raise fastapi.HTTPException(fastapi.status.HTTP_403_FORBIDDEN)
        case models.MemberRole.JUDGE | models.MemberRole.JUDGEKIN:
            if models.MemberRole.ADMIN in initiator_roles:
                return
            if models.MemberRole.RULEMONGER in initiator_roles:
                return
            raise fastapi.HTTPException(fastapi.status.HTTP_403_FORBIDDEN)


def can_organize(member: models.Person) -> bool:
    return set(member.roles) & {
        models.MemberRole.ADMIN,
        models.MemberRole.NC,
        models.MemberRole.PRINCE,
    }


def check_organizer(member: models.Person) -> None:
    if not can_organize(member):
        raise fastapi.HTTPException(fastapi.status.HTTP_403_FORBIDDEN)


def check_can_admin_tournament(
    member: models.Person, tournament: models.TournamentConfig
):
    if models.MemberRole.ADMIN in member.roles:
        return
    if models.MemberRole.NC in member.roles and member.country == tournament.country:
        return
    if member.uid in [j.uid for j in tournament.judges]:
        return
    raise fastapi.HTTPException(fastapi.status.HTTP_403_FORBIDDEN)


def check_can_admin_league(member: models.Person, league: models.League):
    if models.MemberRole.ADMIN in member.roles:
        return
    if models.MemberRole.NC in member.roles and member.country == league.country:
        return
    if member.uid in [j.uid for j in league.organizers]:
        return
    raise fastapi.HTTPException(fastapi.status.HTTP_403_FORBIDDEN)


def check_can_change_info(member: models.Person, target: models.Person):
    # one can always modify oneself
    if member.uid == target.uid:
        return
    member_roles = set(member.roles)
    # admin can modify anything
    if models.MemberRole.ADMIN in member_roles:
        return
    target_roles = set(target.roles)
    # noone except admins can modify admin and NC
    if target_roles & {models.MemberRole.ADMIN, models.MemberRole.NC}:
        raise fastapi.HTTPException(fastapi.status.HTTP_403_FORBIDDEN)
    # only their NC can modify a Prince, PTC or Ethics Committee member
    if target_roles & {
        models.MemberRole.PRINCE,
        models.MemberRole.PTC,
        models.MemberRole.ETHICS,
    }:
        if models.MemberRole.NC in member_roles and member.country == target.country:
            return
        raise fastapi.HTTPException(fastapi.status.HTTP_403_FORBIDDEN)
    # NC, PTC and Ethic Committee members can modify anyone else
    # Note we do not country limit: NCs need to be able to change players country
    # PTC might need it if language or coordinator make the fields list at some point
    # Ethics Comittee member might need it for data protection or something
    if member_roles & {
        models.MemberRole.NC,
        models.MemberRole.PTC,
        models.MemberRole.ETHICS,
    }:
        return
    # Otherwise, only a Prince from the same country can modify the info
    if member.country == target.country and models.MemberRole.PRINCE in member_roles:
        return
    raise fastapi.HTTPException(fastapi.status.HTTP_403_FORBIDDEN)


def check_can_sanction(member: models.Person):
    member_roles = set(member.roles)
    if member_roles & {
        models.MemberRole.ADMIN,
        models.MemberRole.RULEMONGER,
        models.MemberRole.JUDGE,
        models.MemberRole.ETHICS,
    }:
        return
    raise fastapi.HTTPException(fastapi.status.HTTP_403_FORBIDDEN)


def check_can_change_vekn(member: models.Person, target: models.Person):
    if member.uid == target.uid:
        return
    member_roles = set(member.roles)
    if models.MemberRole.ADMIN in member_roles:
        return
    if models.MemberRole.NC in member_roles and member.country == target.country:
        return
    raise fastapi.HTTPException(fastapi.status.HTTP_403_FORBIDDEN)


def check_can_contact(member: models.Person, target: models.Person):
    if member.uid == target.uid or models.MemberRole.ADMIN in member.roles:
        return
    if models.MemberRole.NC in target.roles:
        return
    if models.MemberRole.PRINCE in target.roles:
        return
    if member.country == target.country and (
        models.MemberRole.PRINCE in member.roles or models.MemberRole.NC in member.roles
    ):
        return
    if models.MemberRole.NC in member.roles and models.MemberRole.ADMIN in target.roles:
        return
    raise fastapi.HTTPException(fastapi.status.HTTP_403_FORBIDDEN)


# #################################################################### Security: Session
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
            return {
                "member": member,
                "organizer": can_organize(member),
                "discord_oauth": DISCORD_AUTH_URL(
                    state=DISCORD_LOGIN_HASH.dumps(member.uid)
                ),
            }
    anonymous_session(request)
    return {
        "discord_oauth": DISCORD_AUTH_URL(
            state=DISCORD_LOGIN_HASH.dumps(request.session["state"])
        )
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


# ############################################################### Security: Social Login
async def discord_login(
    request: fastapi.Request,
    code: typing.Annotated[str, fastapi.Query()],
    state: typing.Annotated[str, fastapi.Query()],
    op: DbOperator,
) -> bool:
    """Login using Discord OAuth autorization code"""
    session_state = request.session.get("state") or request.session.get("user_id")
    if DISCORD_LOGIN_HASH.loads(state) != session_state:
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
            if "user_id" in request.session:
                member = await op.update_member_discord(
                    request.session["user_id"], user
                )
            else:
                member = await op.upsert_member_discord(user)
            authenticated_session(request, member)
            return True
    # reset state on login failure
    request.session["state"] = str(uuid.uuid4)
    return False


DiscordLogin = typing.Annotated[bool, fastapi.Depends(discord_login)]


# ################################################################ Security: Email Login
def email_login_url(email: str):
    return (
        EMAIL_LOGIN_URI
        + "?"
        + urllib.parse.urlencode({"state": EMAIL_LOGIN_HASH.dumps(email)})
    )


def _hash_password(password: str) -> str:
    # Could use a higher n, but need to avoid memory overconsumption
    return base64.standard_b64encode(
        hashlib.scrypt(password.encode(), salt=SESSION_KEY.encode(), n=2**14, r=8, p=1)
    ).decode()


def set_member_password(member: models.Member, password: str):
    member.password_hash = _hash_password(password)


def check_member_password(member: models.Member, password: str) -> bool:
    return hmac.compare_digest(member.password_hash, _hash_password(password))


async def send_reset_email(email: str) -> None:
    url = email_login_url(email)
    html = (
        "<p>Reset your Archon account password with "
        f'<a href="{url}">this link</a>.</p>'
    )
    message = fastapi_mail.MessageSchema(
        subject="Archon: Password reset",
        recipients=[email],
        body=html,
        subtype=fastapi_mail.MessageType.html,
    )

    fm = fastapi_mail.FastMail(MAIL_CONFIG)
    await fm.send_message(message)


async def email_reset(
    request: fastapi.Request,
    state: typing.Annotated[str, fastapi.Query()],
    op: DbOperator,
) -> str:
    """Login using verified email"""
    email = None
    try:
        email = EMAIL_LOGIN_HASH.loads(state, 24 * 3600)
    except itsdangerous.BadSignature:
        LOG.warning("wrong state %s", state)
        anonymous_session(request)
        return ""

    if email:
        async with db.operator() as op:
            member = await op.upsert_member_email(email)
            authenticated_session(request, member)
            return member.uid
    # reset state on login failure
    anonymous_session(request)
    return ""


EmailAddress = typing.Annotated[pydantic.EmailStr, fastapi.Form()]
EmailReset = typing.Annotated[str, fastapi.Depends(email_reset)]


basic_scheme = fastapi.security.HTTPBasic()


async def email_login(
    request: fastapi.Request,
    op: DbOperator,
    email: typing.Annotated[pydantic.EmailStr | None, fastapi.Form()] = None,
    password: typing.Annotated[str | None, fastapi.Form()] = None,
) -> bool:
    """Login using email+password"""
    async with db.operator() as op:
        try:
            member = await op.get_member_by_email(email)
            res = check_member_password(member, password)
        except db.NotFound:
            res = False
    if res:
        authenticated_session(request, member)
    return res


EmailLogin = typing.Annotated[str, fastapi.Depends(email_login)]

# ################################################################## Security: OAuth 2.0
oauth2_scheme = fastapi.security.OAuth2AuthorizationCodeBearer(
    authorizationUrl="/auth/oauth", tokenUrl="/auth/oauth/token"
)


# cache expected auth tokens in memory - this is reset on every reboot (eg. daily)
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


async def client_login(
    op: DbOperator,
    basic: typing.Annotated[
        fastapi.security.HTTPBasicCredentials | None, fastapi.Depends(basic_scheme)
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


# A lightweight uid-only info (no DB query)
MemberUidFromToken = typing.Annotated[str, fastapi.Depends(get_member_uid_from_token)]


async def get_person_from_token(
    member_uid: MemberUidFromToken,
    op: DbOperator,
) -> models.Person:
    member = await op.get_member(member_uid, cls=models.Person)
    if member is None:
        raise fastapi.HTTPException(
            status_code=fastapi.status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return member


# The "normal" way of getting a member data (no lock)
PersonFromToken = typing.Annotated[
    models.Person, fastapi.Depends(get_person_from_token)
]


async def get_member_from_token(
    member_uid: MemberUidFromToken,
    op: DbOperator,
) -> models.Person:
    member = await op.get_member(member_uid, True)
    if member is None:
        raise fastapi.HTTPException(
            status_code=fastapi.status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return member


# Get the complete Member data for update (locks)
MemberFromToken = typing.Annotated[
    models.Member, fastapi.Depends(get_member_from_token)
]
