# import aiohttp
# import datetime
# import fastapi
# import fastapi.openapi.utils
# import fastapi.responses
# import fastapi.staticfiles
# import fastapi.security
# import fastapi.templating
# import importlib.metadata
# import importlib.resources
# import fastapi.encoders
# import fastapi.utils
# import itsdangerous.url_safe
# import contextlib
# import dataclasses
# import dotenv
# import functools
# import jwt
# import jwt.exceptions
# import logging
# import orjson
# import os
# import starlette.middleware.sessions
# import typing
# import urllib.parse
# import uuid
# from pydantic import dataclasses

# from . import db
# from . import events
# from . import models
# from . import engine


# dotenv.load_dotenv()
# SESSION_KEY = os.getenv("SESSION_KEY", "dev_key")
# SITE_URL_BASE = os.getenv("SITE_URL_BASE", "http://127.0.0.1:8000")
# DISCORD_CLIENT_ID = os.getenv("DISCORD_CLIENT_ID")
# DISCORD_CLIENT_SECRET = os.getenv("DISCORD_CLIENT_SECRET")
# DISCORD_REDIRECT_URI = urllib.parse.urljoin(SITE_URL_BASE, "/auth/discord")
# DISCORD_AUTH_URL = functools.partial(
#     "https://discord.com/oauth2/authorize?"
#     "response_type=code&"
#     "client_id={client_id}&"
#     "scope=identify+email&"
#     "state={state}&"
#     "redirect_uri={redirect_uri}&"
#     "prompt=none".format,
#     client_id=DISCORD_CLIENT_ID,
#     redirect_uri=DISCORD_REDIRECT_URI,
# )
# TOKEN_SECRET = os.getenv("TOKEN_SECRET")
# JWT_ALGORITHM = "HS256"

# logger = logging.getLogger()


# @dataclasses.dataclass
# class Token:
#     access_token: str
#     token_type: str


# class Resources:
#     templates: fastapi.templating.Jinja2Templates
#     countries: list[models.Country]
#     cities: dict[str, list[models.City]]


# resources = Resources()


# def jsonable(obj: typing.Any):
#     """Useful filter for Jinja templates: `{{ data | jsonable | tojson }}`"""
#     return fastapi.encoders.jsonable_encoder(obj)


# @contextlib.asynccontextmanager
# async def lifespan(app: fastapi.FastAPI):
#     await db.POOL.open()
#     with (
#         importlib.resources.path("archon", "img") as img,
#         importlib.resources.path("archon", "static") as static,
#         importlib.resources.path("archon", "templates") as templates,
#         importlib.resources.path("archon", "geodata") as geodata,
#     ):
#         resources.templates = fastapi.templating.Jinja2Templates(
#             directory=templates, extensions=["jinja2.ext.i18n"]
#         )
#         resources.templates.env.filters["jsonable"] = jsonable
#         with importlib.resources.as_file(geodata / "countries.json") as countries:
#             resources.countries = [
#                 models.Country(**d) for d in orjson.loads(countries.read_bytes())
#             ]
#             resources.countries.sort(key=lambda x: x.country)
#         resources.cities = {}
#         with importlib.resources.as_file(geodata / "cities.json") as cities:
#             for data in orjson.loads(cities.read_bytes()):
#                 city = models.City(**data)
#                 resources.cities.setdefault(city.country_name, [])
#                 resources.cities[city.country_name].append(city)
#                 # some cities are listed as part of multiple countries
#                 for cc in city.cc2:
#                     resources.cities.setdefault(cc, [])
#                     resources.cities[cc].append(city)
#             for l in resources.cities.values():
#                 l.sort(key=lambda x: (x.name, x.admin1, x.admin2))
#         app.mount(
#             "/img",
#             app=fastapi.staticfiles.StaticFiles(directory=img),
#             name="img",
#         )
#         app.mount(
#             "/static",
#             app=fastapi.staticfiles.StaticFiles(directory=static),
#             name="static",
#         )
#         # idempotent init, call it every time
#         await db.init()
#         yield
#     await db.POOL.close()


# oauth2_scheme = fastapi.security.OAuth2PasswordBearer(tokenUrl="api/auth/token")


# async def get_db_op():
#     async with db.POOL.connection() as conn:
#         yield db.Operator(conn)


# DbOperator = typing.Annotated[db.Operator, fastapi.Depends(get_db_op)]

# app = fastapi.FastAPI(redoc_url="/docs", lifespan=lifespan)
# app.add_middleware(
#     starlette.middleware.sessions.SessionMiddleware,
#     secret_key=SESSION_KEY,
# )


# # ################################################################################# HTML
# def oauth_context(request: fastapi.Request) -> dict:
#     request.session.setdefault("state", str(uuid.uuid4))
#     return {
#         "discord_oauth": DISCORD_AUTH_URL(state=hash_state(request.session["state"]))
#     }


# async def session_context(op: db.Operator, request: fastapi.Request) -> dict:
#     member = None
#     uid = request.session.get("user_id", None)
#     if uid:
#         member = await op.get_member(uid)
#     if not member:
#         return oauth_context(request)
#     return {"member": member}


# @app.get("/index.html", response_class=fastapi.responses.HTMLResponse)
# async def html_index(request: fastapi.Request):
#     async with db.operator() as op:
#         context = await session_context(op, request)
#     return resources.templates.TemplateResponse(
#         request=request, name="index.html.j2", context=context
#     )


# @app.get("/profile.html", response_class=fastapi.responses.HTMLResponse)
# async def html_profile(request: fastapi.Request):
#     async with db.operator() as op:
#         context = await session_context(op, request)
#     return resources.templates.TemplateResponse(
#         request=request, name="profile.html.j2", context=context
#     )


# @app.get("/tournament/create.html", response_class=fastapi.responses.HTMLResponse)
# async def html_tournament_create(request: fastapi.Request):
#     async with db.operator() as op:
#         context = await session_context(op, request)
#     return resources.templates.TemplateResponse(
#         request=request, name="tournament/edit.html.j2", context=context
#     )


# @app.get("/tournament/list.html", response_class=fastapi.responses.HTMLResponse)
# async def html_tournament_list(request: fastapi.Request):
#     async with db.operator() as op:
#         context = await session_context(op, request)
#         tournaments = await op.get_tournaments()
#     tournaments.sort(key=lambda x: x.start)
#     context["tournaments"] = tournaments
#     return resources.templates.TemplateResponse(
#         request=request,
#         name="tournament/list.html.j2",
#         context=context,
#     )


# @app.get(
#     "/tournament/{uid}/display.html", response_class=fastapi.responses.HTMLResponse
# )
# async def html_tournament_display(request: fastapi.Request, uid: str | None):
#     async with db.operator() as op:
#         context = await session_context(op, request)
#         context["tournament"] = await op.get_tournament(uid)
#     return resources.templates.TemplateResponse(
#         request=request,
#         name="tournament/display.html.j2",
#         context=context,
#     )


# @app.get("/tournament/{uid}/edit.html", response_class=fastapi.responses.HTMLResponse)
# async def html_tournament_edit(request: fastapi.Request, uid: str | None):
#     async with db.operator() as op:
#         context = await session_context(op, request)
#         context["tournament"] = await op.get_tournament(uid)
#     return resources.templates.TemplateResponse(
#         request=request,
#         name="tournament/edit.html.j2",
#         context=context,
#     )


# @app.get(
#     "/tournament/{uid}/console.html", response_class=fastapi.responses.HTMLResponse
# )
# async def html_tournament_console(request: fastapi.Request, uid: str | None):
#     async with db.operator() as op:
#         context = await session_context(op, request)
#         context["tournament"] = await op.get_tournament(uid)
#         context["members"] = await op.get_members()
#     return resources.templates.TemplateResponse(
#         request=request,
#         name="tournament/console.html.j2",
#         context=context,
#     )


# # ################################################################################# AUTH
# def hash_state(state: str):
#     return itsdangerous.url_safe.URLSafeSerializer(SESSION_KEY, "state").dumps(state)


# @app.get("/auth/discord/", response_class=fastapi.responses.HTMLResponse)
# async def auth_discord(request: fastapi.Request, code: str, state: str):
#     if state != hash_state(request.session["state"]):
#         logger.warning("wrong state %s", state)
#         request.session["state"] = str(uuid.uuid4)
#         return resources.templates.TemplateResponse(
#             request=request,
#             name="401.html.j2",
#             status_code=401,
#             context=oauth_context(request),
#         )
#     user = None
#     async with aiohttp.ClientSession("https://discord.com") as session:
#         async with session.post(
#             "/api/v10/oauth2/token",
#             data={
#                 "grant_type": "authorization_code",
#                 "code": code,
#                 "redirect_uri": DISCORD_REDIRECT_URI,
#             },
#             auth=aiohttp.BasicAuth(DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET),
#         ) as res:
#             data = await res.json()
#             auth = models.DiscordAuth(**data)

#             async with session.get(
#                 "/api/v10/users/@me",
#                 headers={"Authorization": f"Bearer {auth.access_token}"},
#             ) as res:
#                 data = await res.json()
#                 print(data)
#                 user = models.DiscordUser(auth=auth, **data)
#     if user:
#         async with db.operator() as op:
#             member = await op.upsert_member_discord(user)
#             request.session["user_id"] = member.uid
#             request.session.pop("state")
#             return fastapi.responses.RedirectResponse(request.url_for("html_index"))
#     return resources.templates.TemplateResponse(
#         request=request,
#         name="401.html.j2",
#         status_code=401,
#         context=oauth_context(request),
#     )


# @app.get("/auth/claim_vekn/", response_class=fastapi.responses.HTMLResponse)
# async def auth_claim_vekn(request: fastapi.Request, vekn: str):
#     if "user_id" not in request.session:
#         return resources.templates.TemplateResponse(
#             request=request,
#             name="401.html.j2",
#             status_code=401,
#             context=oauth_context(request),
#         )
#     async with db.operator() as op:
#         new_uid = await op.claim_vekn(request.session["user_id"], vekn)
#         if new_uid is None:
#             return resources.templates.TemplateResponse(
#                 request=request,
#                 name="401.html.j2",
#                 status_code=401,
#             )
#         request.session["user_id"] = new_uid
#         logger.warning("uid is now %s", new_uid)
#     return fastapi.responses.RedirectResponse(request.url_for("html_profile"))


# @app.get("/auth/abandon_vekn/", response_class=fastapi.responses.HTMLResponse)
# async def auth_abandon_vekn(request: fastapi.Request):
#     if "user_id" not in request.session:
#         return resources.templates.TemplateResponse(
#             request=request,
#             name="401.html.j2",
#             status_code=401,
#             context=oauth_context(request),
#         )
#     async with db.operator() as op:
#         new_uid = await op.abandon_vekn(request.session["user_id"])
#         if new_uid is None:
#             request.session.pop("user_id")
#             return resources.templates.TemplateResponse(
#                 request=request,
#                 name="401.html.j2",
#                 status_code=401,
#                 context=oauth_context(request),
#             )
#         request.session["user_id"] = new_uid
#         logger.warning("uid is now %s", new_uid)
#     return fastapi.responses.RedirectResponse(request.url_for("html_profile"))


# @app.get("/auth/logout/", response_class=fastapi.responses.HTMLResponse)
# async def auth_logout(request: fastapi.Request):
#     request.session.pop("user_id", None)
#     return fastapi.responses.RedirectResponse(request.url_for("html_index"))


# # ################################################################################## API
# @app.get(
#     "/api/auth/token",
#     summary="Get a bearer token to use the API. Requires the session cookie of an authenticated client.",
# )
# async def api_auth_token(request: fastapi.Request) -> Token:
#     """Provide a session token for web clients.

#     Requires successful authentication first on the /auth endpoints.
#     This follows the Token-Mediating Backend (TMB) pattern from IETF
#     OAuth 2.0 for Browser-Based Applications
#     https://datatracker.ietf.org/doc/html/draft-ietf-oauth-browser-based-apps
#     """
#     if "user_id" not in request.session:
#         return fastapi.responses.HTMLResponse(status_code=401)
#     access_token = create_access_token(request.session["user_id"])
#     return Token(access_token=access_token, token_type="bearer")


# def create_access_token(user_id: str):
#     to_encode = {"user": user_id}
#     expire = datetime.datetime.now(tz=datetime.timezone.utc) + datetime.timedelta(
#         days=7
#     )
#     to_encode.update({"exp": expire})
#     encoded_jwt = jwt.encode(to_encode, TOKEN_SECRET, algorithm=JWT_ALGORITHM)
#     return encoded_jwt


# async def get_member_from_token(
#     token: typing.Annotated[str, fastapi.Depends(oauth2_scheme)], op: DbOperator
# ):
#     credentials_exception = fastapi.HTTPException(
#         status_code=fastapi.status.HTTP_401_UNAUTHORIZED,
#         detail="Could not validate credentials",
#         headers={"WWW-Authenticate": "Bearer"},
#     )
#     try:
#         payload = jwt.decode(token, TOKEN_SECRET, algorithms=[JWT_ALGORITHM])
#         user_id: str = payload.get("user")
#         if user_id is None:
#             raise credentials_exception
#     except jwt.exceptions.InvalidTokenError:
#         raise credentials_exception
#     member = await op.get_member(user_id)
#     if member is None:
#         raise credentials_exception
#     return member


# Member = typing.Annotated[models.Member, fastapi.Depends(get_member_from_token)]


# @app.get("/api/country", summary="List all countries")
# async def api_countries() -> list[models.Country]:
#     """List all countries"""
#     return resources.countries


# @app.get("/api/country/{country}/city", summary="List cities of given country")
# async def api_country_cities(country: str) -> list[models.City]:
#     """List cities of given country.

#     Only cities **over 15k population** are listed.
#     Open-source information made availaible by [Geonames](https://geonames.org).

#     - **country**: The country name, field `country` of `/api/countries`
#     """
#     return resources.cities.get(country, [])


# @app.post("/api/tournament", summary="Create a new tournament")
# async def api_post_tournament(
#     request: fastapi.Request,
#     tournament: models.Tournament,
#     member: Member,
# ):
#     """Create a new tournament"""
#     tournament.organizer = member.uid
#     async with db.operator() as op:
#         uid = await op.create_tournament(tournament)
#     return {"uid": uid, "url": str(request.url_for("html_tournament_display", uid=uid))}


# @app.put("/api/tournament/{uid}", summary="Update tournament information")
# async def api_put_tournament(
#     request: fastapi.Request, uid: str, tournament: models.Tournament
# ):
#     """Update tournament information

#     - **uid**: The tournament unique ID
#     """
#     tournament.uid = uid
#     async with db.operator() as op:
#         uid = await op.update_tournament(tournament)
#     return {"uid": uid, "url": str(request.url_for("html_tournament_display", uid=uid))}


# @app.get("/api/tournament", summary="List all tournaments")
# async def api_get_tournaments() -> list[models.Tournament]:
#     """List all tournaments"""
#     async with db.operator() as op:
#         return await op.get_tournaments()


# @app.get("/api/tournament/{uid}", summary="Get tournament information")
# async def api_get_tournament(uid: str) -> models.Tournament:
#     """Get tournament information

#     - **uid**: The tournament unique ID
#     """
#     async with db.operator() as op:
#         return await op.get_tournament(uid)


# @app.post("/api/tournament/{uid}/event", summary="Add tournament event")
# async def api_post_tournament_event(
#     request: fastapi.Request, uid: str, event: events.TournamentEvent
# ):
#     """Update tournament information

#     - **uid**: The tournament unique ID
#     """
#     async with db.operator() as op:
#         orchestrator = await op.get_tournament(uid, engine.TournamentOrchestrator)
#         orchestrator.handle_event(event)
#         await op.update_tournament(orchestrator)

#     return orchestrator


# # ################################################################################## Doc
# def custom_openapi():
#     if app.openapi_schema:
#         return app.openapi_schema
#     app.openapi_schema = fastapi.openapi.utils.get_openapi(
#         title="Archon API",
#         version=importlib.metadata.version("vtes-archon"),
#         summary="VTES tournament management",
#         description="You can use this API to build tournament management tools",
#         routes=[r for r in app.routes if r.path.startswith("/api/")],
#     )
#     return app.openapi_schema


# app.openapi = custom_openapi
