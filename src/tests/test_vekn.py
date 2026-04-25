import datetime

from archon import models, scoring, vekn


def _player(uid: str, name: str, vekn_id: str, gw: int, vp: float, tp: int):
    return models.Player(
        name=name,
        uid=uid,
        vekn=vekn_id,
        rounds_played=2,
        result=scoring.Score(gw=gw, vp=vp, tp=tp),
        state=models.PlayerState.FINISHED,
    )


def _seat(uid: str, gw: int = 0, vp: float = 0.0, tp: int = 0):
    return models.TableSeat(
        player_uid=uid,
        result=scoring.Score(gw=gw, vp=vp, tp=tp),
    )


def _table(seats):
    return models.Table(seating=seats, state=models.TableState.FINISHED)


def _round(tables):
    return models.Round(tables=tables)


def _tournament(players, rounds, finals_seeds=None, winner=""):
    return models.Tournament(
        name="Test",
        start=datetime.datetime(2026, 1, 1, tzinfo=datetime.timezone.utc),
        state=models.TournamentState.FINISHED,
        players={p.uid: p for p in players},
        rounds=rounds,
        finals_seeds=finals_seeds or [],
        winner=winner,
    )


def _parse_archondata(s: str) -> tuple[int, list[list[str]]]:
    """Split the archondata string into (nrounds, [player_record_fields,...])."""
    nrounds_str, players_str = s.split("¤", 1)
    # Each record ends with a trailing §, so split and drop the trailing empty.
    parts = players_str.split("§")
    assert parts[-1] == ""
    parts = parts[:-1]
    # 11 fields per player record.
    assert len(parts) % 11 == 0
    records = [parts[i : i + 11] for i in range(0, len(parts), 11)]
    return int(nrounds_str), records


def test_archondata_with_finals_separates_prelim_and_finals():
    # Two prelim rounds + finals. Alice wins finals (3 VP), Bob 1.5 VP, Carol 0.5 VP.
    # Alice cumulative: prelim 1GW/4VP/96TP + finals 1GW/3VP/60TP = 2GW/7VP/156TP.
    # Bob cumulative: prelim 1GW/4VP/96TP + finals 0GW/1.5VP/54TP = 1GW/5.5VP/150TP.
    # Carol cumulative: prelim 0GW/2VP/72TP + finals 0GW/0.5VP/36TP = 0GW/2.5VP/108TP.
    # Dan was at prelim only: 0GW/1VP/24TP, not a finalist.
    alice = _player("a", "Alice Smith", "1000001", gw=2, vp=7.0, tp=156)
    bob = _player("b", "Bob Jones", "1000002", gw=1, vp=5.5, tp=150)
    carol = _player("c", "Carol Doe", "1000003", gw=0, vp=2.5, tp=108)
    dan = _player("d", "Dan", "1000004", gw=0, vp=1.0, tp=24)
    finals = _round(
        [
            _table(
                [_seat("a", 1, 3.0, 60), _seat("b", 0, 1.5, 54), _seat("c", 0, 0.5, 36)]
            )
        ]
    )
    # A dummy prelim round so rounds_played>0 is justified — only finals seating
    # is read by to_archondata.
    prelim = _round([_table([_seat("a"), _seat("b"), _seat("c"), _seat("d")])])
    t = _tournament(
        [alice, bob, carol, dan],
        [prelim, finals],
        finals_seeds=["a", "b", "c"],
        winner="a",
    )

    nrounds, records = _parse_archondata(vekn.to_archondata(t))
    assert nrounds == 2  # prelim round + finals round (matches len(rounds))
    by_vekn = {r[4]: r for r in records}

    # Alice (winner): prelim_gw=1, prelim_vp=4.0, finals_vp=3.0
    a = by_vekn["1000001"]
    assert a[0] == "1"  # rank
    assert a[1] == "Alice"
    assert a[2] == "Smith"
    assert a[5] == "1"  # prelim gw (total 2 - finals 1)
    assert a[6] == "4.0"  # prelim vp (total 7.0 - finals 3.0)
    assert a[7] == "3.0"  # finals vp

    # Bob (finalist, didn't win): prelim_gw=1 (no finals GW), prelim_vp=4.0
    b = by_vekn["1000002"]
    assert b[5] == "1"
    assert b[6] == "4.0"
    assert b[7] == "1.5"

    # Carol (finalist): prelim_gw=0, prelim_vp=2.0, finals_vp=0.5
    c = by_vekn["1000003"]
    assert c[5] == "0"
    assert c[6] == "2.0"
    assert c[7] == "0.5"

    # Dan (non-finalist): unchanged, finals_vp=0.0
    d = by_vekn["1000004"]
    assert d[5] == "0"
    assert d[6] == "1.0"
    assert d[7] == "0.0"


def test_archondata_no_finals_does_not_decrement_rank1():
    # Tournament finished without finals (auto-close after no rounds, or organizer
    # cut short). Cumulative scores ARE prelim-only; the previous code would
    # incorrectly subtract 1 from the rank-1 player's gw and would mis-source
    # final_vp from the last prelim round's first table.
    alice = _player("a", "Alice S", "1000001", gw=2, vp=6.0, tp=120)
    bob = _player("b", "Bob J", "1000002", gw=1, vp=3.0, tp=84)
    carol = _player("c", "Carol", "1000003", gw=0, vp=1.0, tp=48)
    last_round = _round([_table([_seat("a", 1, 3.0, 60), _seat("b"), _seat("c")])])
    t = _tournament(
        [alice, bob, carol],
        [last_round],
        finals_seeds=[],
        winner="",
    )

    nrounds, records = _parse_archondata(vekn.to_archondata(t))
    assert nrounds == 1
    by_vekn = {r[4]: r for r in records}

    a = by_vekn["1000001"]
    assert a[5] == "2"  # NOT decremented (no finals played)
    assert a[6] == "6.0"
    assert a[7] == "0.0"  # finals_vp must be 0 for everyone, not pulled from prelim

    b = by_vekn["1000002"]
    assert b[5] == "1"
    assert b[6] == "3.0"
    assert b[7] == "0.0"

    c = by_vekn["1000003"]
    assert c[5] == "0"
    assert c[6] == "1.0"
    assert c[7] == "0.0"


def test_archondata_finals_winner_with_sub_two_vp():
    # Edge case from engine.py:390-395: finals winner gets +1 GW even with <2 VP.
    # E.g. 1.5/1.5/1.0/0.5/0.5 split where seed[0] gets the GW with 1.5 VP.
    # Alice prelim 1GW/3VP/60TP, finals 1GW/1.5VP/54TP -> cumulative 2GW/4.5VP/114TP.
    # Bob prelim 1GW/3VP/60TP, finals 0GW/1.5VP/54TP -> cumulative 1GW/4.5VP/114TP.
    alice = _player("a", "Alice", "1000001", gw=2, vp=4.5, tp=114)
    bob = _player("b", "Bob", "1000002", gw=1, vp=4.5, tp=114)
    finals = _round([_table([_seat("a", 1, 1.5, 54), _seat("b", 0, 1.5, 54)])])
    prelim = _round([_table([_seat("a"), _seat("b")])])
    t = _tournament(
        [alice, bob],
        [prelim, finals],
        finals_seeds=["a", "b"],
        winner="a",
    )

    _, records = _parse_archondata(vekn.to_archondata(t))
    by_vekn = {r[4]: r for r in records}

    a = by_vekn["1000001"]
    assert a[5] == "1"  # prelim gw = 2 - 1 (finals)
    assert a[6] == "3.0"  # prelim vp = 4.5 - 1.5
    assert a[7] == "1.5"

    b = by_vekn["1000002"]
    assert b[5] == "1"  # no finals GW; cumulative gw stays
    assert b[6] == "3.0"
    assert b[7] == "1.5"
