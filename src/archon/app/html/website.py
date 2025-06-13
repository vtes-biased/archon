import dataclasses
import fastapi
import fastapi.encoders
import fastapi.templating
import importlib.resources
import logging
import math
import typing


from .. import dependencies
from ... import geo
from ... import models
from ... import engine
from ... import scoring

LOG = logging.getLogger()


def jsonable(obj: typing.Any) -> typing.Any:
    """Useful filter for Jinja templates: `{{ data | jsonable | tojson }}`"""
    return fastapi.encoders.jsonable_encoder(obj)


def country_with_flag(country_name: str) -> str:
    if not country_name:
        return ""
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


@router.get(
    "/auth/discord",
    summary="Endpoint where the user is redirected after having logged in Discord",
)
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


@router.post(
    "/auth/email/reset",
    summary="Ask for a password reset for a given email",
)
async def html_post_auth_email_reset(
    request: fastapi.Request,
    email: dependencies.EmailAddress,
):
    await dependencies.send_reset_email(email)
    request.session["message"] = (
        "Check your email for the link to create or reset your password."
    )
    return fastapi.responses.RedirectResponse(request.url_for("login"), status_code=303)


@router.get(
    "/auth/email/reset",
    summary="Check the reset link is valid, then ask the user to set a new password",
)
async def html_get_auth_email_reset(
    request: fastapi.Request,
    uid: dependencies.EmailReset,
):
    if uid:
        return fastapi.responses.RedirectResponse(
            request.url_for("member_display", uid=uid).include_query_params(reset=True)
        )
    else:
        request.session["message"] = "Email verification URL is invalid or outdated"
        return fastapi.responses.RedirectResponse(request.url_for("login"))


@router.post(
    "/auth/email",
    summary="HTML Basic auth - standard email/password login",
)
async def html_auth_email(
    request: fastapi.Request,
    logged_in: dependencies.EmailLogin,
):
    if logged_in:
        next = request.session.get("next", str(request.url_for("index")))
    else:
        request.session["message"] = (
            "Login failed<br>"
            '<em>Try another login method, or enter your e-mail and click the "Reset Password" button</em>'
        )
        next = str(request.url_for("login"))
    return fastapi.responses.RedirectResponse(next, status_code=303)


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
    return fastapi.responses.RedirectResponse(
        request.url_for("index"), fastapi.status.HTTP_308_PERMANENT_REDIRECT
    )


def _ranked(members: list[models.Person], category: models.RankingCategoy):
    members.sort(key=lambda x: -x.ranking.get(category, 0))
    rank, passed, rating = 0, 0, math.inf
    for member in members:
        member_rating = member.ranking.get(category, 0)
        if member_rating == 0:
            break
        if member_rating < rating:
            rank += 1 + passed
            rating = member_rating
            passed = 0
        else:
            passed += 1
        if rank > 500:
            break
        yield rank, member


@dependencies.async_timed_cache()
async def _get_rankings(
    op: dependencies.DbOperator,
) -> dict[str, list[tuple[int, models.Person]]]:
    ret = {}
    for category in models.RankingCategoy:
        members = await op.get_ranked_members(category)
        ret[category.value] = list(_ranked(members, category))
    return ret


@dependencies.async_timed_cache()
async def _get_rankings_anonymised(
    op: dependencies.DbOperator,
) -> dict[str, list[tuple[int, models.Person]]]:
    ret = {}
    for category in models.RankingCategoy:
        members = await op.get_ranked_members(category)
        for member in members:
            member.name = ""
        ret[category.value] = list(_ranked(members, category))
    return ret


@router.get("/index.html")
async def index(
    request: fastapi.Request,
    context: dependencies.SessionContext,
    op: dependencies.DbOperator,
):
    request.session["next"] = str(request.url_for("index"))
    if "member" not in context:
        rankings = await _get_rankings_anonymised(op)
    else:
        rankings = await _get_rankings(op)
    context["members"] = rankings
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
    message = request.session.pop("message", None)
    logging.warning("message: %s", message)
    if message:
        context["message"] = message
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
):
    request.session["next"] = str(request.url_for("tournament_list"))
    return TEMPLATES.TemplateResponse(
        request=request,
        name="tournament/list.html.j2",
        context=context,
    )


def _filter(cls, filter_cls, obj):
    return cls(**dataclasses.asdict(filter_cls(**dataclasses.asdict(obj))))


@router.get("/tournament/{uid}/display.html")
async def tournament_display(
    request: fastapi.Request,
    context: dependencies.SessionContext,
    tournament: dependencies.TournamentInfo,
):
    request.session["next"] = str(
        request.url_for("tournament_display", uid=tournament.uid)
    )
    # filter out other members info
    member_uid = request.session.get("user_id", None)
    provide_score = set()
    if member_uid:
        provide_score.add(member_uid)
    if tournament.standings_mode == models.StandingsMode.TOP_10:
        for rank, player in engine.standings(tournament):
            if rank > 10:
                break
            provide_score.add(player.uid)
    if tournament.standings_mode == models.StandingsMode.CUTOFF:
        cutoff = scoring.Score()
        for rank, player in engine.standings(tournament):
            cutoff = player.result
            if rank > 5:
                break
        context["cutoff"] = cutoff
    for k, v in tournament.players.items():
        if (
            tournament.standings_mode == models.StandingsMode.PUBLIC
            or tournament.state
            in [models.TournamentState.FINALS, models.TournamentState.FINISHED]
            or k in provide_score
        ):
            tournament.players[k] = _filter(models.Player, models.PlayerInfo, v)
        elif k == member_uid:
            pass
        else:
            tournament.players[k] = _filter(models.Player, models.PublicPerson, v)
    # multideck tournaments: keep the deck info per round only for the player asking
    for round_ in tournament.rounds:
        for table in round_.tables:
            for i, seat in enumerate(table.seating):
                if seat.player_uid != member_uid:
                    table.seating[i] = _filter(models.TableSeat, models.SeatInfo, seat)
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
    if member_uid not in [j.uid for j in tournament.judges]:
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
):
    context["tournament"] = tournament
    return TEMPLATES.TemplateResponse(
        request=request,
        name="tournament/console.html.j2",
        context=context,
    )


@router.get("/tournament/{uid}/checkin.html")
async def tournament_checkin(
    request: fastapi.Request,
    context: dependencies.SessionContext,
    tournament: dependencies.Tournament,
):
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


@router.get("/tournament/{uid}/print-standings.html")
async def tournament_print_standings(
    request: fastapi.Request,
    context: dependencies.SessionContext,
    tournament: dependencies.Tournament,
):
    context["round_number"] = len(tournament.rounds)
    standings = engine.standings(tournament)
    finished = tournament.state == models.TournamentState.FINISHED
    context["finished"] = finished
    if finished:
        context["standings"] = standings
    else:
        match tournament.standings_mode:
            case models.StandingsMode.PRIVATE:
                context["private"] = True
            case models.StandingsMode.CUTOFF:
                context["cutoff"] = standings[4][1].result
            case models.StandingsMode.TOP_10:
                context["standings"] = [(r, p) for r, p in standings if r <= 10]
            case models.StandingsMode.PUBLIC:
                context["standings"] = standings
    return TEMPLATES.TemplateResponse(
        request=request,
        name="tournament/print-standings.html.j2",
        context=context,
    )


@router.get("/document/archon-help.html")
async def document_archon_help(
    request: fastapi.Request, context: dependencies.SessionContext
):
    return TEMPLATES.TemplateResponse(
        request=request,
        name="document/archon-help.html.j2",
        context=context,
    )


@router.get("/document/tournament-rules.html")
async def document_tournament_rules(
    request: fastapi.Request, context: dependencies.SessionContext
):
    return TEMPLATES.TemplateResponse(
        request=request,
        name="document/tournament-rules.html.j2",
        context=context,
    )


@router.get("/document/judges-guide.html")
async def document_judges_guide(
    request: fastapi.Request, context: dependencies.SessionContext
):
    return TEMPLATES.TemplateResponse(
        request=request,
        name="document/judges-guide.html.j2",
        context=context,
    )


@router.get("/document/code-of-ethics.html")
async def document_code_of_ethics(
    request: fastapi.Request, context: dependencies.SessionContext
):
    return TEMPLATES.TemplateResponse(
        request=request,
        name="document/code-of-ethics.html.j2",
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
    reset: typing.Annotated[bool, fastapi.Query()] | None = None,
):
    if member.uid != uid and not member.vekn:
        target = await op.get_member(uid)
        dependencies.check_can_contact(member, target)
    return TEMPLATES.TemplateResponse(
        request=request,
        name="member/display.html.j2",
        context=context,
    )


@router.get("/league/{uid}/display.html")
async def league_display(
    request: fastapi.Request,
    context: dependencies.SessionContext,
    _: dependencies.MemberUidFromSession,
    uid: typing.Annotated[str, fastapi.Path()],
):
    request.session["next"] = str(request.url_for("league_display", uid=uid))
    context["league_uid"] = uid
    return TEMPLATES.TemplateResponse(
        request=request,
        name="league/display.html.j2",
        context=context,
    )


@router.get("/league/list.html")
async def league_list(
    request: fastapi.Request,
    context: dependencies.SessionContext,
):
    request.session["next"] = str(request.url_for("league_list"))
    return TEMPLATES.TemplateResponse(
        request=request,
        name="league/list.html.j2",
        context=context,
    )


@router.get("/league/create.html")
async def league_create(
    request: fastapi.Request,
    context: dependencies.SessionContext,
    member: dependencies.PersonFromSession,
):
    request.session["next"] = str(request.url_for("league_create"))
    dependencies.check_organizer(member)
    return TEMPLATES.TemplateResponse(
        request=request,
        name="league/display.html.j2",
        context=context,
    )
