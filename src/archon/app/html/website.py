import fastapi
import fastapi.encoders
import fastapi.security
import fastapi.templating
import importlib.resources
import logging
import typing


from .. import dependencies
from ... import geo
from ... import models

LOG = logging.getLogger()


def jsonable(obj: typing.Any) -> typing.Any:
    """Useful filter for Jinja templates: `{{ data | jsonable | tojson }}`"""
    return fastapi.encoders.jsonable_encoder(obj)


def country_with_flag(country_name: str) -> str:
    return geo.COUNTRIES_BY_NAME[country_name].flag + " " + country_name


def __init_templates() -> fastapi.templating.Jinja2Templates:
    """Initialize Jinja2 templates engine"""
    with importlib.resources.path("archon", "templates") as templates:
        templates = fastapi.templating.Jinja2Templates(
            directory=templates, extensions=["jinja2.ext.i18n"]
        )
        templates.env.filters["jsonable"] = jsonable
        templates.env.filters["country_with_flag"] = country_with_flag
        return templates


TEMPLATES = __init_templates()


router = fastapi.APIRouter(
    default_response_class=fastapi.responses.HTMLResponse,
)


@router.get(
    "/auth/oauth",
    summary="Get an authorization code with the user's approval",
    tags=["oauth"],
)
async def html_auth_oauth(
    client_id: typing.Annotated[str, fastapi.Query()],
    redirect_uri: typing.Annotated[str, fastapi.Query()],
    state: typing.Annotated[str, fastapi.Query()],
    member_uid: dependencies.MemberUidFromSession,
):
    # TODO: display a page asking for the user's authorization
    next = fastapi.datastructures.URL(redirect_uri)
    next = next.include_query_params(
        state=state, code=dependencies.create_authorization_code(client_id, member_uid)
    )
    return fastapi.responses.RedirectResponse(next)


@router.post(
    "/auth/oauth/token",
    summary="Use the authorization code to get a bearer token to use the API.",
    response_class=fastapi.responses.ORJSONResponse,
    tags=["oauth"],
)
async def html_auth_oauth_token(
    grant_type: typing.Annotated[str, fastapi.Form()],
    code: typing.Annotated[str, fastapi.Form()],
    client_uid: dependencies.ClientLogin,
):
    if grant_type != "authorization_code":
        raise fastapi.HTTPException(status_code=403)
    member_uid = dependencies.check_authorization_code(client_uid, code)
    access_token = dependencies.create_access_token(member_uid)
    return dependencies.Token(access_token=access_token, token_type="Bearer")


@router.get("/auth/discord")
async def html_auth_discord(
    request: fastapi.Request,
    logged_in: dependencies.DiscordLogin,
):
    if logged_in:
        next = request.session.get("next", str(request.url_for("index")))
    else:
        request.session["message"] = "Login failed"
        next = str(request.url_for("login"))
    return fastapi.responses.RedirectResponse(next)


@router.get(
    "/auth/token",
    summary="Get a bearer token to use the API.",
    response_class=fastapi.responses.ORJSONResponse,
)
async def html_auth_token(request: fastapi.Request) -> dependencies.Token:
    """Provide an OAuth 2.0 access token for web clients.

    Requires an authenticated session (session cookie).
    This follows the Token-Mediating Backend (TMB) pattern from IETF draft
    "OAuth 2.0 for Browser-Based Applications"
    https://datatracker.ietf.org/doc/html/draft-ietf-oauth-browser-based-apps
    """
    # Not we do not use `dependencies.MemberUidFromSession` as it raise LoginRequired,
    # which ultimately results in an unexpected HTML response here (JSON endpoint)
    if not request.session.get("user_id", None):
        raise fastapi.HTTPException(fastapi.status.HTTP_401_UNAUTHORIZED)
    access_token = dependencies.create_access_token(request.session["user_id"])
    return dependencies.Token(access_token=access_token, token_type="Bearer")


@router.get("/auth/logout/")
async def html_auth_logout(request: fastapi.Request):
    dependencies.anonymous_session(request)
    return fastapi.responses.RedirectResponse(request.url_for("index"))


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
    return fastapi.responses.RedirectResponse(
        request.url_for("member_display", uid=new_member.uid)
    )


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
    return fastapi.responses.RedirectResponse(
        request.url_for("member_display", uid=new_member.uid)
    )


@router.get("/")
async def root(request: fastapi.Request):
    return fastapi.responses.RedirectResponse(request.url_for("index"))


@router.get("/index.html")
async def index(
    request: fastapi.Request,
    context: dependencies.SessionContext,
    op: dependencies.DbOperator,
):
    request.session["next"] = str(request.url_for("index"))
    members: list[models.Person] = await op.get_members()
    members.sort(key=lambda x: -x.ranking.constructed_onsite)
    members = [m for m in members[:1000] if m.ranking.constructed_onsite > 0]
    if "member" not in context:
        for member in members:
            member.name = ""
    context["members"] = members
    return TEMPLATES.TemplateResponse(
        request=request, name="index.html.j2", context=context
    )


@router.get("/login.html")
async def login(
    request: fastapi.Request,
    context: dependencies.SessionContext,
    next: typing.Annotated[str | None, fastapi.Query()] = None,
):
    if next:
        request.session["next"] = next
    return TEMPLATES.TemplateResponse(
        request=request, name="login.html.j2", context=context
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
    request.session["next"] = str(request.url_for("tournament_list"))
    tournaments = await op.get_tournaments()
    tournaments.sort(key=lambda x: x.start, reverse=True)
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
    request.session["next"] = str(
        request.url_for("tournament_display", uid=tournament.uid)
    )
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
    tournament: dependencies.TournamentConfig,
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
    member: dependencies.PersonFromSession,
):
    if not (
        models.MemberRole.ADMIN in member.roles
        or (
            models.MemberRole.NC in member.roles
            and tournament.country == member.country
        )
        or member.uid in [j.uid for j in tournament.judges]
    ):
        raise fastapi.HTTPException(
            status_code=fastapi.status.HTTP_403_FORBIDDEN,
            detail="A judge is required",
        )
    context["tournament"] = tournament
    return TEMPLATES.TemplateResponse(
        request=request,
        name="tournament/console.html.j2",
        context=context,
    )


@router.get("/tournament/{uid}/checkin.html")
async def tournament_display(
    request: fastapi.Request,
    context: dependencies.SessionContext,
    tournament: dependencies.Tournament,
    member_uid: dependencies.MemberUidFromSession,
):
    if member_uid not in tournament.judges:
        raise fastapi.HTTPException(fastapi.status.HTTP_403_FORBIDDEN)
    context["name"] = tournament.name
    context["code"] = tournament.checkin_code
    return TEMPLATES.TemplateResponse(
        request=request,
        name="tournament/checkin.html.j2",
        context=context,
    )


@router.get("/tournament/{uid}/print-seating.html")
async def tournament_print_seating(
    request: fastapi.Request,
    context: dependencies.SessionContext,
    tournament: dependencies.Tournament,
    round: typing.Annotated[int, fastapi.Query()],
    _: dependencies.MemberUidFromSession,
):
    context["round_number"] = round
    context["round"] = []
    if round == len(tournament.rounds) and tournament.finals_seeds:
        context["finals"] = True
        data = []
        for uid in tournament.finals_seeds:
            player = tournament.players[uid]
            data.append({"vekn": player.vekn, "name": player.name})
        context["round"].append(data)
    else:
        for table in tournament.rounds[round - 1].tables:
            data = []
            for seat in table.seating:
                player = tournament.players[seat.player_uid]
                data.append({"vekn": player.vekn, "name": player.name})
            context["round"].append(data)
    return TEMPLATES.TemplateResponse(
        request=request,
        name="tournament/print-seating.html.j2",
        context=context,
    )


@router.get("/document/tournament_rules.html")
async def document_tournament_rules(
    request: fastapi.Request, context: dependencies.SessionContext
):
    return TEMPLATES.TemplateResponse(
        request=request,
        name="document/tournament_rules.html.j2",
        context=context,
    )


@router.get("/document/judges-guide.html")
async def document_judges_guide(
    request: fastapi.Request, context: dependencies.SessionContext
):
    return TEMPLATES.TemplateResponse(
        request=request,
        name="document/judges_guide.html.j2",
        context=context,
    )


@router.get("/document/code-of-ethics.html")
async def document_code_of_ethics(
    request: fastapi.Request, context: dependencies.SessionContext
):
    return TEMPLATES.TemplateResponse(
        request=request,
        name="document/code_of_ethics.html.j2",
        context=context,
    )


@router.get("/member/list.html")
async def member_list(
    request: fastapi.Request,
    context: dependencies.SessionContext,
    member: dependencies.PersonFromSession,
):
    return TEMPLATES.TemplateResponse(
        request=request,
        name="member/list.html.j2",
        context=context,
    )


@router.get("/member/{uid}/display.html")
async def member_display(
    request: fastapi.Request,
    context: dependencies.SessionContext,
    member: dependencies.PersonFromSession,
    op: dependencies.DbOperator,
    uid: typing.Annotated[str, fastapi.Path()],
):
    if member.uid != uid and not member.vekn:
        target = await op.get_member(uid)
        dependencies.check_can_contact(member, target)
    return TEMPLATES.TemplateResponse(
        request=request,
        name="member/display.html.j2",
        context=context,
    )
