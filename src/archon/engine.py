import collections
import dataclasses
import io
import itertools
import krcg.seating
import krcg.deck
import logging
import math
import random

from . import geo
from . import models
from . import events
from . import scoring

LOG = logging.getLogger()


class TournamentManager(models.Tournament):
    """Implements re-entring idempotent tournament logic. No validity check.
    This is the logic one needs to implement on the Client/UI side to allow for
    incremental changes.
    """

    def handle_event(self, ev: events.TournamentEvent, member: models.Person) -> None:
        LOG.debug("Handling event: %s", ev)
        match ev.type:
            case events.EventType.REGISTER:
                self.register(ev, member)
            case events.EventType.OPEN_CHECKIN:
                self.open_checkin(ev, member)
            case events.EventType.CHECK_IN:
                self.check_in(ev, member)
            case events.EventType.CHECK_EVERYONE_IN:
                self.check_everyone_in(ev, member)
            case events.EventType.CHECK_OUT:
                self.check_out(ev, member)
            case events.EventType.ROUND_START:
                self.round_start(ev, member)
            case events.EventType.ROUND_ALTER:
                self.round_alter(ev, member)
            case events.EventType.ROUND_FINISH:
                self.round_finish(ev, member)
            case events.EventType.ROUND_CANCEL:
                self.round_cancel(ev, member)
            case events.EventType.SET_RESULT:
                self.set_result(ev, member)
            case events.EventType.SET_DECK:
                self.set_deck(ev, member)
            case events.EventType.DROP:
                self.drop(ev, member)
            case events.EventType.SANCTION:
                self.sanction(ev, member)
            case events.EventType.UNSANCTION:
                self.unsanction(ev, member)
            case events.EventType.OVERRIDE:
                self.override(ev, member)
            case events.EventType.UNOVERRIDE:
                self.unoverride(ev, member)
            case events.EventType.SEED_FINALS:
                self.seed_finals(ev, member)
            case events.EventType.SEAT_FINALS:
                self.seat_finals(ev, member)
            case events.EventType.FINISH_TOURNAMENT:
                self.finish_tournament(ev, member)

    def is_judge(self, member) -> bool:
        if member.uid in [j.uid for j in self.judges]:
            return True
        return False

    def register(self, ev: events.Register, member: models.Person) -> None:
        # note players are not necessary VEKN members (they may not even exist in DB)
        # this is allowed on purpose: you can use the engine without the VEKN members DB
        # if player is already registered, only change his state if he has dropped
        if ev.player_uid and ev.player_uid in self.players:
            player = self.players[ev.player_uid]
            if player.state != models.PlayerState.FINISHED:
                return
            # banned and DQ players stay finished in all cases
            if models.Barrier.BANNED in player.barriers:
                return
            if models.Barrier.DISQUALIFIED in player.barriers:
                return
            # default state
            player.state = models.PlayerState.REGISTERED
            if self.state in [
                models.TournamentState.FINALS,
                models.TournamentState.FINISHED,
            ]:
                player.state = models.PlayerState.FINISHED
            # if player was playing, put them back as playing
            if self.state in [
                models.TournamentState.PLAYING,
                models.TournamentState.FINALS,
            ]:
                round_ = self.rounds[-1]
                for table in round_.tables:
                    for seat in table.seating:
                        if seat.player_uid == ev.player_uid:
                            player.state = models.PlayerState.PLAYING
            return
        # new player
        state = models.PlayerState.REGISTERED
        if self.state in [
            models.TournamentState.FINALS,
            models.TournamentState.FINISHED,
        ]:
            state = models.PlayerState.FINISHED
        # Check and normalize geodata
        country = geo.COUNTRIES_BY_NAME.get(ev.country, None)
        if country:
            city = geo.CITIES_BY_COUNTRY.get(country.country).get(ev.city, None)
        else:
            city = None
        self.players[ev.player_uid] = models.Player(
            name=ev.name,
            uid=ev.player_uid,
            vekn=ev.vekn,
            country=country.country if country else "",
            country_flag=country.flag if country else "",
            city=city.unique_name if city else "",
            state=state,
        )
        if any(
            s.level == events.SanctionLevel.BAN
            for s in self.sanctions.get(ev.player_uid, [])
        ):
            self.players[ev.player_uid].barriers.append(models.Barrier.BANNED)
            self.players[ev.player_uid].state = models.PlayerState.FINISHED
        if any(
            s.level == events.SanctionLevel.DISQUALIFICATION
            for s in self.sanctions.get(ev.player_uid, [])
        ):
            self.players[ev.player_uid].barriers.append(models.Barrier.DISQUALIFIED)
            self.players[ev.player_uid].state = models.PlayerState.FINISHED
        if self.decklist_required:
            self.players[ev.player_uid].barriers.append(models.Barrier.MISSING_DECK)

    def open_checkin(self, ev: events.OpenCheckin, member: models.Person) -> None:
        self.state = models.TournamentState.WAITING

    def check_in(self, ev: events.CheckIn, member: models.Person) -> None:
        self.players[ev.player_uid].state = models.PlayerState.CHECKED_IN

    def check_everyone_in(
        self, ev: events.CheckEveryoneIn, member: models.Person
    ) -> None:
        for player in self.players.values():
            if player.state != models.PlayerState.REGISTERED:
                continue
            if player.barriers:
                continue
            player.state = models.PlayerState.CHECKED_IN

    def check_out(self, ev: events.CheckIn, member: models.Person) -> None:
        self.players[ev.player_uid].state = models.PlayerState.REGISTERED

    def round_start(self, ev: events.RoundStart, member: models.Person) -> None:
        self.state = models.TournamentState.PLAYING
        self.rounds.append(self._event_seating_to_round(ev.seating))
        self._set_players_statuses_from_current_round()
        # reset the toss if we mistakenly tossed for finals then canceled it
        # before starting this new round
        for player in self.players.values():
            player.toss = 0

    def _set_players_statuses_from_current_round(self) -> None:
        players = {
            seat.player_uid: (i, j)
            for i, table in enumerate(self.rounds[-1].tables, 1)
            for j, seat in enumerate(table.seating, 1)
        }
        for player in self.players.values():
            if player.uid in players:
                player.state = models.PlayerState.PLAYING
                player.table = players[player.uid][0]
                player.seat = players[player.uid][1]
            else:
                player.table = 0
                player.seat = 0
                if player.state != models.PlayerState.FINISHED:
                    player.state = models.PlayerState.REGISTERED

    def round_alter(self, ev: events.RoundAlter, member: models.Person) -> None:
        self._alter_round(ev.round, ev.seating)

    def _alter_round(self, round: int, seating: list[list[str]]):
        """Keep players results, decks and table overrides."""
        old_tables = self.rounds[round - 1].tables
        results = {
            seat.player_uid: (seat.result, seat.deck)
            for table in old_tables
            for seat in table.seating
        }
        overrides = {i: table.override for i, table in enumerate(old_tables)}
        self.rounds[round - 1] = self._event_seating_to_round(seating)
        # if this is the current round, change players statuses accordingly
        finals = False
        if round == len(self.rounds):
            if self.state in [
                models.TournamentState.FINALS,
                models.TournamentState.FINISHED,
            ]:
                finals = True
            self._set_players_statuses_from_current_round()
        # restore overrides and results
        for i, table in enumerate(self.rounds[round - 1].tables):
            table.override = overrides.pop(i, None)
            for seat in table.seating:
                seat.result, seat.deck = results.pop(
                    seat.player_uid, (scoring.Score(), None)
                )
            self._compute_table_score_and_state(table, finals=finals)
        # remove previous result for players who are removed from the new seating
        for uid, (result, _) in results.items():
            self.players[uid].result -= result

    def round_finish(self, ev: events.RoundFinish, member: models.Person) -> None:
        self.state = models.TournamentState.REGISTRATION
        for player in self.players.values():
            player.table = 0
            player.seat = 0
            if player.state in {
                models.PlayerState.PLAYING,
                models.PlayerState.CHECKED_IN,
            }:
                player.state = models.PlayerState.REGISTERED
        for table in self.rounds[-1].tables:
            for seat in table.seating:
                player = self.players[seat.player_uid]
                player.rounds_played += 1
                if self.max_rounds and player.rounds_played >= self.max_rounds:
                    player.barriers.append(models.Barrier.MAX_ROUNDS)
                if self.decklist_required and not player.deck:
                    player.barriers.append(models.Barrier.MISSING_DECK)

    def round_cancel(self, ev: events.RoundCancel, member: models.Person) -> None:
        for table in self.rounds[-1].tables:
            for seat in table.seating:
                self.players[seat.player_uid].result -= seat.result
        del self.rounds[-1]
        self.state = models.TournamentState.WAITING
        for player in self.players.values():
            player.table = 0
            player.seat = 0
            player.seed = 0
            if player.state == models.PlayerState.PLAYING:
                player.state = models.PlayerState.CHECKED_IN
        self.finals_seeds = []

    def _event_seating_to_round(self, seating: list[list[str]]) -> models.Round:
        return models.Round(
            tables=[
                models.Table(
                    seating=[
                        models.TableSeat(
                            player_uid=uid,
                            deck=self.players[uid].deck if self.multideck else None,
                        )
                        for uid in table
                    ]
                )
                for table in seating
            ]
        )

    def set_result(self, ev: events.SetResult, member: models.Person) -> None:
        player = self.players[ev.player_uid]
        round_ = self.rounds[ev.round - 1]
        player_table = None
        player_seat = None
        for table in round_.tables:
            for seat in table.seating:
                if ev.player_uid == seat.player_uid:
                    player_seat = seat
                    player_table = table
                    break
            if player_seat is not None:
                break
        if not player_seat:
            raise ValueError(f"player {ev.player_uid} not in round {ev.round}")
        player.result -= player_seat.result
        player_seat.result = scoring.Score(vp=ev.vps)
        if self.is_judge(member):
            for seat in player_table.seating:
                seat.judge = models.PublicPerson(**dataclasses.asdict(member))
        player.result += player_seat.result
        finals = False
        if self.state in [
            models.TournamentState.FINALS,
            models.TournamentState.FINISHED,
        ] and ev.round == len(self.rounds):
            finals = True
        self._compute_table_score_and_state(player_table, finals=finals)

    def _compute_table_score_and_state(self, table: models.Table, finals=False):
        for s in table.seating:
            self.players[s.player_uid].result -= s.result
        max_vps = scoring.compute_table_scores([s.result for s in table.seating])
        if table.override:
            table.state = models.TableState.FINISHED
        else:
            err = scoring.check_table_vps([s.result for s in table.seating])
            if isinstance(err, scoring.InsufficientTotal):
                table.state = models.TableState.IN_PROGRESS
            elif err:
                table.state = models.TableState.INVALID
            else:
                table.state = models.TableState.FINISHED
        if finals and table.state == models.TableState.FINISHED:
            # winning the finals counts as a GW even with less than 2 VPs
            # cf. VEKN Ratings system
            top_seats = [s for s in table.seating if s.result.vp >= max_vps]
            top_seats.sort(key=lambda s: self.finals_seeds.index(s.player_uid))
            top_seats[0].result.gw = 1
            self.winner = top_seats[0].player_uid
        for s in table.seating:
            self.players[s.player_uid].result += s.result

    def set_deck(self, ev: events.SetDeck, member: models.Person, check=False) -> None:
        if ev.deck.startswith("https://"):
            deck = krcg.deck.Deck.from_url(ev.deck)
        else:
            deck = krcg.deck.Deck.from_txt(io.StringIO(ev.deck))
        if check:
            self._check_deck(ev, deck)
        player = self.players[ev.player_uid]
        if ev.round:
            round_ = self.rounds[ev.round - 1]
            for table in round_.tables:
                for seat in table.seating:
                    if ev.player_uid == seat.player_uid:
                        seat.deck = models.KrcgDeck(
                            **deck.to_json(), vdb_link=deck.to_vdb()
                        )
                        break
                else:
                    continue
                break
            else:
                raise ValueError(f"player {ev.player_uid} not in round {ev.round}")
        else:
            player.deck = models.KrcgDeck(**deck.to_json(), vdb_link=deck.to_vdb())
        if self.decklist_required:
            try:
                player.barriers.remove(models.Barrier.MISSING_DECK)
            except ValueError:
                pass

    def _check_deck(self, ev: events.SetResult, deck: krcg.deck.Deck) -> None:
        """Check if the deck is legal, raise on issue"""
        library_count = deck.cards_count(lambda c: c.library)
        crypt_count = deck.cards_count(lambda c: c.crypt)
        if library_count < 60:
            raise ShortLibrary(ev, 60 - library_count)
        if library_count > 90:
            raise BigLibrary(ev, library_count - 90)
        if crypt_count < 12:
            raise ShortCrypt(ev, 12 - crypt_count)
        groups = set(c.group for c, _ in deck.cards(lambda c: c.crypt))
        groups.discard("ANY")
        groups = list(groups)
        if len(groups) > 2 or abs(int(groups[0]) - int(groups[-1])) > 1:
            raise InvalidGrouping(ev, groups)
        banned = [c.name for c, _ in deck.cards(lambda c: c.banned)]
        if any(banned):
            raise BannedCards(ev, banned)

    def drop(self, ev: events.Drop, member: models.Person) -> None:
        self.players[ev.player_uid].state = models.PlayerState.FINISHED

    def sanction(self, ev: events.Sanction, member: models.Person) -> None:
        self.sanctions.setdefault(ev.player_uid, [])
        self.sanctions[ev.player_uid].append(
            models.Sanction(
                uid=ev.sanction_uid,
                judge=member,
                level=ev.level,
                category=ev.category,
                comment=ev.comment,
            )
        )
        if ev.level == events.SanctionLevel.DISQUALIFICATION:
            player = self.players[ev.player_uid]
            player.state = models.PlayerState.FINISHED
            if models.Barrier.DISQUALIFIED not in player.barriers:
                player.barriers.append(models.Barrier.DISQUALIFIED)

    def unsanction(self, ev: events.Unsanction, member: models.Person) -> None:
        sanctions = self.sanctions.get(ev.player_uid, [])
        to_delete = [
            i for i, sanction in enumerate(sanctions) if sanction.uid == ev.sanction_uid
        ]
        for i in to_delete:
            sanctions.pop(i)
        if not any(s.level == events.SanctionLevel.DISQUALIFICATION for s in sanctions):
            try:
                self.players[ev.player_uid].barriers.remove(models.Barrier.DISQUALIFIED)
            except ValueError:
                pass

    def override(self, ev: events.Override, member: models.Person) -> None:
        table = self.rounds[ev.round - 1].tables[ev.table - 1]
        table.override = models.ScoreOverride(judge=member, comment=ev.comment)
        finals = False
        if self.state in [
            models.TournamentState.FINALS,
            models.TournamentState.FINISHED,
        ] and ev.round == len(self.rounds):
            finals = True
        self._compute_table_score_and_state(table, finals)

    def unoverride(self, ev: events.Unoverride, member: models.Person) -> None:
        table = self.rounds[ev.round - 1].tables[ev.table - 1]
        table.override = None
        finals = False
        if self.state in [
            models.TournamentState.FINALS,
            models.TournamentState.FINISHED,
        ] and ev.round == len(self.rounds):
            finals = True
        self._compute_table_score_and_state(table, finals)

    def seed_finals(self, ev: events.SeedFinals, member: models.Person) -> None:
        self.state = models.TournamentState.FINALS
        self.finals_seeds = ev.seeds[:5]
        self.rounds.append(self._event_seating_to_round([self.finals_seeds[:]]))
        seeds = set(ev.seeds)
        for player in self.players.values():
            if player.uid not in seeds:
                if player.state != models.PlayerState.FINISHED:
                    player.state = models.PlayerState.REGISTERED
                player.table = 0
                player.toss = 0
                player.seed = 0
        for uid, toss in ev.toss.items():
            self.players[uid].toss = toss
        for i, uid in enumerate(self.finals_seeds, 1):
            self.players[uid].table = 1
            self.players[uid].seed = i
            self.players[uid].state = models.PlayerState.PLAYING

    def seat_finals(self, ev: events.SeatFinals, member: models.Person) -> None:
        self._alter_round(len(self.rounds), [ev.seating])

    def finish_tournament(
        self, ev: events.FinishTournament, member: models.Person
    ) -> None:
        finals_table = self.rounds[-1].tables[0]
        self._compute_table_score_and_state(finals_table, finals=True)
        for player in self.players.values():
            player.state = models.PlayerState.FINISHED
        self.state = models.TournamentState.FINISHED


class TournamentError(ValueError):
    def __init__(self, ev: events.TournamentEvent | None = None, *args):
        super().__init__(ev, *args)


class ConfigError(TournamentError):
    def __init__(self, message: str):
        super().__init__(message)

    def __str__(self):
        return "Config error: " + self.args[0]


class UnregisteredPlayers(TournamentError):
    def __init__(self, ev: events.TournamentEvent, players: list[str] | None):
        super().__init__(ev, players or [ev.player_uid])

    def __str__(self):
        if len(self.args[1] > 1):
            return "Some players are not registered"
        return "Player is not registered"


class DisqualifiedPlayer(TournamentError):
    def __str__(self):
        return "Player was disqualified"


class UnnamedPlayer(TournamentError):
    def __str__(self):
        return "Player has no name: a name is required."


class PlayerAbsent(TournamentError):
    def __str__(self):
        return "Player is playing this round"


class BadRoundNumber(TournamentError):
    def __str__(self):
        return "Bad round number"


class BadTableNumber(TournamentError):
    def __str__(self):
        return "Bad table number"


class CheckinBarrier(TournamentError):

    def __init__(self, ev: events.TournamentEvent, barriers: list[models.Barrier]):
        super().__init__(ev, barriers)

    def __str__(self):
        return f"Player cannot check in: {', '.join(self.args[1])}"


class InvalidTables(TournamentError):

    def __init__(self, ev: events.TournamentEvent, tables: list[int]):
        super().__init__(ev, tables)

    def __str__(self):
        return f"Invalid tables: {', '.join(self.args[1])}"


class NotJudge(TournamentError):
    def __str__(self):
        return "Only a judge can do this"


class SeatingDuplicates(TournamentError):

    def __init__(self, ev: events.TournamentEvent, players: list[models.Player]):
        super().__init__(ev, players)

    def __str__(self):
        if len(self.args[1] > 1):
            players = ", ".join([p.name for p in self.args[1]])
            return f"Some players are on two tables: {players}"
        return f"{self.args[1][0].name} is on two tables"


class PredatorPreyDuplicate(TournamentError):
    def __init__(
        self, ev: events.TournamentEvent, players: tuple[models.Player, models.Player]
    ):
        super().__init__(ev, players)

    def __str__(self):
        return (
            f"{self.args[1][0].name} and {self.args[1][1].name} "
            "are predator and prey twice: this is forbidden."
        )


class BadSeating(TournamentError):
    def __str__(self):
        return "Bad seating"


class BadSeeding(TournamentError):
    def __str__(self):
        return "Invalid seeding for finals"


class NotFinalist(TournamentError):
    def __init__(self, ev: events.TournamentEvent, player: models.Player):
        super().__init__(ev, player)

    def __str__(self):
        return f"{self.args[0].name} is not a finalist"


class TournamentFinished(TournamentError):
    def __str__(self):
        return "Tournament is finished"


class RoundInProgress(TournamentError):
    def __str__(self):
        return "Round in progress"


class FinalsInProgress(TournamentError):
    def __str__(self):
        return "Finals are in progress"


class FinalsNotSeeded(TournamentError):
    def __str__(self):
        return "Finals are not seeded"


class NoRoundInProgress(TournamentError):
    def __str__(self):
        return "There is no round in progress"


class EmptyRound(TournamentError):
    def __str__(self):
        return "No table: the round is empty"


class CheckinClosed(TournamentError):
    def __str__(self):
        return "Check-in is closed"


class ResultRecorded(TournamentError):
    def __str__(self):
        return "Impossible: results have been recorded for this round"


class SingleDeckEvent(TournamentError):
    def __str__(self):
        return "This is a single deck event"


class InvalidCheckInCode(TournamentError):
    def __str__(self):
        return "Invalid Check-in code"


class DeckIssue(TournamentError): ...


class ShortLibrary(DeckIssue):
    def __init__(self, ev: events.TournamentEvent, count: int):
        super().__init__(ev, count)

    def __str__(self):
        return f"Missing {self.args[1]} card(s) in library."


class BigLibrary(DeckIssue):
    def __init__(self, ev: events.TournamentEvent, count: int):
        super().__init__(ev, count)

    def __str__(self):
        return f"{self.args[1]} card(s) too many in library."


class ShortCrypt(DeckIssue):
    def __init__(self, ev: events.TournamentEvent, count: int):
        super().__init__(ev, count)

    def __str__(self):
        return f"Missing {self.args[1]} card(s) in crypt."


class InvalidGrouping(DeckIssue):
    def __init__(self, ev: events.TournamentEvent, groups: list[str]):
        super().__init__(ev, groups)

    def __str__(self):
        return f"Invalid grouping: groups {','.join(self.args[1])}."


class BannedCards(DeckIssue):
    def __init__(self, ev: events.TournamentEvent, banned: list[str]):
        super().__init__(ev, banned)

    def __str__(self):
        return f"Banned cards: {','.join(self.args[1])}."


class TournamentOrchestrator(TournamentManager):
    """Implements all input checks and raise meaningful errors"""

    def update_config(
        self, config: models.TournamentConfig, member: models.Person
    ) -> None:
        self._check_judge(None, member)
        LOG.info("Updating tournament config: %s", config)
        if not config.judges:
            raise ConfigError("A tournament must have at least one judge")
        if (
            config.format != models.TournamentFormat.Standard
            and config.rank != models.TournamentRank.BASIC
        ):
            raise ConfigError("Non-Standard tournaments must have Basic rank")
        if config.rank != models.TournamentRank.BASIC and config.proxies:
            raise ConfigError("Only Basic rank tournaments can allow proxies")
        if config.rank != models.TournamentRank.BASIC and config.multideck:
            raise ConfigError("Only Basic rank tournaments can allow multideck")
        if config.multideck and config.decklist_required:
            raise ConfigError("Multideck tournaments cannot require decklists")
        for field in dataclasses.fields(config):
            if field.name in ["uid", "state"]:
                continue
            value = getattr(config, field.name)
            setattr(self, field.name, value)
        # reset barriers
        for player in self.players.values():
            try:
                player.barriers.remove(models.Barrier.MISSING_DECK)
            except ValueError:
                pass
            try:
                player.barriers.remove(models.Barrier.MAX_ROUNDS)
            except ValueError:
                pass
        if self.decklist_required:
            for player in self.players.values():
                if not player.deck:
                    player.barriers.append(models.Barrier.MISSING_DECK)
        if self.max_rounds:
            for player in self.players.values():
                if player.rounds_played >= self.max_rounds:
                    player.barriers.append(models.Barrier.MAX_ROUNDS)

    def register(self, ev: events.Register, member: models.Person) -> None:
        if any(
            s.level == events.SanctionLevel.DISQUALIFICATION
            for s in self.sanctions.get(ev.player_uid, [])
        ):
            raise DisqualifiedPlayer(ev)
        if not ev.name:
            raise UnnamedPlayer(ev)
        if not ev.vekn:
            # only a judge can register a player without VEKN
            self._check_judge(ev, member)
        super().register(ev, member)

    def _check_not_playing(self, ev: events.TournamentEvent):
        if self.state == models.TournamentState.FINALS:
            raise FinalsInProgress(ev)
        if self.state == models.TournamentState.PLAYING:
            raise RoundInProgress(ev)
        if self.state == models.TournamentState.FINISHED:
            raise TournamentFinished(ev)

    def _check_judge(self, ev: events.TournamentEvent, member: models.Person) -> None:
        if models.MemberRole.ADMIN in member.roles:
            return
        if models.MemberRole.NC in member.roles and self.country == member.country:
            return
        if member.uid in [j.uid for j in self.judges]:
            return
        raise NotJudge(ev)

    def open_checkin(self, ev: events.OpenCheckin, member: models.Person) -> None:
        self._check_not_playing(ev)
        self._check_judge(ev, member)
        super().open_checkin(ev, member)

    def check_in(self, ev: events.CheckIn, member: models.Person) -> None:
        self._check_not_playing(ev)
        if ev.code:
            if ev.code != self.checkin_code:
                raise InvalidCheckInCode(ev)
        else:
            self._check_judge(ev, member)
        if self.state != models.TournamentState.WAITING:
            raise CheckinClosed(ev)
        if ev.player_uid not in self.players:
            raise UnregisteredPlayers(ev)
        player = self.players[ev.player_uid]
        if player.barriers:  # maybe judges should be allowed to?
            raise CheckinBarrier(ev, player.barriers)
        super().check_in(ev, member)

    def check_everyone_in(
        self, ev: events.CheckEveryoneIn, member: models.Person
    ) -> None:
        self._check_not_playing(ev)
        self._check_judge(ev, member)
        if self.state != models.TournamentState.WAITING:
            raise CheckinClosed(ev)
        super().check_everyone_in(ev, member)

    def check_out(self, ev: events.CheckIn, member: models.Person) -> None:
        self._check_not_playing(ev)
        if self.state != models.TournamentState.WAITING:
            raise CheckinClosed(ev)
        if ev.player_uid not in self.players:
            raise UnregisteredPlayers(ev)
        super().check_out(ev, member)

    def round_start(self, ev: events.RoundStart, member: models.Person) -> None:
        self._check_not_playing(ev)
        self._check_judge(ev, member)
        self._check_seating(ev, ev.seating)
        self._check_pp_relationships(ev, ev.seating)
        super().round_start(ev, member)

    def round_alter(self, ev: events.RoundAlter, member: models.Person) -> None:
        if ev.round < 1 or ev.round > len(self.rounds):
            raise BadRoundNumber(ev)
        self._check_judge(ev, member)
        self._check_seating(ev, ev.seating)
        self._check_pp_relationships(ev, ev.seating, ignore=ev.round)
        super().round_alter(ev, member)

    def round_finish(self, ev: events.RoundFinish, member: models.Person) -> None:
        self._check_judge(ev, member)
        if self.state == models.TournamentState.FINISHED:
            raise TournamentFinished(ev)
        if self.state in [
            models.TournamentState.REGISTRATION,
            models.TournamentState.WAITING,
        ]:
            raise NoRoundInProgress(ev)
        if len(self.rounds[-1].tables) < 1:
            raise EmptyRound(ev)
        invalid_tables = [
            idx
            for idx, t in enumerate(self.rounds[-1].tables, 1)
            if t.state != models.TableState.FINISHED
        ]
        if invalid_tables:
            raise InvalidTables(ev, invalid_tables)
        super().round_finish(ev, member)

    def round_cancel(self, ev: events.RoundCancel, member: models.Person) -> None:
        self._check_judge(ev, member)
        if any(
            seat.result.vp != 0
            for table in self.rounds[-1].tables
            for seat in table.seating
        ):
            raise RoundInProgress(ev)
        super().round_cancel(ev, member)

    def _check_seating(self, ev, seating: list[list[str]]) -> None:
        """Check all are registered, no duplicates, and tables have 5 players max
        Note: does not raise for table < 4
        """
        players = [uid for table in seating for uid in table]
        unregistered = [uid for uid in players if uid not in self.players]
        if unregistered:
            raise UnregisteredPlayers(ev, unregistered)
        duplicates = [
            self.players[uid]
            for uid, count in collections.Counter(players).items()
            if count > 1
        ]
        if duplicates:
            raise SeatingDuplicates(ev, duplicates)
        for i, table in enumerate(seating, 1):
            # in some cases, there is no choice but to seat a 3-players table.
            # there should still be a hard warning in a higher layer:
            # even if a 4th player drops, better to DQ them and leave them on the table
            if len(table) > 5:
                raise BadSeating(ev, i)

    def _check_pp_relationships(
        self, ev, seating: list[list[str]], ignore: int = 0
    ) -> None:
        """Check for predator-prey relationship repeats

        This is the one forbidden thing in tournament seating (except in finals).
        """
        pp = set()
        for i, round_ in enumerate(self.rounds, 1):
            if i == ignore:
                continue
            for table in round_.tables:
                for i, seat in enumerate(table.seating):
                    prey = table.seating[(i + 1) % len(table.seating)].player_uid
                    pp.add((seat.player_uid, prey))
        for table in seating:
            for i, predator in enumerate(table):
                prey = table[(i + 1) % len(table)]
                if (predator, prey) in pp:
                    raise PredatorPreyDuplicate(
                        ev,
                        (
                            self.players.get(predator, predator),
                            self.players.get(prey, prey),
                        ),
                    )

    def _get_player_table_seat(
        self, ev: events.SetResult, round_number: int, player_uid: str
    ):
        if round_number < 1 or round_number > len(self.rounds):
            raise BadRoundNumber(ev)
        round_ = self.rounds[ev.round - 1]
        for table in round_.tables:
            for seat in table.seating:
                if seat.player_uid == player_uid:
                    return table, seat
        raise PlayerAbsent(ev)

    def set_result(self, ev: events.SetResult, member: models.Person) -> None:
        if ev.player_uid not in self.players:
            raise UnregisteredPlayers(ev)
        table, seat = self._get_player_table_seat(ev, ev.round, ev.player_uid)
        if ev.player_uid != member.uid:
            if (
                ev.round != len(self.rounds)
                or member.uid not in [s.player_uid for s in table.seating]
                or seat.judge
            ):
                # current round players are allowed to set their opponents results
                self._check_judge(ev, member)
        super().set_result(ev, member)

    def set_deck(self, ev: events.SetResult, member: models.Person) -> None:
        if ev.player_uid not in self.players:
            raise UnregisteredPlayers(ev)
        if ev.round:
            self._get_player_table_seat(ev, ev.round, ev.player_uid)
        if ev.round and not self.multideck:
            raise SingleDeckEvent(ev)
        if ev.round or ev.player_uid != member.uid:
            self._check_judge(ev, member)
        super().set_deck(ev, member, check=(ev.player_uid == member.uid))

    def drop(self, ev: events.Drop, member: models.Person) -> None:
        if ev.player_uid not in self.players:
            raise UnregisteredPlayers(ev)
        if member.uid != ev.player_uid:
            self._check_judge(ev, member)
        super().drop(ev, member)

    def sanction(self, ev: events.Sanction, member: models.Person) -> None:
        self._check_judge(ev, member)
        if ev.player_uid not in self.players:
            raise UnregisteredPlayers(ev)
        super().sanction(ev, member)

    def unsanction(self, ev: events.Unsanction, member: models.Person) -> None:
        self._check_judge(ev, member)
        if ev.player_uid not in self.players:
            raise UnregisteredPlayers(ev)
        super().unsanction(ev, member)

    def override(self, ev: events.Override, member: models.Person) -> None:
        self._check_judge(ev, member)
        if ev.round < 1 or ev.round > len(self.rounds):
            raise BadRoundNumber(ev)
        round_ = self.rounds[ev.round - 1]
        if ev.table < 1 or ev.table > len(round_.tables):
            raise BadTableNumber(ev)
        super().override(ev, member)

    def unoverride(self, ev: events.Unoverride, member: models.Person) -> None:
        self._check_judge(ev, member)
        if ev.round < 1 or ev.round > len(self.rounds):
            raise BadRoundNumber(ev)
        round_ = self.rounds[ev.round - 1]
        if ev.table < 1 or ev.table > len(round_.tables):
            raise BadTableNumber(ev)
        super().unoverride(ev, member)

    def seed_finals(self, ev: events.SeedFinals, member: models.Person) -> None:
        self._check_judge(ev, member)
        self._check_not_playing(ev)
        if self.state == models.TournamentState.FINISHED:
            raise TournamentFinished(ev)
        unregistered = [uid for uid in ev.toss.keys() if uid not in self.players] + [
            uid for uid in ev.seeds if uid not in self.players
        ]
        if unregistered:
            raise UnregisteredPlayers(ev, unregistered)
        if len(ev.seeds) < 4 or len(ev.seeds) > 5:
            raise BadSeeding(ev)
        super().seed_finals(ev, member)

    def seat_finals(self, ev: events.SeatFinals, member: models.Person) -> None:
        self._check_judge(ev, member)
        if self.state not in [
            models.TournamentState.FINALS,
            models.TournamentState.FINISHED,
        ]:
            raise FinalsNotSeeded(ev)
        for uid in ev.seating:
            if uid not in self.players:
                raise UnregisteredPlayers(ev, [uid])
            if uid not in self.finals_seeds:
                raise NotFinalist(ev, self.players[uid])
        if any(uid not in ev.seating for uid in self.finals_seeds):
            raise BadSeeding(ev)
        self._check_seating(ev, [ev.seating])
        # for a finals, you really need at least 3
        if len(ev.seating) < 4 or len(ev.seating) > 5:
            raise BadSeating(ev)
        super().seat_finals(ev, member)

    def finish_tournament(
        self, ev: events.FinishTournament, member: models.Person
    ) -> None:
        self._check_judge(ev, member)
        if self.state != models.TournamentState.FINALS:
            raise FinalsNotSeeded(ev)
        final_table = self.rounds[-1].tables[0]
        if final_table.state != models.TableState.FINISHED:
            raise InvalidTables(ev, [1])
        super().finish_tournament(ev, member)


# ################################################################ Convenience functions


def standings(tournament: models.TournamentInfo) -> list[tuple[int, models.PlayerInfo]]:
    def sort_key(p: models.Player):
        return (
            # dropouts go last (only matters when tournament in progress)
            int(p.state == models.PlayerState.FINISHED),
            # winner first
            -int(p.uid == tournament.winner),
            # then finalists (higher score can have dropped out)
            -int(p.uid in tournament.finals_seeds),
            -p.result.gw,
            -p.result.vp,
            -p.result.tp,
            p.toss,
        )

    sorted_players = sorted(
        (p for p in tournament.players.values() if p.rounds_played), key=sort_key
    )
    rank = 1
    res = []
    if tournament.state == models.TournamentState.FINISHED:
        finalists = 0
    else:
        finalists = 5
    for _, players in itertools.groupby(sorted_players, key=sort_key):
        players = list(players)
        res.extend([rank, p] for p in players)
        if rank < 3 and finalists < 5:
            finalists += len(players)
            if finalists < 5:
                rank = 2
            else:
                rank = 6
        else:
            rank += len(players)
    return res


def ratings(tournament: models.TournamentInfo) -> dict[str, models.TournamentRating]:
    """Returns a dict of {member_uid: TournamentRating}"""
    if tournament.state != models.TournamentState.FINISHED:
        return {}
    participants = [p for p in tournament.players.values() if p.rounds_played > 0]
    size = len(participants)
    ret = {}
    if not size:
        return ret
    coef = math.log(size * size, 15) - 1
    if tournament.rank in [models.TournamentRank.NC]:
        coef += 0.25
    elif tournament.rank == models.TournamentRank.CC:
        coef += 1
    for rank, player in standings(tournament):
        rating_points = 5 + 4 * player.result.vp + 8 * player.result.gw
        gp_points = 3
        if rank == 1:
            rating_points += round(90 * coef)
            gp_points = 25
        elif rank == 2:
            rating_points += round(30 * coef)
            gp_points = 15
        elif rank <= 10:
            gp_points = (10 - rank) + 6
        ret[player.uid] = models.TournamentRating(
            tournament=models.TournamentMinimal(**dataclasses.asdict(tournament)),
            size=size,
            rounds_played=player.rounds_played,
            result=player.result,
            rank=rank,
            rating_points=rating_points,
            gp_points=gp_points,
        )
    return ret


def toss_for_finals(tournament: models.Tournament) -> tuple[list[str], dict[str, int]]:
    random.seed()
    toss = {}
    for rank, players in itertools.groupby(standings(tournament)):
        if rank > 5:
            break
        samples = random.sample(range(1, len(players) + 1), len(players))
        for p, t in zip(players, samples):
            p.toss = t
            toss[p.uid] = t
    return [p.uid for _, p in standings(tournament)[:5]], toss


def next_round_seating(tournament: models.Tournament):
    """Compute next round's seating"""
    players = [
        p for p in tournament.players if p.state == models.PlayerState.CHECKED_IN
    ]
    random.shuffle(players)
    # N is the number of players, seat them as much as you can on 5-seats-tables,
    # remains [N % 5] non-seated players. Take one player per 5 seats-tables
    # until you make this 4 seats. You take from [4 - (N % 5)] tables,
    # and end up with [5 - (N % 5)] 4-seats-tables.
    # account for the case when N % 5 is zero: [5 - (N % 5 or 5)] 4-seats-tables.
    players_count = len(players)
    seat_in_fives = players_count - 4 * (5 - (players_count % 5 or 5))
    seated = 0
    res = models.Round()
    while seated < players_count:
        seats = 5 if seated < seat_in_fives else 4
        res.tables.append(
            models.Table(
                seating=[models.TableSeat(p) for p in players[seated : seated + seats]]
            )
        )
        seated += seats
    return res


def round_to_krcg_round(round_: models.Round):
    return krcg.seating.Round(
        [s.player_uid for s in table.seating] for table in round_.tables
    )


def optimise_full_seating(
    tournament: models.Tournament, round_: models.Round
) -> krcg.seating.Score:
    if any(s.result for table in round_.tables for s in table.seating):
        raise ResultRecorded()
    rounds = [round_to_krcg_round(r) for r in tournament.rounds]
    rounds.append(round_to_krcg_round(round_))
    rounds, score = krcg.seating.optimise(
        rounds,
        iterations=20000,
        fixed=len(tournament.rounds),
    )
    for i, table in enumerate(rounds[-1]):
        for j, uid in enumerate(table):
            round_.tables[i].seating[j].player_uid = uid
    return score


def optimise_table_seating(
    tournament: models.Tournament, table: int
) -> krcg.seating.Score:
    """Optimise seating for given table in the current round.
    First table is table=1
    """
    table = table - 1
    rounds = [round_to_krcg_round(r) for r in tournament.rounds]
    score = krcg.seating.optimise_table(rounds, table)
    for i, uid in enumerate(rounds[-1][table]):
        tournament.rounds[-1].tables[table].seating[i].player_uid = uid
    return score
