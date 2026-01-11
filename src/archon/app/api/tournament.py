import dataclasses
import fastapi
import logging
import typing
import unidecode
import uuid

from .. import dependencies
from ... import events
from ... import geo
from ... import models
from ... import engine

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
    if (
        filter.uid
        or filter.country
        or not filter.online
        or filter.states
        or filter.member_uid
        or filter.year
        or filter.name
    ):
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
    league = await op.get_league(data.league.uid) if data.league else None
    # Validation happens in create_tournament which uses TournamentOrchestrator
    LOG.info("Creating new tournament: %s", data)
    # Create a temporary orchestrator just for validation
    temp_orchestrator = engine.TournamentOrchestrator(**dataclasses.asdict(data))
    temp_orchestrator.update_config(data, member, league)
    uid = await op.create_tournament(data)
    return dependencies.ItemUrl(
        uid=uid, url=str(request.url_for("tournament_display", uid=uid))
    )


@router.put("/{uid}", summary="Update tournament information")
async def api_tournament_put(
    orchestrator: dependencies.TournamentOrchestrator,
    data: typing.Annotated[models.TournamentConfig, fastapi.Body()],
    member: dependencies.PersonFromToken,
    op: dependencies.DbOperator,
) -> models.Tournament:
    """Update tournament information

    - **uid**: The tournament unique ID
    """
    data.judges = await op.get_members([judge.uid for judge in data.judges])
    league = await op.get_league(data.league.uid) if data.league else None
    orchestrator.update_config(data, member, league)  # checks member can admin
    await op.update_tournament(orchestrator)
    return orchestrator


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
    tournament: dependencies.TournamentInfo, member: dependencies.PersonFromToken
) -> models.TournamentInfo | models.TournamentConfig:
    """Get tournament information

    - **uid**: The tournament unique ID
    """
    if member.vekn or member.uid in tournament.players:
        return tournament
    return models.TournamentConfig(**dataclasses.asdict(tournament))


@router.get("/{uid}/decks", summary="Get tournament decks information")
async def api_tournament_get_decks(
    op: dependencies.DbOperator,
    uid: typing.Annotated[str, fastapi.Path(title="Tournament unique ID")],
    member: dependencies.PersonFromToken,
) -> models.TournamentDeckInfo:
    """Get tournament decks

    - **uid**: The tournament unique ID
    """
    tournament = await op.get_tournament(uid)
    res = models.TournamentDeckInfo(**dataclasses.asdict(tournament))
    res.decks = engine.deck_infos(tournament, member)
    return res


@router.get("/{uid}/report", summary="Get tournament text report")
async def api_tournament_get_report(
    op: dependencies.DbOperator,
    uid: typing.Annotated[str, fastapi.Path(title="Tournament unique ID")],
    member: dependencies.PersonFromToken,
) -> fastapi.responses.PlainTextResponse:
    """Get tournament report with standings and winner decklist in TWD format

    - **uid**: The tournament unique ID
    """
    tournament = await op.get_tournament(uid)
    dependencies.check_can_admin_tournament(member, tournament)
    report = dependencies.tournament_report(tournament)
    return fastapi.responses.PlainTextResponse(content=report)


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


@router.post("/{uid}/set-vekn/{vekn_id}", summary="Link to a tournament on vekn.net")
async def set_vekn(
    tournament: dependencies.TournamentOrchestrator,  # lock for update
    member: dependencies.PersonFromToken,
    op: dependencies.DbOperator,
    vekn_id: typing.Annotated[str, fastapi.Path()],
) -> models.Tournament:
    if not engine.can_admin_tournament(member, tournament):
        raise fastapi.HTTPException(fastapi.status.HTTP_403_FORBIDDEN)
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
) -> models.Tournament | models.TournamentInfo:
    """Send a new event for this tournament.

    This is the main way of interacting with a tournament data.

    - **uid**: The tournament unique ID
    """
    if event.type == events.EventType.REGISTER:
        member = await op.get_member(event.player_uid)
        if any(s.level == events.SanctionLevel.BAN for s in member.sanctions):
            raise engine.BannedPlayer()
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
        dependencies.invalidate_caches()
    if event.type == events.EventType.UNSANCTION:
        member = await op.get_member(event.player_uid, for_update=True)
        for idx, sanction in enumerate(member.sanctions):
            if sanction.uid == event.sanction_uid:
                del member.sanctions[idx]
        await op.update_member(member)
        dependencies.invalidate_caches()
    if event.type == events.EventType.FINISH_TOURNAMENT:
        await dependencies.vekn_sync(
            orchestrator, max(1, len(orchestrator.rounds)), actor
        )
        await op.update_tournament(orchestrator)
    if engine.can_admin_tournament(actor, orchestrator):
        return orchestrator
    return models.TournamentInfo(**dataclasses.asdict(orchestrator))


@router.post(
    "/{uid}/go-offline", summary="Take tournament offline for local management"
)
async def api_tournament_go_offline(
    orchestrator: dependencies.TournamentOrchestrator,
    actor: dependencies.PersonFromToken,
    op: dependencies.DbOperator,
) -> models.Tournament:
    """Take ownership of the tournament for offline management.

    - Sets offline_owner to current user
    - Returns current tournament snapshot for local storage
    - Fails if tournament is already offline
    """
    if not engine.can_admin_tournament(actor, orchestrator):
        raise fastapi.HTTPException(fastapi.status.HTTP_403_FORBIDDEN)
    if orchestrator.offline_owner:
        raise fastapi.HTTPException(
            fastapi.status.HTTP_409_CONFLICT,
            detail="Tournament is already offline",
        )
    orchestrator.offline_owner = actor.uid
    await op.update_tournament(orchestrator)
    return orchestrator


@router.post("/{uid}/sync-offline", summary="Sync offline tournament data back online")
async def api_tournament_sync_offline(
    orchestrator: dependencies.TournamentOrchestrator,
    data: typing.Annotated[models.OfflineSyncData, fastapi.Body()],
    actor: dependencies.PersonFromToken,
    op: dependencies.DbOperator,
) -> models.Tournament:
    """Sync offline tournament data back to server.

    - Only the offline owner can sync
    - Creates real members for offline members (OFF-* UIDs)
    - Replaces all OFF-* UIDs with real member UIDs
    - Clears offline_owner and saves tournament
    """
    if orchestrator.offline_owner != actor.uid:
        raise fastapi.HTTPException(
            fastapi.status.HTTP_403_FORBIDDEN,
            detail="Only the offline owner can sync",
        )

    # Step 1: Create real members for offline members, build UID and VEKN mappings
    uid_mapping: dict[str, str] = {}
    vekn_mapping: dict[str, str] = {}
    for offline_member in data.offline_members:
        if not offline_member.uid.startswith("OFF-"):
            continue
        # Validate and normalize geo data
        country_obj = geo.COUNTRIES_BY_NAME.get(offline_member.country)
        country_name = country_obj.country if country_obj else ""
        country_flag = country_obj.flag if country_obj else ""
        city_name = ""
        if country_obj and offline_member.city:
            city_obj = geo.CITIES_BY_COUNTRY.get(country_name, {}).get(
                offline_member.city
            )
            city_name = city_obj.unique_name if city_obj else ""

        # Create a new member with a fresh UUID
        real_uid = str(uuid.uuid4())
        new_member = models.Member(
            uid=real_uid,
            name=offline_member.name,
            country=country_name,
            country_flag=country_flag,
            city=city_name,
            sponsor=actor.uid,
        )
        await op.insert_member(new_member)
        await op.update_member_new_vekn(new_member)
        uid_mapping[offline_member.uid] = real_uid
        vekn_mapping[offline_member.uid] = new_member.vekn

    # Step 2: Replace all OFF-* UIDs in tournament data
    tournament = data.tournament

    def replace_uid(uid: str) -> str:
        return uid_mapping.get(uid, uid)

    # Replace in players dict and update VEKN
    new_players = {}
    for player_uid, player in tournament.players.items():
        new_uid = replace_uid(player_uid)
        player.uid = new_uid
        # Update VEKN for newly created members
        if player_uid in vekn_mapping:
            player.vekn = vekn_mapping[player_uid]
        new_players[new_uid] = player
    tournament.players = new_players

    # Replace in rounds seating
    for round_ in tournament.rounds:
        for table in round_.tables:
            for seat in table.seating:
                seat.player_uid = replace_uid(seat.player_uid)

    # Replace in finals_seeds
    tournament.finals_seeds = [replace_uid(uid) for uid in tournament.finals_seeds]

    # Replace in sanctions dict
    new_sanctions = {}
    for player_uid, sanctions_list in tournament.sanctions.items():
        new_uid = replace_uid(player_uid)
        new_sanctions[new_uid] = sanctions_list
    tournament.sanctions = new_sanctions

    # Replace winner if applicable
    if tournament.winner:
        tournament.winner = replace_uid(tournament.winner)

    # Step 3: Clear offline_owner and update tournament
    tournament.offline_owner = None
    # Keep original uid and other config fields from orchestrator
    tournament.uid = orchestrator.uid

    # Copy all fields from synced tournament to orchestrator
    for field in dataclasses.fields(models.Tournament):
        if field.name != "uid":  # Keep original UID
            setattr(orchestrator, field.name, getattr(tournament, field.name))

    await op.update_tournament(orchestrator)
    return orchestrator


@router.post(
    "/{uid}/force-online",
    summary="Force tournament back online (discards offline changes)",
)
async def api_tournament_force_online(
    orchestrator: dependencies.TournamentOrchestrator,
    actor: dependencies.PersonFromToken,
    op: dependencies.DbOperator,
) -> models.Tournament:
    """Force tournament back online, discarding any offline changes.

    - Only tournament admins can force online
    - Clears offline_owner without applying offline data
    - WARNING: All offline changes are lost
    """
    if not engine.can_admin_tournament(actor, orchestrator):
        raise fastapi.HTTPException(fastapi.status.HTTP_403_FORBIDDEN)
    if not orchestrator.offline_owner:
        raise fastapi.HTTPException(
            fastapi.status.HTTP_400_BAD_REQUEST,
            detail="Tournament is not offline",
        )
    orchestrator.offline_owner = None
    await op.update_tournament(orchestrator)
    return orchestrator
