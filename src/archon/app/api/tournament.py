import fastapi
import logging
import typing

from .. import dependencies
from ... import events
from ... import models

LOG = logging.getLogger()
router = fastapi.APIRouter(
    prefix="/api/tournaments",
    default_response_class=fastapi.responses.ORJSONResponse,
    tags=["tournaments"],
)


@router.get("/", summary="List all tournaments")
async def api_tournaments(
    op: dependencies.DbOperator,
) -> list[models.TournamentConfig]:
    """List all tournaments"""
    return await op.get_tournaments(models.TournamentConfig)


@router.post("/", summary="Create a new tournament")
async def api_tournaments_post(
    request: fastapi.Request,
    data: typing.Annotated[models.TournamentConfig, fastapi.Body()],
    member_uid: dependencies.MemberUidFromToken,
    op: dependencies.DbOperator,
) -> dependencies.TournamentUrl:
    """Create a new tournament"""
    data.judges = list(set(data.judges) | {member_uid})
    LOG.info("Creating new tournament: %s", data)
    uid = await op.create_tournament(data)
    return dependencies.TournamentUrl(
        uid=uid, url=str(request.url_for("tournament_display", uid=uid))
    )


@router.put("/{uid}", summary="Update tournament information")
async def api_tournament_put(
    request: fastapi.Request,
    orchestrator: dependencies.TournamentOrchestrator,
    data: typing.Annotated[models.TournamentConfig, fastapi.Body()],
    member_uid: dependencies.MemberUidFromToken,
    op: dependencies.DbOperator,
) -> dependencies.TournamentUrl:
    """Update tournament information

    - **uid**: The tournament unique ID
    """
    orchestrator.update_config(data, member_uid)
    uid = await op.update_tournament(orchestrator)
    return dependencies.TournamentUrl(
        uid=uid, url=str(request.url_for("tournament_display", uid=uid))
    )


@router.get("/{uid}", summary="Get tournament information")
async def api_tournament_get(
    tournament: dependencies.Tournament, member_uid: dependencies.MemberUidFromToken
) -> models.Tournament:
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
    await op.record_event(orchestrator.uid, member_uid, event)
    await op.update_tournament(orchestrator)
    # TODO: we might want to move this in a "VEKN member orchastrator" of sorts
    if (
        event.type == events.EventType.SANCTION
        and event.level != events.SanctionLevel.CAUTION
    ):
        member = await op.get_member(event.player_uid, for_update=True)
        member.sanctions.append(
            models.RegisteredSanction(
                tournament_uid=orchestrator.uid,
                tournament_name=orchestrator.name,
                tournament_start=orchestrator.start,
                tournament_timezone=orchestrator.timezone,
                uid=event.sanction_uid,
                judge_uid=member_uid,
                player_uid=event.player_uid,
                level=event.level,
                category=event.category,
                comment=event.comment,
            )
        )
        await op.update_member(member)
    if event.type == events.EventType.UNSANCTION:
        member = await op.get_member(event.player_uid, for_update=True)
        for idx, sanction in enumerate(member.sanctions):
            if sanction.uid == event.sanction_uid:
                del member.sanctions[idx]
        await op.update_member(member)
    return orchestrator
