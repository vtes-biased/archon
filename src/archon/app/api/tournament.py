import fastapi
import typing

from .. import dependencies
from ... import events
from ... import models


router = fastapi.APIRouter(
    prefix="/api/tournaments",
    default_response_class=fastapi.responses.ORJSONResponse,
    tags=["tournaments"],
)


@router.get("/", summary="List all tournaments")
async def api_tournaments(
    op: dependencies.DbOperator,
) -> list[models.Tournament]:
    """List all tournaments"""
    return await op.get_tournaments()


@router.post("/", summary="Create a new tournament")
async def api_tournaments_post(
    request: fastapi.Request,
    tournament: typing.Annotated[models.Tournament, fastapi.Body()],
    member_uid: dependencies.MemberUidFromToken,
    op: dependencies.DbOperator,
) -> dependencies.TournamentUrl:
    """Create a new tournament"""
    tournament.judges = [member_uid]
    uid = await op.create_tournament(tournament)
    return dependencies.TournamentUrl(
        uid=uid, url=str(request.url_for("html_tournament_display", uid=uid))
    )


@router.put("/{uid}", summary="Update tournament information")
async def api_tournament_put(
    request: fastapi.Request,
    tournament: dependencies.Tournament,
    data: typing.Annotated[models.Tournament, fastapi.Body()],
    member_uid: dependencies.MemberUidFromToken,
    op: dependencies.DbOperator,
) -> dependencies.TournamentUrl:
    """Update tournament information

    - **uid**: The tournament unique ID
    """
    if member_uid not in tournament.judges:
        raise fastapi.HTTPException(
            fastapi.status.HTTP_403_FORBIDDEN, detail="A judge is required"
        )
    data.uid = tournament.uid
    uid = await op.update_tournament(tournament)
    return dependencies.TournamentUrl(
        uid=uid, url=str(request.url_for("html_tournament_display", uid=uid))
    )


@router.get("/{uid}", summary="Get tournament information")
async def api_tournament_get(tournament: dependencies.Tournament) -> models.Tournament:
    """Get tournament information

    - **uid**: The tournament unique ID
    """
    return tournament


@router.post("/{uid}/event", summary="Add tournament event")
async def api_tournament_event_post(
    orchestrator: dependencies.TournamentOrchestrator,
    event: typing.Annotated[
        events.TournamentEvent, fastapi.Body(openapi_examples=events.OPENAPI_EXAMPLES)
    ],
    member_uid: dependencies.MemberUidFromToken,
    op: dependencies.DbOperator,
) -> models.Tournament:
    """Send a new event for this tournament.

    This is the main way of interacting with a tournament data.

    - **uid**: The tournament unique ID
    """
    orchestrator.handle_event(event, member_uid)
    await op.record_event(event, member_uid)
    await op.update_tournament(orchestrator)
    return orchestrator
