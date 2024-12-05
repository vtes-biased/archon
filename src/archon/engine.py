import collections
import itertools
import krcg.seating
import logging
import random

from . import models
from . import events
from . import scoring

LOG = logging.getLogger()


class TournamentManager(models.Tournament):
    """Implements re-entring idempotent tournament logic. No validity check.
    This is the logic one needs to implement on the Client/UI side to allow for
    incremental changes.
    """

    def handle_event(self, ev: events.TournamentEvent, member_uid: str) -> None:
        LOG.debug("Handling event: %s", ev)
        match ev.type:
            case events.EventType.REGISTER:
                self.register(ev, member_uid)
            case events.EventType.OPEN_CHECKIN:
                self.open_checkin(ev, member_uid)
            case events.EventType.APPOINT_JUDGE:
                self.appoint_judge(ev, member_uid)
            case events.EventType.APPOINT_HEAD_JUDGE:
                self.appoint_head_judge(ev, member_uid)
            case events.EventType.REMOVE_JUDGE:
                self.remove_judge(ev, member_uid)
            case events.EventType.CHECK_IN:
                self.check_in(ev, member_uid)
            case events.EventType.ROUND_START:
                self.round_start(ev, member_uid)
            case events.EventType.ROUND_ALTER:
                self.round_alter(ev, member_uid)
            case events.EventType.ROUND_FINISH:
                self.round_finish(ev, member_uid)
            case events.EventType.SET_RESULT:
                self.set_result(ev, member_uid)
            case events.EventType.DROP:
                self.drop(ev, member_uid)
            case events.EventType.SANCTION:
                self.sanction(ev, member_uid)
            case events.EventType.UNSANCTION:
                self.unsanction(ev, member_uid)
            case events.EventType.OVERRIDE:
                self.override(ev, member_uid)
            case events.EventType.SEED_FINALS:
                self.seed_finals(ev, member_uid)
            case events.EventType.SEAT_FINALS:
                self.seat_finals(ev, member_uid)
            case events.EventType.FINISH_TOURNAMENT:
                self.finish_tournament(ev, member_uid)

    def register(self, ev: events.Register, member_uid: str) -> None:
        self.players[ev.player_uid] = models.Player(
            name=ev.name,
            uid=ev.player_uid,
            vekn=ev.vekn,
            country=ev.country,
            city=ev.city,
        )

    def open_checkin(self, ev: events.OpenCheckin, member_uid: str) -> None:
        self.state = models.TournamentState.WAITING

    def appoint_judge(self, ev: events.AppointJudge, member_uid: str) -> None:
        if ev.judge_uid not in self.judges:
            self.judges.append(ev.judge_uid)

    def appoint_head_judge(self, ev: events.AppointHeadJudge, member_uid: str) -> None:
        if ev.judge_uid in self.judges:
            self.judges.remove(ev.judge_uid)
        self.judges.insert(0, ev.judge_uid)

    def remove_judge(self, ev: events.RemoveJudge, member_uid: str) -> None:
        if ev.judge_uid in self.judges:
            self.judges.remove(ev.judge_uid)

    def check_in(self, ev: events.CheckIn, member_uid: str) -> None:
        self.players[ev.player_uid].state = models.PlayerState.CHECKED_IN

    def round_start(self, ev: events.RoundStart, member_uid: str) -> None:
        self.state = models.TournamentState.PLAYING
        self.rounds.append(self._event_seating_to_round(ev.seating))
        self._set_players_statuses_from_current_round()

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
                    player.state = models.PlayerState.REGISTERED  # or CHECKED_IN?

    def round_alter(self, ev: events.RoundAlter, member_uid: str) -> None:
        """Keep players results and table overrides."""
        old_tables = self.rounds[ev.round - 1].tables
        results = {
            seat.player_uid: seat.result
            for table in old_tables
            for seat in table.seating
        }
        overrides = {i: table.override for i, table in enumerate(old_tables)}
        self.rounds[ev.round - 1] = self._event_seating_to_round(ev.seating)
        # if this is the current round, change players statuses accordingly
        if ev.round == len(self.rounds):
            self._set_players_statuses_from_current_round()
        # restore overrides and results
        for i, table in enumerate(self.rounds[ev.round - 1].tables):
            table.override = overrides.pop(i, None)
            for seat in table.seating:
                seat.result = results.pop(seat.player_uid, scoring.Score())
            finals = False
            if self.state in [
                models.TournamentState.FINALS,
                models.TournamentState.FINISHED,
            ] and ev.round == len(self.rounds):
                finals = True
            self._compute_table_score(table, finals=finals)
            self._compute_table_state(table)
        # remove previous result for players who are removed from the new seating
        for uid, result in results.items():
            self.players[uid].result -= result

    def round_finish(self, ev: events.RoundFinish, member_uid: str) -> None:
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

    def _event_seating_to_round(self, seating: list[list[str]]) -> models.Round:
        return models.Round(
            tables=[
                models.Table(
                    seating=[models.TableSeat(player_uid=uid) for uid in table]
                )
                for table in seating
            ]
        )

    def set_result(self, ev: events.SetResult, member_uid: str) -> None:
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
        player.result += player_seat.result
        finals = False
        if self.state in [
            models.TournamentState.FINALS,
            models.TournamentState.FINISHED,
        ] and ev.round == len(self.rounds):
            finals = True
        self._compute_table_score(player_table, finals=finals)
        self._compute_table_state(player_table)

    def _compute_table_score(self, table: models.Table, finals=False):
        for s in table.seating:
            self.players[s.player_uid].result -= s.result
        max_vps = scoring.compute_table_scores([s.result for s in table.seating])
        if finals:
            # winning the finals counts as a GW even with less than 2 VPs
            # cf. VEKN Ratings system
            top_seats = [s for s in table.seating if s.result.vp >= max_vps]
            top_seats.sort(key=lambda s: self.finals_seeds.index(s.player_uid))
            top_seats[0].result.gw = 1
            self.winner = top_seats[0].player_uid
        for s in table.seating:
            self.players[s.player_uid].result += s.result

    def _compute_table_state(self, table: models.Table):
        if table.override:
            table.state = models.TableState.FINISHED
            return
        err = scoring.check_table_vps([s.result for s in table.seating])
        if isinstance(err, scoring.InsufficientTotal):
            table.state = models.TableState.IN_PROGRESS
        elif err:
            table.state = models.TableState.INVALID
        else:
            table.state = models.TableState.FINISHED

    def drop(self, ev: events.Drop, member_uid: str) -> None:
        self.players[ev.player_uid].state = models.PlayerState.FINISHED

    def sanction(self, ev: events.Sanction, member_uid: str) -> None:
        self.sanctions.setdefault(ev.player_uid, [])
        self.sanctions[ev.player_uid].append(
            models.Sanction(
                player_uid=ev.player_uid,
                judge_uid=member_uid,
                level=ev.level,
                comment=ev.comment,
            )
        )
        if ev.level == events.SanctionLevel.DISQUALIFICATION:
            player = self.players[ev.player_uid]
            player.state = models.PlayerState.FINISHED
            if models.Barrier.DISQUALIFIED not in player.barriers:
                player.barriers.append(models.Barrier.DISQUALIFIED)

    def unsanction(self, ev: events.Unsanction, member_uid: str) -> None:
        sanctions = self.sanctions.get(ev.player_uid, [])
        to_delete = [
            i for i, sanction in enumerate(sanctions) if sanction.level == ev.level
        ]
        for i in to_delete:
            sanctions.pop(i)
        if ev.level == events.SanctionLevel.DISQUALIFICATION:
            self.players[ev.player_uid].barriers.remove(models.Barrier.DISQUALIFIED)

    def override(self, ev: events.Override, member_uid: str) -> None:
        table = self.rounds[ev.round - 1].tables[ev.table - 1]
        table.override = models.ScoreOverride(judge_uid=member_uid, comment=ev.comment)
        self._compute_table_state(table)

    def seed_finals(self, ev: events.SeedFinals, member_uid: str) -> None:
        self.state = models.TournamentState.FINALS
        self.finals_seeds = ev.seeds[:]
        self.rounds.append(self._event_seating_to_round([self.finals_seeds[:]]))
        seeds = set(ev.seeds)
        for player in self.players.values():
            if player.uid not in seeds:
                player.state = models.PlayerState.FINISHED
                player.table = 0
                player.seed = 0
        for i, uid in enumerate(self.finals_seeds, 1):
            self.players[uid].table = 1
            self.players[uid].seed = i
            self.players[uid].state = models.PlayerState.PLAYING

    def seat_finals(self, ev: events.SeatFinals, member_uid: str) -> None:
        self.rounds[-1] = self._event_seating_to_round([ev.seating])
        for player in self.players.values():
            if player.uid not in ev.seating:
                player.state = models.PlayerState.FINISHED

    def finish_tournament(self, ev: events.FinishTournament, member_uid: str) -> None:
        finals_table = self.rounds[-1].tables[0]
        self._compute_table_score(finals_table, finals=True)
        self._compute_table_state(finals_table)
        for player in self.players.values():
            player.state = models.PlayerState.FINISHED
        self.state = models.TournamentState.FINISHED


class TournamentError(ValueError): ...


class DuplicateEvent(TournamentError): ...


class UnregisteredPlayer(TournamentError): ...


class DisqualifiedPlayer(TournamentError): ...


class UnnamedPlayer(TournamentError): ...


class PlayerAbsent(TournamentError): ...


class BadRoundNumber(TournamentError): ...


class BadTableNumber(TournamentError): ...


class CheckinBarrier(TournamentError): ...


class InvalidTables(TournamentError): ...


class NotJudge(TournamentError): ...


class SeatingDuplicates(TournamentError): ...


class PredatorPreyDuplicate(TournamentError): ...


class BadSeating(TournamentError): ...


class BadSeeding(TournamentError): ...


class NonFinalist(TournamentError): ...


class TournamentFinished(TournamentError): ...


class RoundInProgress(TournamentError): ...


class FinalsInProgress(TournamentError): ...


class FinalsNotSeeded(TournamentError): ...


class NoRoundInProgress(TournamentError): ...


class CheckinClosed(TournamentError): ...


class ResultRecorded(TournamentError): ...


class TournamentOrchestrator(TournamentManager):
    """Implements all input checks and raise meaningful errors"""

    def handle_event(self, ev: events.TournamentEvent, member_uid: str) -> None:
        super().handle_event(ev, member_uid)

    def register(self, ev: events.Register, member_uid: str) -> None:
        if any(
            s.level == events.SanctionLevel.DISQUALIFICATION
            for s in self.sanctions.get(ev.player_uid, [])
        ):
            raise DisqualifiedPlayer(ev)
        if not ev.name:
            raise UnnamedPlayer(ev)
        if not ev.vekn:
            # only a judge can register a player without VEKN
            self._check_judge(ev, member_uid)
        super().register(ev, member_uid)

    def _check_not_playing(self, ev: events.TournamentEvent):
        if self.state == models.TournamentState.FINALS:
            raise FinalsInProgress(ev)
        if self.state == models.TournamentState.PLAYING:
            raise RoundInProgress(ev)
        if self.state == models.TournamentState.FINISHED:
            raise TournamentFinished(ev)

    def _check_judge(self, ev: events.TournamentEvent, member_uid: str) -> None:
        if member_uid not in self.judges:
            raise NotJudge(ev)

    def open_checkin(self, ev: events.OpenCheckin, member_uid: str) -> None:
        self._check_not_playing(ev)
        self._check_judge(ev, member_uid)
        super().open_checkin(ev, member_uid)

    def check_in(self, ev: events.CheckIn, member_uid: str) -> None:
        self._check_not_playing(ev)
        if self.state != models.TournamentState.WAITING:
            raise CheckinClosed(ev)
        if ev.player_uid not in self.players:
            raise UnregisteredPlayer(ev, ev.player_uid)
        player = self.players[ev.player_uid]
        if player.barriers:  # maybe judges should be allowed to?
            raise CheckinBarrier(ev, player.barrier)
        super().check_in(ev, member_uid)

    def round_start(self, ev: events.RoundStart, member_uid: str) -> None:
        self._check_not_playing(ev)
        self._check_judge(ev, member_uid)
        self._check_seating(ev, ev.seating)
        self._check_pp_relationships(ev, ev.seating)
        super().round_start(ev, member_uid)

    def round_alter(self, ev: events.RoundAlter, member_uid: str) -> None:
        if ev.round < 1 or ev.round > len(self.rounds):
            raise BadRoundNumber(ev)
        self._check_judge(ev, member_uid)
        self._check_seating(ev, ev.seating)
        self._check_pp_relationships(ev, ev.seating, ignore=ev.round)
        super().round_alter(ev, member_uid)

    def round_finish(self, ev: events.RoundFinish, member_uid: str) -> None:
        self._check_judge(ev, member_uid)
        if self.state == models.TournamentState.FINISHED:
            raise TournamentFinished(ev)
        if self.state in [
            models.TournamentState.REGISTRATION,
            models.TournamentState.WAITING,
        ]:
            raise NoRoundInProgress(ev)
        invalid_tables = [
            t for t in self.rounds[-1].tables if t.state != models.TableState.FINISHED
        ]
        if invalid_tables:
            raise InvalidTables(ev, invalid_tables)
        super().round_finish(ev, member_uid)

    def _check_seating(self, ev, seating: list[list[str]]) -> None:
        """Check all are registered, no duplicates, and tables have 5 players max
        Note: does not raise for table < 4
        """
        players = [uid for table in seating for uid in table]
        unregistered = [uid for uid in players if uid not in self.players]
        if unregistered:
            raise UnregisteredPlayer(ev, unregistered)
        duplicates = [
            uid for uid, count in collections.Counter(players).items() if count > 1
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
                    raise PredatorPreyDuplicate(ev, (predator, prey))

    def _get_player_table(
        self, ev: events.SetResult, round_number: int, player_uid: str
    ):
        if round_number < 1 or round_number > len(self.rounds):
            raise BadRoundNumber(ev)
        round_ = self.rounds[ev.round - 1]
        for table in round_.tables:
            for seat in table.seating:
                if seat.player_uid == player_uid:
                    return table
        raise PlayerAbsent(ev)

    def set_result(self, ev: events.SetResult, member_uid: str) -> None:
        if ev.player_uid not in self.players:
            raise UnregisteredPlayer(ev, ev.player_uid)
        if ev.round < 1 or ev.round > len(self.rounds):
            raise BadRoundNumber(ev)
        round_ = self.rounds[ev.round - 1]
        if ev.player_uid not in [
            seat.player_uid for table in round_.tables for seat in table.seating
        ]:
            raise PlayerAbsent(ev)
        table = self._get_player_table(ev, ev.round, ev.player_uid)
        if ev.player_uid != member_uid:
            if ev.round != len(self.rounds) or member_uid not in [
                s.player_uid for s in table.seating
            ]:
                # current round players are allowed to set their opponents results
                # TODO: maybe? disallow it if the result was set by a judge
                self._check_judge(ev, member_uid)
        super().set_result(ev, member_uid)

    def drop(self, ev: events.Drop, member_uid: str) -> None:
        if ev.player_uid not in self.players:
            raise UnregisteredPlayer(ev, ev.player_uid)
        if member_uid != ev.player_uid:
            self._check_judge(ev, member_uid)
        super().drop(ev, member_uid)

    def sanction(self, ev: events.Sanction, member_uid: str) -> None:
        self._check_judge(ev, member_uid)
        if ev.player_uid not in self.players:
            raise UnregisteredPlayer(ev, ev.player_uid)
        super().sanction(ev, member_uid)

    def unsanction(self, ev: events.Unsanction, member_uid: str) -> None:
        self._check_judge(ev, member_uid)
        if ev.player_uid not in self.players:
            raise UnregisteredPlayer(ev, ev.player_uid)
        super().unsanction(ev, member_uid)

    def override(self, ev: events.Override, member_uid: str) -> None:
        self._check_judge(ev, member_uid)
        if ev.round < 1 or ev.round > len(self.rounds):
            raise BadRoundNumber(ev)
        round_ = self.rounds[ev.round - 1]
        if ev.table < 1 or ev.table > len(round_.tables):
            raise BadTableNumber(ev)
        super().override(ev, member_uid)

    def seed_finals(self, ev: events.SeedFinals, member_uid: str) -> None:
        self._check_judge(ev, member_uid)
        self._check_not_playing(ev)
        if self.state == models.TournamentState.FINISHED:
            raise TournamentFinished(ev)
        for uid in ev.toss.keys():
            if uid not in self.players:
                raise UnregisteredPlayer(ev, uid)
        for uid in ev.seeds:
            if uid not in self.players:
                raise UnregisteredPlayer(ev, uid)
        if len(ev.seeds) < 4 or len(ev.seeds) > 5:
            raise BadSeeding(ev)
        super().seed_finals(ev, member_uid)

    def seat_finals(self, ev: events.SeatFinals, member_uid: str) -> None:
        self._check_judge(ev, member_uid)
        if self.state != models.TournamentState.FINALS:
            raise FinalsNotSeeded(ev)
        for uid in ev.seating:
            if uid not in self.players:
                raise UnregisteredPlayer(ev, uid)
            if uid not in self.finals_seeds:
                raise NonFinalist(ev, ev.winner_uid)
        if any(uid not in ev.seating for uid in self.finals_seeds):
            raise BadSeeding(ev)
        self._check_seating([ev.seating])
        # for a finals, you really need at least 3
        if len(ev.seating) < 4 or len(ev.seating) > 5:
            raise BadSeating()
        super().seat_finals(ev, member_uid)

    def finish_tournament(self, ev: events.FinishTournament, member_uid: str) -> None:
        self._check_judge(ev, member_uid)
        if self.state != models.TournamentState.FINALS:
            raise FinalsNotSeeded(ev)
        final_table = self.rounds[-1].tables[0]
        if final_table.state != models.TableState.FINISHED:
            raise InvalidTables(ev, final_table)
        super().finish_tournament(ev, member_uid)


# ################################################################ Convenience functions


def standings(tournament: models.Tournament) -> list[tuple[int, models.Player]]:
    sort_key = lambda p: (
        p.state == models.PlayerState.FINISHED,
        -int(p.uid == tournament.winner),
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
