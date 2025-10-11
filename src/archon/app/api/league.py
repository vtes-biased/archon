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


@router.get("/", summary="Get all leagues (paginated)")
async def api_league_get_all(
    filter: typing.Annotated[models.LeagueFilter, fastapi.Query()],
    op: dependencies.DbOperator,
) -> tuple[models.TournamentFilter, list[models.LeagueMinimal]]:
    if filter.uid or filter.country or not filter.online:
        filter = filter
    else:
        filter = None
    return await op.get_leagues(filter)


@router.get("/full", summary="Get all leagues (full, minimal information)")
async def api_league_get_all_minimal(
    op: dependencies.DbOperator,
    _: dependencies.MemberUidFromToken,
    kind: models.LeagueKind | None = None,
) -> list[models.LeagueMinimal]:
    """Get all leagues, optionally filtered by type."""
    return await op.get_minimal_leagues(kind=kind)


@router.post("/", summary="Create league")
async def api_league_post(
    request: fastapi.Request,
    member: dependencies.PersonFromToken,
    data: typing.Annotated[models.League, fastapi.Body()],
    op: dependencies.DbOperator,
) -> dependencies.ItemUrl:
    dependencies.check_organizer(member)
    data.organizers = await op.get_members(
        list({j.uid for j in data.organizers} | {member.uid})
    )

    # Validate parent_league if set
    if data.parent:
        # League with parent must be a regular league
        if data.kind != models.LeagueKind.LEAGUE:
            raise fastapi.HTTPException(
                status_code=400,
                detail="Only regular leagues can have a parent league",
            )
        if data.parent.uid == data.uid:
            raise fastapi.HTTPException(
                status_code=400, detail="Cannot set league as its own parent"
            )
        # Check parent exists and is a meta-league
        parent = await op.get_league_with_tournaments(data.parent.uid)
        if parent.kind != models.LeagueKind.META:
            raise fastapi.HTTPException(
                status_code=400, detail="Parent league must be a meta-league"
            )
        if parent.parent:
            raise fastapi.HTTPException(
                status_code=400,
                detail="Cannot create 3-level hierarchy: parent league already has a parent",
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
    # Get full league data for validation
    current_league = await op.get_league_with_tournaments(uid)
    dependencies.check_can_admin_league(member, current_league)
    match data.kind:
        case models.LeagueKind.LEAGUE:
            if current_league.leagues:
                raise fastapi.HTTPException(
                    status_code=400,
                    detail="Normal leagues cannot have has child leagues",
                )
            if data.parent:
                if data.parent.uid == data.uid:
                    raise fastapi.HTTPException(
                        status_code=400, detail="Cannot set league as its own parent"
                    )
                parent = await op.get_league(data.parent.uid)
                if parent.kind != models.LeagueKind.META:
                    raise fastapi.HTTPException(
                        status_code=400, detail="Parent league must be a meta-league"
                    )
        case models.LeagueKind.META:
            if data.parent:
                raise fastapi.HTTPException(
                    status_code=400,
                    detail="Meta-leagues cannot have a parent league",
                )

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
