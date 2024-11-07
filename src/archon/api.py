import fastapi
import fastapi.responses
import fastapi.staticfiles
import fastapi.templating
import importlib.resources
import contextlib
import orjson

from . import db
from . import models


class Resources:
    templates: fastapi.templating.Jinja2Templates
    countries: list[models.Country]
    cities: dict[str, list[models.City]]


resources = Resources()


@contextlib.asynccontextmanager
async def lifespan(app: fastapi.FastAPI):
    await db.POOL.open()
    with (
        importlib.resources.path("archon", "img") as img,
        importlib.resources.path("archon", "static") as static,
        importlib.resources.path("archon", "templates") as templates,
        importlib.resources.path("archon", "geodata") as geodata,
    ):
        resources.templates = fastapi.templating.Jinja2Templates(
            directory=templates, extensions=["jinja2.ext.i18n"]
        )
        with importlib.resources.as_file(geodata / "countries.json") as countries:
            resources.countries = [
                models.Country(**d) for d in orjson.loads(countries.read_bytes())
            ]
            resources.countries.sort(key=lambda x: x.country)
        resources.cities = {}
        with importlib.resources.as_file(geodata / "cities.json") as cities:
            for data in orjson.loads(cities.read_bytes()):
                city = models.City(**data)
                resources.cities.setdefault(city.country_name, [])
                resources.cities[city.country_name].append(city)
                # some cities are listed as part of multiple countries
                for cc in city.cc2:
                    resources.cities.setdefault(cc, [])
                    resources.cities[cc].append(city)
            for l in resources.cities.values():
                l.sort(key=lambda x: (x.name, x.admin1, x.admin2))
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
        # idempotent init, call it every time
        await db.init()
        yield
    await db.POOL.close()


app = fastapi.FastAPI(redoc_url="/docs", lifespan=lifespan)


@app.get("/index.html", response_class=fastapi.responses.HTMLResponse)
async def html_index(request: fastapi.Request):
    return resources.templates.TemplateResponse(request=request, name="index.html.j2")


@app.get("/tournament/create.html", response_class=fastapi.responses.HTMLResponse)
async def html_tournament_create(request: fastapi.Request):
    return resources.templates.TemplateResponse(
        request=request, name="tournament/create.html.j2"
    )


@app.get("/tournament/list.html", response_class=fastapi.responses.HTMLResponse)
async def html_tournament_list(request: fastapi.Request):
    async with db.operator() as op:
        tournaments = await op.get_tournaments()
    tournaments.sort(key=lambda x: x.start)
    return resources.templates.TemplateResponse(
        request=request,
        name="tournament/list.html.j2",
        context={"tournaments": tournaments},
    )


@app.get(
    "/tournament/{uid}/display.html", response_class=fastapi.responses.HTMLResponse
)
async def html_tournament_display(request: fastapi.Request, uid: str | None):
    async with db.operator() as op:
        tournament = await op.get_tournament(uid)
    return resources.templates.TemplateResponse(
        request=request,
        name="tournament/display.html.j2",
        context={"tournament": tournament},
    )


@app.get("/tournament/{uid}/edit.html", response_class=fastapi.responses.HTMLResponse)
async def html_tournament_edit(request: fastapi.Request, uid: str | None):
    async with db.operator() as op:
        tournament = await op.get_tournament(uid)
    return resources.templates.TemplateResponse(
        request=request,
        name="tournament/edit.html.j2",
        context={"tournament": tournament},
    )


# ################################################################################## API
@app.get("/api/country/")
async def api_countries() -> list[models.Country]:
    return resources.countries


@app.get("/api/country/{country}/city")
async def api_country_cities(country: str) -> list[models.City]:
    return resources.cities.get(country, [])


@app.post("/api/tournament/")
async def api_post_tournament(request: fastapi.Request, tournament: models.Tournament):
    async with db.operator() as op:
        uid = await op.create_tournament(tournament)
    return {"uid": uid, "url": str(request.url_for("html_tournament_display", uid=uid))}


@app.put("/api/tournament/{uid}")
async def api_post_tournament(
    request: fastapi.Request, uid: str, tournament: models.Tournament
):
    tournament.uid = uid
    async with db.operator() as op:
        uid = await op.update_tournament(tournament)
    return {"uid": uid, "url": str(request.url_for("html_tournament_display", uid=uid))}


@app.get("/api/tournament/")
async def api_get_tournaments() -> list[models.Tournament]:
    async with db.operator() as op:
        return await op.get_tournaments()


@app.get("/api/tournament/{uid}")
async def api_get_tournament(uid: str) -> models.Tournament:
    async with db.operator() as op:
        return await op.get_tournament(uid)
