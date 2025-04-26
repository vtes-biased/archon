import fastapi
import logging
import typing

from .. import dependencies
from ... import models

LOG = logging.getLogger()
router = fastapi.APIRouter(
    prefix="/api/leagues",
    default_response_class=fastapi.responses.ORJSONResponse,
    tags=["leagues"],
)


@router.get("/", summary="Get all leagues")
async def api_league_get_all(
    filter: typing.Annotated[models.LeagueFilter, fastapi.Query()],
    op: dependencies.DbOperator,
) -> tuple[models.TournamentFilter, list[models.League]]:
    if filter.uid or filter.country or not filter.online:
        filter = filter
    else:
        filter = None
    return await op.get_leagues(filter)


@router.post("/", summary="Create league")
async def api_league_post(
    request: fastapi.Request,
    member: dependencies.PersonFromToken,
    data: typing.Annotated[models.League, fastapi.Body()],
    op: dependencies.DbOperator,
) -> dependencies.ItemUrl:
    dependencies.check_organizer(member)
    data.organizers = await op.get_members(
        list(set([j.uid for j in data.organizers]) | {member.uid})
    )
    LOG.info("Creating new league: %s", data)
    uid = await op.create_league(data)
    return dependencies.ItemUrl(
        uid=uid, url=str(request.url_for("league_display", uid=uid))
    )


@router.get("/{uid}", summary="Get league")
async def api_league_get(
    _: dependencies.MemberUidFromToken,
    op: dependencies.DbOperator,
    uid: typing.Annotated[str, fastapi.Path()],
) -> models.LeagueWithTournaments:
    return await op.get_league_with_tournaments(uid)


@router.put("/{uid}", summary="Update league")
async def api_league_put(
    request: fastapi.Request,
    member: dependencies.PersonFromToken,
    uid: typing.Annotated[str, fastapi.Path()],
    data: typing.Annotated[models.League, fastapi.Body()],
    op: dependencies.DbOperator,
) -> dependencies.ItemUrl:
    league = await op.get_league(uid)
    dependencies.check_can_admin_league(member, league)
    data.uid = uid
    uid = await op.update_league(data)
    return dependencies.ItemUrl(
        uid=uid, url=str(request.url_for("league_display", uid=uid))
    )


@router.delete("/{uid}", summary="Delete league")
async def api_league_delete(
    member: dependencies.PersonFromToken,
    op: dependencies.DbOperator,
    uid: typing.Annotated[str, fastapi.Path()],
):
    league = await op.get_league(uid)
    dependencies.check_can_admin_league(member, league)
    await op.delete_league(uid)
