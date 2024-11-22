import fastapi
import fastapi.encoders
import fastapi.templating
import importlib.resources
import typing


from .. import dependencies


def jsonable(obj: typing.Any) -> typing.Any:
    """Useful filter for Jinja templates: `{{ data | jsonable | tojson }}`"""
    return fastapi.encoders.jsonable_encoder(obj)


def __init_templates() -> fastapi.templating.Jinja2Templates:
    """Initialize Jinja2 templates engine"""
    with importlib.resources.path("archon", "templates") as templates:
        templates = fastapi.templating.Jinja2Templates(
            directory=templates, extensions=["jinja2.ext.i18n"]
        )
        templates.env.filters["jsonable"] = jsonable
        return templates


TEMPLATES = __init_templates()


router = fastapi.APIRouter(
    default_response_class=fastapi.responses.HTMLResponse,
)


@router.get("/auth/discord")
async def html_auth_discord(
    request: fastapi.Request,
    logged_in: dependencies.DiscordLogin,
):
    if not logged_in:
        request.session["message"] = "Login failed"
    next = request.session.get("next", request.url_for("html_index"))
    return fastapi.responses.RedirectResponse(next)


@router.get(
    "/auth/token",
    summary="Get a bearer token to use the API.",
    response_class=fastapi.responses.ORJSONResponse,
)
async def html_auth_token(
    member_uid: dependencies.MemberUidFromSession,
) -> dependencies.Token:
    """Provide an OAuth 2.0 access token for web clients.

    Requires an authenticated session (session cookie).
    This follows the Token-Mediating Backend (TMB) pattern from IETF draft
    "OAuth 2.0 for Browser-Based Applications"
    https://datatracker.ietf.org/doc/html/draft-ietf-oauth-browser-based-apps
    """
    access_token = dependencies.create_access_token(member_uid)
    return dependencies.Token(access_token=access_token, token_type="Bearer")


@router.get("/auth/logout/")
async def html_auth_logout(request: fastapi.Request):
    dependencies.anonymous_session()
    return fastapi.responses.RedirectResponse(request.url_for("html_index"))


@router.get("/vekn/claim", response_class=fastapi.responses.HTMLResponse)
async def html_vekn_claim(
    request: fastapi.Request,
    vekn: typing.Annotated[str, fastapi.Query()],
    member_uid: dependencies.MemberUidFromSession,
    op: dependencies.DbOperator,
):
    new_member = await op.claim_vekn(member_uid, vekn)
    if new_member is None:
        raise fastapi.HTTPException(
            fastapi.status.HTTP_403_FORBIDDEN,
            detail="This VEKN does not exist or is already claimed",
        )
    dependencies.authenticated_session(request, new_member)
    dependencies.LOG.warning("uid is now %s", new_member.uid)
    return fastapi.responses.RedirectResponse(request.url_for("html_profile"))


@router.get("/vekn/abandon", response_class=fastapi.responses.HTMLResponse)
async def html_vekn_abandon(
    request: fastapi.Request,
    member_uid: dependencies.MemberUidFromSession,
    op: dependencies.DbOperator,
):
    new_member = await op.abandon_vekn(member_uid)
    if new_member is None:
        raise fastapi.HTTPException(
            fastapi.status.HTTP_404_NOT_FOUND,
            detail="No VEKN to abandon",
        )
    dependencies.authenticated_session(request, new_member)
    dependencies.LOG.warning("uid is now %s", new_member.uid)
    return fastapi.responses.RedirectResponse(request.url_for("html_profile"))


@router.get("/index.html")
async def index(request: fastapi.Request, context: dependencies.SessionContext):
    request.session["next"] = request.url_for("html_index")
    return TEMPLATES.TemplateResponse(
        request=request, name="index.html.j2", context=context
    )


@router.get("/profile.html")
async def profile(request: fastapi.Request, context: dependencies.SessionContext):
    request.session["next"] = request.url_for("profile")
    return TEMPLATES.TemplateResponse(
        request=request, name="profile.html.j2", context=context
    )


@router.get("/tournament/create.html")
async def tournament_create(
    request: fastapi.Request,
    context: dependencies.SessionContext,
    _: dependencies.MemberUidFromSession,
):
    return TEMPLATES.TemplateResponse(
        request=request, name="tournament/edit.html.j2", context=context
    )


@router.get("/tournament/list.html")
async def tournament_list(
    request: fastapi.Request,
    context: dependencies.SessionContext,
    op: dependencies.DbOperator,
):
    request.session["next"] = request.url_for("tournament_list")
    tournaments = await op.get_tournaments()
    tournaments.sort(key=lambda x: x.start)
    context["tournaments"] = tournaments
    return TEMPLATES.TemplateResponse(
        request=request,
        name="tournament/list.html.j2",
        context=context,
    )


@router.get("/tournament/{uid}/display.html")
async def tournament_display(
    request: fastapi.Request,
    context: dependencies.SessionContext,
    tournament: dependencies.Tournament,
):
    request.session["next"] = request.url_for("tournament_display")
    context["tournament"] = tournament
    return TEMPLATES.TemplateResponse(
        request=request,
        name="tournament/display.html.j2",
        context=context,
    )


@router.get("/tournament/{uid}/edit.html")
async def tournament_edit(
    request: fastapi.Request,
    context: dependencies.SessionContext,
    tournament: dependencies.Tournament,
    member_uid: dependencies.MemberUidFromSession,
):
    if member_uid not in tournament.judges:
        raise fastapi.HTTPException(
            status_code=fastapi.status.HTTP_403_FORBIDDEN,
            detail="A judge is required",
        )
    context["tournament"] = tournament
    return TEMPLATES.TemplateResponse(
        request=request,
        name="tournament/edit.html.j2",
        context=context,
    )


@router.get("/tournament/{uid}/console.html")
async def tournament_console(
    request: fastapi.Request,
    context: dependencies.SessionContext,
    tournament: dependencies.Tournament,
    op: dependencies.DbOperator,
    member_uid: dependencies.MemberUidFromSession,
):
    if member_uid not in tournament.judges:
        raise fastapi.HTTPException(
            status_code=fastapi.status.HTTP_403_FORBIDDEN,
            detail="A judge is required",
        )
    context["tournament"] = tournament
    context["members"] = await op.get_members()
    return TEMPLATES.TemplateResponse(
        request=request,
        name="tournament/console.html.j2",
        context=context,
    )
