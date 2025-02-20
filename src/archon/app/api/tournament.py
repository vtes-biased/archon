import dataclasses
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
    member: dependencies.PersonFromToken,
    op: dependencies.DbOperator,
) -> dependencies.TournamentUrl:
    """Create a new tournament"""
    dependencies.check_organizer(member)
    data.judges = await op.get_members(
        list(set([j.uid for j in data.judges]) | {member.uid})
    )
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
    member: dependencies.PersonFromToken,
    op: dependencies.DbOperator,
) -> dependencies.TournamentUrl:
    """Update tournament information

    - **uid**: The tournament unique ID
    """
    data.judges = await op.get_members([judge.uid for judge in data.judges])
    orchestrator.update_config(data, member)
    uid = await op.update_tournament(orchestrator)
    return dependencies.TournamentUrl(
        uid=uid, url=str(request.url_for("tournament_display", uid=uid))
    )


@router.get("/{uid}", summary="Get tournament data")
async def api_tournament_get(
    tournament: dependencies.Tournament, member: dependencies.PersonFromToken
) -> models.Tournament:
    """Get tournament data

    - **uid**: The tournament unique ID
    """
    dependencies.check_can_admin_tournament(member, tournament)
    return tournament


@router.get("/{uid}/info", summary="Get tournament public information")
async def api_tournament_get_info(
    tournament: dependencies.Tournament, member: dependencies.PersonFromToken
) -> models.Tournament | models.TournamentInfo:
    """Get tournament information

    - **uid**: The tournament unique ID
    """
    return models.TournamentInfo(**dataclasses.asdict(tournament))


@router.get("/{uid}/decks", summary="Get tournament decks information")
async def api_tournament_get(
    tournament: dependencies.Tournament, _: dependencies.MemberUidFromToken
) -> models.TournamentDeckInfo:
    """Get tournament information

    - **uid**: The tournament unique ID
    """
    res = models.TournamentDeckInfo(**dataclasses.asdict(tournament))
    if tournament.multideck:
        for round_ in tournament.rounds:
            for table in round_.tables:
                for seat in table.seating:
                    if seat.deck:
                        res.decks.append(seat.deck)
    else:
        for player in tournament.players.values():
            if player.deck:
                res.decks.append(player.deck)
    return res


@router.delete("/{uid}", summary="Delete tournament")
async def api_tournament_delete(
    tournament: dependencies.Tournament,
    actor: dependencies.PersonFromToken,
    op: dependencies.DbOperator,
) -> None:
    """Delete tournament

    - **uid**: The tournament unique ID
    """
    if models.MemberRole.ADMIN not in actor.roles:
        raise fastapi.HTTPException(fastapi.status.HTTP_403_FORBIDDEN)
    for player_uid in tournament.players:
        member: models.Member = await op.get_member(player_uid, True)
        for i, sanction in enumerate(member.sanctions):
            if sanction.tournament and sanction.tournament.uid == tournament.uid:
                member.sanctions.pop(i)
        member.ratings.pop(tournament.uid, None)
        await op.update_member(member)
    await op.delete_tournament(tournament.uid)


@router.post("/{uid}/event", summary="Add tournament event")
async def api_tournament_event_post(
    orchestrator: dependencies.TournamentOrchestrator,
    event: typing.Annotated[
        events.TournamentEvent, fastapi.Body(openapi_examples=events.OPENAPI_EXAMPLES)
    ],
    actor: dependencies.PersonFromToken,
    op: dependencies.DbOperator,
) -> models.Tournament:
    """Send a new event for this tournament.

    This is the main way of interacting with a tournament data.

    - **uid**: The tournament unique ID
    """
    orchestrator.handle_event(event, actor)
    await op.record_event(orchestrator.uid, actor.uid, event)
    await op.update_tournament(orchestrator)
    # TODO: we might want to move this in a "VEKN member orchestrator" of sorts
    if (
        event.type == events.EventType.SANCTION
        and event.level != events.SanctionLevel.CAUTION
    ):
        member = await op.get_member(event.player_uid, for_update=True)
        member.sanctions.append(
            models.RegisteredSanction(
                tournament=models.TournamentConfig(**dataclasses.asdict(orchestrator)),
                uid=event.sanction_uid,
                judge=actor,
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
