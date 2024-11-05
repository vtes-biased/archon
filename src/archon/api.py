import fastapi
import fastapi.responses
import fastapi.staticfiles
import fastapi.templating
import importlib.resources
import contextlib
import orjson

from . import db
from . import models


resources = {}


@contextlib.asynccontextmanager
async def lifespan(app: fastapi.FastAPI):
    await db.POOL.open()
    with (
        importlib.resources.path("archon", "img") as img,
        importlib.resources.path("archon", "static") as static,
        importlib.resources.path("archon", "templates") as templates,
        importlib.resources.path("archon", "geodata") as geodata,
    ):
        resources["templates"] = fastapi.templating.Jinja2Templates(
            directory=templates, extensions=["jinja2.ext.i18n"]
        )
        with importlib.resources.as_file(geodata / "countries.json") as countries:
            resources["countries"] = [
                models.Country(**d) for d in orjson.loads(countries.read_bytes())
            ]
        resources["cities"] = {}
        with importlib.resources.as_file(geodata / "cities.json") as cities:
            for data in orjson.loads(cities.read_bytes()):
                city = models.City(**data)
                resources["cities"].setdefault(city.country_code, [])
                resources["cities"][city.country_code].append(city)
                # some cities are listed as part of multiple countries
                for cc in city.cc2:
                    resources["cities"].setdefault(cc, [])
                    resources["cities"][cc].append(city)
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
        await db.init()
        yield
        resources.clear()
    await db.POOL.close()


app = fastapi.FastAPI(redoc_url="/docs", lifespan=lifespan)


@app.get("/index.html", response_class=fastapi.responses.HTMLResponse)
async def html_index(request: fastapi.Request):
    return resources["templates"].TemplateResponse(
        request=request, name="index.html.j2"
    )


@app.get("/tournament.html", response_class=fastapi.responses.HTMLResponse)
async def html_tournament(request: fastapi.Request):
    return resources["templates"].TemplateResponse(
        request=request, name="tournament.html.j2"
    )


@app.get("/api/countries/")
async def api_countries() -> list[models.Country]:
    return resources["countries"]


@app.get("/api/countries/{country}/cities")
async def api_countries_cities(country: str) -> list[models.City]:
    return resources["cities"].get(country, [])


@app.post("/api/tournaments/")
async def api_post_tournaments(tournament: models.Tournament):
    async with db.operator() as op:
        await op.create_tournament(tournament)


@app.get("/api/tournaments/")
async def api_get_tournaments() -> list[models.Tournament]:
    async with db.operator() as op:
        return await op.get_tournaments()
