import pytest

from archon import scoring


def test_compute_nominal_5p():
    gw_5 = [
        scoring.Score(0, 5, 0),
        scoring.Score(0, 0, 0),
        scoring.Score(0, 0, 0),
        scoring.Score(0, 0, 0),
        scoring.Score(0, 0, 0),
    ]
    assert scoring.compute_table_scores(gw_5) == 5.0
    assert gw_5 == [
        scoring.Score(1, 5, 60),
        scoring.Score(0, 0, 30),
        scoring.Score(0, 0, 30),
        scoring.Score(0, 0, 30),
        scoring.Score(0, 0, 30),
    ]
    gw_4 = [
        scoring.Score(0, 1, 0),
        scoring.Score(0, 0, 0),
        scoring.Score(0, 4, 0),
        scoring.Score(0, 0, 0),
        scoring.Score(0, 0, 0),
    ]
    assert scoring.compute_table_scores(gw_4) == 4.0
    assert gw_4 == [
        scoring.Score(0, 1, 48),
        scoring.Score(0, 0, 24),
        scoring.Score(1, 4, 60),
        scoring.Score(0, 0, 24),
        scoring.Score(0, 0, 24),
    ]
    gw_3_2 = [
        scoring.Score(0, 3, 0),
        scoring.Score(0, 0, 0),
        scoring.Score(0, 0, 0),
        scoring.Score(0, 0, 0),
        scoring.Score(0, 2, 0),
    ]
    assert scoring.compute_table_scores(gw_3_2) == 3.0
    assert gw_3_2 == [
        scoring.Score(1, 3, 60),
        scoring.Score(0, 0, 24),
        scoring.Score(0, 0, 24),
        scoring.Score(0, 0, 24),
        scoring.Score(0, 2, 48),
    ]
    gw_3_1_1 = [
        scoring.Score(0, 3, 0),
        scoring.Score(0, 0, 0),
        scoring.Score(0, 1, 0),
        scoring.Score(0, 1, 0),
        scoring.Score(0, 0, 0),
    ]
    assert scoring.compute_table_scores(gw_3_1_1) == 3.0
    assert gw_3_1_1 == [
        scoring.Score(1, 3, 60),
        scoring.Score(0, 0, 18),
        scoring.Score(0, 1, 42),
        scoring.Score(0, 1, 42),
        scoring.Score(0, 0, 18),
    ]
    to_all = [
        scoring.Score(0, 0.5, 0),
        scoring.Score(0, 0.5, 0),
        scoring.Score(0, 0.5, 0),
        scoring.Score(0, 0.5, 0),
        scoring.Score(0, 0.5, 0),
    ]
    assert scoring.compute_table_scores(to_all) == 0.5
    assert to_all == [
        scoring.Score(0, 0.5, 36),
        scoring.Score(0, 0.5, 36),
        scoring.Score(0, 0.5, 36),
        scoring.Score(0, 0.5, 36),
        scoring.Score(0, 0.5, 36),
    ]
    to_1 = [
        scoring.Score(0, 1.5, 0),
        scoring.Score(0, 0, 0),
        scoring.Score(0, 0.5, 0),
        scoring.Score(0, 0.5, 0),
        scoring.Score(0, 0.5, 0),
    ]
    assert scoring.compute_table_scores(to_1) == 1.5
    assert to_1 == [
        scoring.Score(0, 1.5, 60),
        scoring.Score(0, 0, 12),
        scoring.Score(0, 0.5, 36),
        scoring.Score(0, 0.5, 36),
        scoring.Score(0, 0.5, 36),
    ]
    to_1_1 = [
        scoring.Score(0, 1.5, 0),
        scoring.Score(0, 0, 0),
        scoring.Score(0, 1.5, 0),
        scoring.Score(0, 0, 0),
        scoring.Score(0, 0.5, 0),
    ]
    assert scoring.compute_table_scores(to_1_1) == 1.5
    assert to_1_1 == [
        scoring.Score(0, 1.5, 54),
        scoring.Score(0, 0, 18),
        scoring.Score(0, 1.5, 54),
        scoring.Score(0, 0, 18),
        scoring.Score(0, 0.5, 36),
    ]
    to_2_1 = [
        scoring.Score(0, 1.5, 0),
        scoring.Score(0, 0, 0),
        scoring.Score(0, 2.5, 0),
        scoring.Score(0, 0, 0),
        scoring.Score(0, 0, 0),
    ]
    assert scoring.compute_table_scores(to_2_1) == 2.5
    assert to_2_1 == [
        scoring.Score(0, 1.5, 48),
        scoring.Score(0, 0, 24),
        scoring.Score(1, 2.5, 60),
        scoring.Score(0, 0, 24),
        scoring.Score(0, 0, 24),
    ]


def test_compute_nominal_4p():
    gw_4 = [
        scoring.Score(0, 4, 0),
        scoring.Score(0, 0, 0),
        scoring.Score(0, 0, 0),
        scoring.Score(0, 0, 0),
    ]
    assert scoring.compute_table_scores(gw_4) == 4.0
    assert gw_4 == [
        scoring.Score(1, 4, 60),
        scoring.Score(0, 0, 28),
        scoring.Score(0, 0, 28),
        scoring.Score(0, 0, 28),
    ]
    gw_3 = [
        scoring.Score(0, 3, 0),
        scoring.Score(0, 0, 0),
        scoring.Score(0, 1, 0),
        scoring.Score(0, 0, 0),
    ]
    assert scoring.compute_table_scores(gw_3) == 3.0
    assert gw_3 == [
        scoring.Score(1, 3, 60),
        scoring.Score(0, 0, 18),
        scoring.Score(0, 1, 48),
        scoring.Score(0, 0, 18),
    ]
    gw_2_1_1 = [
        scoring.Score(0, 2, 0),
        scoring.Score(0, 1, 0),
        scoring.Score(0, 1, 0),
        scoring.Score(0, 0, 0),
    ]
    assert scoring.compute_table_scores(gw_2_1_1) == 2.0
    assert gw_2_1_1 == [
        scoring.Score(1, 2, 60),
        scoring.Score(0, 1, 36),
        scoring.Score(0, 1, 36),
        scoring.Score(0, 0, 12),
    ]
    to_all = [
        scoring.Score(0, 0.5, 0),
        scoring.Score(0, 0.5, 0),
        scoring.Score(0, 0.5, 0),
        scoring.Score(0, 0.5, 0),
    ]
    assert scoring.compute_table_scores(to_all) == 0.5
    assert to_all == [
        scoring.Score(0, 0.5, 36),
        scoring.Score(0, 0.5, 36),
        scoring.Score(0, 0.5, 36),
        scoring.Score(0, 0.5, 36),
    ]
    to_1 = [
        scoring.Score(0, 1.5, 0),
        scoring.Score(0, 0, 0),
        scoring.Score(0, 0.5, 0),
        scoring.Score(0, 0.5, 0),
    ]
    assert scoring.compute_table_scores(to_1) == 1.5
    assert to_1 == [
        scoring.Score(0, 1.5, 60),
        scoring.Score(0, 0, 12),
        scoring.Score(0, 0.5, 36),
        scoring.Score(0, 0.5, 36),
    ]
    to_1_1 = [
        scoring.Score(0, 1.5, 0),
        scoring.Score(0, 0, 0),
        scoring.Score(0, 1.5, 0),
        scoring.Score(0, 0, 0),
    ]
    assert scoring.compute_table_scores(to_1_1) == 1.5
    assert to_1_1 == [
        scoring.Score(0, 1.5, 54),
        scoring.Score(0, 0, 18),
        scoring.Score(0, 1.5, 54),
        scoring.Score(0, 0, 18),
    ]
    to_2 = [
        scoring.Score(0, 2.5, 0),
        scoring.Score(0, 0, 0),
        scoring.Score(0, 0, 0),
        scoring.Score(0, 0.5, 0),
    ]
    assert scoring.compute_table_scores(to_2) == 2.5
    assert to_2 == [
        scoring.Score(1, 2.5, 60),
        scoring.Score(0, 0, 18),
        scoring.Score(0, 0, 18),
        scoring.Score(0, 0.5, 48),
    ]


def test_compute_unsanctionned():
    p6 = [
        scoring.Score(0, 6, 0),
        scoring.Score(0, 0, 0),
        scoring.Score(0, 0, 0),
        scoring.Score(0, 0, 0),
        scoring.Score(0, 0, 0),
        scoring.Score(0, 0, 0),
    ]
    assert scoring.compute_table_scores(p6) == 6.0
    assert p6 == [
        scoring.Score(1, 6, 72),
        scoring.Score(0, 0, 36),
        scoring.Score(0, 0, 36),
        scoring.Score(0, 0, 36),
        scoring.Score(0, 0, 36),
        scoring.Score(0, 0, 36),
    ]
    p6_to = [
        scoring.Score(0, 2.5, 0),
        scoring.Score(0, 0, 0),
        scoring.Score(0, 0, 0),
        scoring.Score(0, 0.5, 0),
        scoring.Score(0, 0.5, 0),
        scoring.Score(0, 0.5, 0),
    ]
    assert scoring.compute_table_scores(p6_to) == 2.5
    assert p6_to == [
        scoring.Score(1, 2.5, 72),
        scoring.Score(0, 0, 18),
        scoring.Score(0, 0, 18),
        scoring.Score(0, 0.5, 48),
        scoring.Score(0, 0.5, 48),
        scoring.Score(0, 0.5, 48),
    ]
    p3 = [
        scoring.Score(0, 3, 0),
        scoring.Score(0, 0, 0),
        scoring.Score(0, 0, 0),
    ]
    assert scoring.compute_table_scores(p3) == 3.0
    assert p3 == [
        scoring.Score(1, 3, 60),
        scoring.Score(0, 0, 36),
        scoring.Score(0, 0, 36),
    ]
    p3_to = [
        scoring.Score(0, 1.5, 0),
        scoring.Score(0, 0, 0),
        scoring.Score(0, 0.5, 0),
    ]
    assert scoring.compute_table_scores(p3_to) == 1.5
    assert p3_to == [
        scoring.Score(0, 1.5, 60),
        scoring.Score(0, 0, 24),
        scoring.Score(0, 0.5, 48),
    ]


def test_check_valid():
    assert (
        scoring.check_table_vps(
            [
                scoring.Score(0, 5, 0),
                scoring.Score(0, 0, 0),
                scoring.Score(0, 0, 0),
                scoring.Score(0, 0, 0),
                scoring.Score(0, 0, 0),
            ]
        )
        is None
    )
    assert (
        scoring.check_table_vps(
            [
                scoring.Score(0, 4, 0),
                scoring.Score(0, 1, 0),
                scoring.Score(0, 0, 0),
                scoring.Score(0, 0, 0),
                scoring.Score(0, 0, 0),
            ]
        )
        is None
    )
    assert (
        scoring.check_table_vps(
            [
                scoring.Score(0, 1.5, 0),
                scoring.Score(0, 0, 0),
                scoring.Score(0, 2.5, 0),
                scoring.Score(0, 0, 0),
                scoring.Score(0, 0, 0),
            ]
        )
        is None
    )
    assert (
        scoring.check_table_vps(
            [
                scoring.Score(0, 3, 0),
                scoring.Score(0, 0, 0),
                scoring.Score(0, 0, 0),
                scoring.Score(0, 0, 0),
                scoring.Score(0, 2, 0),
            ]
        )
        is None
    )
    assert (
        scoring.check_table_vps(
            [
                scoring.Score(0, 3, 0),
                scoring.Score(0, 0, 0),
                scoring.Score(0, 2, 0),
                scoring.Score(0, 0, 0),
                scoring.Score(0, 0, 0),
            ]
        )
        is None
    )
    assert (
        scoring.check_table_vps(
            [
                scoring.Score(0, 0.5, 0),
                scoring.Score(0, 0.5, 0),
                scoring.Score(0, 0.5, 0),
                scoring.Score(0, 0.5, 0),
                scoring.Score(0, 0.5, 0),
            ]
        )
        is None
    )
    assert (
        scoring.check_table_vps(
            [
                scoring.Score(0, 4, 0),
                scoring.Score(0, 0, 0),
                scoring.Score(0, 0, 0),
                scoring.Score(0, 0, 0),
            ]
        )
        is None
    )
    assert (
        scoring.check_table_vps(
            [
                scoring.Score(0, 2, 0),
                scoring.Score(0, 2, 0),
                scoring.Score(0, 0, 0),
                scoring.Score(0, 0, 0),
            ]
        )
        is None
    )


def test_check_valid_withdrawal():
    assert (
        scoring.check_table_vps(
            [
                scoring.Score(0, 1, 0),
                scoring.Score(0, 2.5, 0),
                scoring.Score(0, 0, 0),
                scoring.Score(0, 0, 0),
            ]
        )
        is None
    )
    assert (
        scoring.check_table_vps(
            [
                scoring.Score(0, 1.5, 0),
                scoring.Score(0, 0, 0),
                scoring.Score(0, 2, 0),
                scoring.Score(0, 0, 0),
                scoring.Score(0, 0.5, 0),
            ]
        )
        is None
    )
    assert (
        scoring.check_table_vps(
            [
                scoring.Score(0, 0.5, 0),
                scoring.Score(0, 0.5, 0),
                scoring.Score(0, 1, 0),
                scoring.Score(0, 0.5, 0),
                scoring.Score(0, 0.5, 0),
            ]
        )
        is None
    )
    assert (
        scoring.check_table_vps(
            [
                scoring.Score(0, 2, 0),
                scoring.Score(0, 0, 0),
                scoring.Score(0, 1.5, 0),
                scoring.Score(0, 0, 0),
            ]
        )
        is None
    )


def test_check_invalid_no_oust():
    assert isinstance(
        scoring.check_table_vps(
            [
                scoring.Score(0, 1, 0),
                scoring.Score(0, 1, 0),
                scoring.Score(0, 1, 0),
                scoring.Score(0, 1, 0),
                scoring.Score(0, 1, 0),
            ]
        ),
        scoring.MissingHalfVP,
    )


def test_check_invalid_missing_vp():
    assert isinstance(
        scoring.check_table_vps(
            [
                scoring.Score(0, 0.5, 0),
                scoring.Score(0, 0, 0),
                scoring.Score(0, 1.5, 0),
                scoring.Score(0, 0.5, 0),
            ]
        ),
        scoring.MissingVP,
    )


def test_check_invalid_impossible_split():
    assert isinstance(
        scoring.check_table_vps(
            [
                scoring.Score(0, 2, 0),
                scoring.Score(0, 0, 0),
                scoring.Score(0, 2, 0),
                scoring.Score(0, 0, 0),
            ]
        ),
        scoring.MissingHalfVP,
    )


def test_check_invalid_too_many_vp():
    assert isinstance(
        scoring.check_table_vps(
            [
                scoring.Score(0, 5, 0),
                scoring.Score(0, 0, 0),
                scoring.Score(0, 0, 0),
                scoring.Score(0, 0, 0),
            ]
        ),
        scoring.ExcessiveTotal,
    )


def test_check_invalid_not_enough_vp():
    assert isinstance(
        scoring.check_table_vps(
            [
                scoring.Score(0, 0, 0),
                scoring.Score(0, 0, 0),
                scoring.Score(0, 0, 0),
                scoring.Score(0, 0, 0),
            ]
        ),
        scoring.InsufficientTotal,
    )


def test_check_invalid_impossible_withdrawal():
    assert isinstance(
        scoring.check_table_vps(
            [
                scoring.Score(0, 2, 0),
                scoring.Score(0, 0, 0),
                scoring.Score(0, 0, 0),
                scoring.Score(0, 1.5, 0),
            ]
        ),
        scoring.MissingHalfVP,
    )
