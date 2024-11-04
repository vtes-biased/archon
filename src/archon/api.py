import fastapi
import fastapi.responses
import fastapi.staticfiles
import fastapi.templating
import importlib.resources
import contextlib


resources = {}


@contextlib.asynccontextmanager
async def lifespan(app: fastapi.FastAPI):
    with (
        importlib.resources.path("archon", "img") as img,
        importlib.resources.path("archon", "static") as static,
        importlib.resources.path("archon", "templates") as templates,
    ):
        resources["templates"] = fastapi.templating.Jinja2Templates(
            directory=templates, extensions=["jinja2.ext.i18n"]
        )
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

        yield
        resources.clear()


app = fastapi.FastAPI(redoc_url="/docs", lifespan=lifespan)


@app.get("/index.html", response_class=fastapi.responses.HTMLResponse)
async def html_index(request: fastapi.Request):
    return resources["templates"].TemplateResponse(
        request=request, name="index.html.j2"
    )


@app.get("/api/events/")
async def read_events():
    return [{"name": "Foo"}]
