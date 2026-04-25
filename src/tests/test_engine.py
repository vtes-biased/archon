import datetime

import pytest

from archon import engine, events, models


def _judge() -> models.Person:
    return models.Person(name="Judge", roles=[models.MemberRole.ADMIN])


def _player(uid: str) -> models.Player:
    return models.Player(name=uid, uid=uid)


def _round(seating: list[list[str]]) -> models.Round:
    return models.Round(
        tables=[
            models.Table(seating=[models.TableSeat(player_uid=uid) for uid in table])
            for table in seating
        ]
    )


def _tournament(
    rounds: list[list[list[str]]],
    state: models.TournamentState,
    finals_seeds: list[str] | None = None,
) -> engine.TournamentOrchestrator:
    player_uids = {uid for r in rounds for table in r for uid in table}
    return engine.TournamentOrchestrator(
        name="Test",
        start=datetime.datetime(2026, 1, 1, tzinfo=datetime.timezone.utc),
        state=state,
        players={uid: _player(uid) for uid in player_uids},
        rounds=[_round(r) for r in rounds],
        finals_seeds=finals_seeds or [],
    )


def test_round_alter_finals_allows_pp_repeat_from_prelim():
    # Prelim PP pairs: a->b, b->c, c->d, d->e, e->a
    # Finals reseat reuses a->b. Must be accepted (finals are exempt).
    prelim = [["a", "b", "c", "d", "e"]]
    finals = [["a", "c", "e", "b", "d"]]  # different order, no overlap with prelim
    t = _tournament(
        [prelim, finals],
        state=models.TournamentState.FINALS,
        finals_seeds=["a", "b", "c", "d", "e"],
    )
    ev = events.RoundAlter(
        type=events.EventType.ROUND_ALTER,
        round=2,
        seating=[["a", "b", "c", "d", "e"]],  # recreates every prelim PP pair
    )
    t.round_alter(ev, _judge())
    # round 2 was overwritten with the new seating
    assert [s.player_uid for s in t.rounds[1].tables[0].seating] == [
        "a",
        "b",
        "c",
        "d",
        "e",
    ]


def test_round_alter_prelim_ignores_finals_pp():
    # Prelim 1 PP pairs: a->b, b->c, c->d, d->e, e->a
    # Finals PP pairs: a->c, c->e, e->b, b->d, d->a (distinct from prelim 1)
    # Reseat prelim 1 to a seating whose pairs come from the FINALS round only.
    # Without the fix this would raise because finals pairs would be in `pp`.
    prelim = [["a", "b", "c", "d", "e"]]
    finals = [["a", "c", "e", "b", "d"]]
    t = _tournament(
        [prelim, finals],
        state=models.TournamentState.FINALS,
        finals_seeds=["a", "b", "c", "d", "e"],
    )
    ev = events.RoundAlter(
        type=events.EventType.ROUND_ALTER,
        round=1,
        seating=[["a", "c", "e", "b", "d"]],  # all pairs match the finals
    )
    t.round_alter(ev, _judge())


def test_round_alter_prelim_still_rejects_prelim_pp_repeat():
    # Two prelim rounds; altering round 2 to recreate a prelim-1 PP pair must raise.
    prelim_1 = [["a", "b", "c", "d", "e"]]
    prelim_2 = [["a", "c", "e", "b", "d"]]
    t = _tournament([prelim_1, prelim_2], state=models.TournamentState.PLAYING)
    ev = events.RoundAlter(
        type=events.EventType.ROUND_ALTER,
        round=2,
        seating=[["a", "b", "c", "d", "e"]],  # same as prelim 1
    )
    with pytest.raises(engine.PredatorPreyDuplicate):
        t.round_alter(ev, _judge())


def test_round_start_rejects_pp_repeat():
    # One finished prelim round, then start a new one whose pairs repeat it.
    prelim_1 = [["a", "b", "c", "d", "e"]]
    t = _tournament([prelim_1], state=models.TournamentState.WAITING)
    ev = events.RoundStart(
        type=events.EventType.ROUND_START,
        seating=[["a", "b", "c", "d", "e"]],
    )
    with pytest.raises(engine.PredatorPreyDuplicate):
        t.round_start(ev, _judge())
