import dataclasses
import fastapi
import logging
import typing
import unidecode

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
    filter: typing.Annotated[models.TournamentFilter, fastapi.Query()],
    op: dependencies.DbOperator,
) -> tuple[models.TournamentFilter, list[models.TournamentMinimal]]:
    """List all tournaments"""
    if filter.uid or filter.country or not filter.online or filter.states:
        filter = filter
    else:
        filter = None
    return await op.get_tournaments(filter)


@router.post("/", summary="Create a new tournament")
async def api_tournaments_post(
    request: fastapi.Request,
    data: typing.Annotated[models.TournamentConfig, fastapi.Body()],
    member: dependencies.PersonFromToken,
    op: dependencies.DbOperator,
) -> dependencies.ItemUrl:
    """Create a new tournament"""
    dependencies.check_organizer(member)
    data.judges = await op.get_members(
        list(set([j.uid for j in data.judges]) | {member.uid})
    )
    LOG.info("Creating new tournament: %s", data)
    uid = await op.create_tournament(data)
    return dependencies.ItemUrl(
        uid=uid, url=str(request.url_for("tournament_display", uid=uid))
    )


@router.put("/{uid}", summary="Update tournament information")
async def api_tournament_put(
    request: fastapi.Request,
    orchestrator: dependencies.TournamentOrchestrator,
    data: typing.Annotated[models.TournamentConfig, fastapi.Body()],
    member: dependencies.PersonFromToken,
    op: dependencies.DbOperator,
) -> dependencies.ItemUrl:
    """Update tournament information

    - **uid**: The tournament unique ID
    """
    data.judges = await op.get_members([judge.uid for judge in data.judges])
    orchestrator.update_config(data, member)
    uid = await op.update_tournament(orchestrator)
    return dependencies.ItemUrl(
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
    tournament: dependencies.TournamentInfo, _: dependencies.PersonFromToken
) -> models.TournamentInfo:
    """Get tournament information

    - **uid**: The tournament unique ID
    """
    return tournament


@router.get("/{uid}/decks", summary="Get tournament decks information")
async def api_tournament_get_decks(
    tournament: dependencies.TournamentConfig, member: dependencies.PersonFromToken
) -> models.TournamentDeckInfo:
    """Get tournament decks (organizers only)

    - **uid**: The tournament unique ID
    """
    dependencies.check_can_admin_tournament(member, tournament)
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


@router.get(
    "/venue-completion/{country}/{prefix}",
    summary="Get venue completion for given country and prefiw",
)
async def api_tournament_get_venue_completion(
    _: dependencies.MemberUidFromToken,
    op: dependencies.DbOperator,
    country: str,
    prefix: str,
) -> list[models.VenueCompletion]:
    if country.lower() == "online":
        country = ""
    res = await op.venue_completion(country)
    # we do some cleanup, then filter on prefix parts
    names = set()
    ret = []
    prefix_parts = set(unidecode.unidecode(p).lower() for p in prefix.split())
    for r in res:
        r.venue = r.venue.strip()
        if not r.venue:
            continue
        if r.venue[0] in "(\"'":
            continue
        if unidecode.unidecode(r.venue[:6]).lower() in names:
            continue
        if not all(
            [
                p
                in [unidecode.unidecode(rp)[: len(p)].lower() for rp in r.venue.split()]
                for p in prefix_parts
            ]
        ):
            continue
        names.add(unidecode.unidecode(r.venue[:6]).lower())
        ret.append(r)
    return ret


@router.post(
    "/{uid}/vekn-sync/{rounds}", summary="Sync finished tournament to vekn.net"
)
async def vekn_sync(
    tournament: dependencies.TournamentOrchestrator,  # lock for update
    member: dependencies.PersonFromToken,
    op: dependencies.DbOperator,
    rounds: typing.Annotated[int, fastapi.Path()],
) -> models.Tournament:
    await dependencies.vekn_sync(tournament, rounds, member)
    await op.update_tournament(tournament)
    return tournament


@router.post("/{uid}/set-vekn/{vekn_id}", summary="Create tournament on vekn.net")
async def set_vekn(
    tournament: dependencies.TournamentOrchestrator,  # lock for update
    op: dependencies.DbOperator,
    vekn_id: typing.Annotated[str, fastapi.Path()],
) -> models.Tournament:
    tournament.extra["vekn_id"] = vekn_id
    await op.update_tournament(tournament)
    return tournament


@router.delete("/{uid}", summary="Delete tournament")
async def api_tournament_delete(
    tournament: dependencies.TournamentOrchestrator,  # lock for update
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
                tournament=models.TournamentRef(**dataclasses.asdict(orchestrator)),
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
    if event.type == events.EventType.FINISH_TOURNAMENT:
        await dependencies.vekn_sync(
            orchestrator, max(1, len(orchestrator.rounds)), actor
        )
        await op.update_tournament(orchestrator)
    return orchestrator
