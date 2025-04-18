import itertools
import logging
import math
import pydantic
from pydantic import dataclasses

LOG = logging.getLogger()


@dataclasses.dataclass(order=True, eq=True)
class Score:
    gw: int = pydantic.Field(0, ge=0)
    vp: float = pydantic.Field(0.0, ge=0, multiple_of=0.5)
    tp: int = pydantic.Field(0, ge=0)

    def __str__(self):
        if self.gw:
            return f"{self.gw}GW{self.vp:.2g} ({self.tp}TP)"
        else:
            return f"{self.vp:.2g}VP ({self.tp}TP)"

    def __add__(self, rhs):
        return self.__class__(
            gw=self.gw + rhs.gw, vp=self.vp + rhs.vp, tp=self.tp + rhs.tp
        )

    def __iadd__(self, rhs):
        self.gw += rhs.gw
        self.vp += rhs.vp
        self.tp += rhs.tp
        return self

    def __sub__(self, rhs):
        return self.__class__(
            gw=max(0, self.gw - rhs.gw),
            vp=max(0, self.vp - rhs.vp),
            tp=max(0, self.tp - rhs.tp),
        )

    def __isub__(self, rhs):
        self.gw -= min(self.gw, rhs.gw)
        self.vp -= min(self.vp, rhs.vp)
        self.tp -= min(self.tp, rhs.tp)
        return self


def compute_table_scores(scores: list[Score]) -> float:
    """Compute GW and TPs based on provided VPs, return the maximum VPs scored.
    Check the VPs first with check_table_vps()
    """
    # we're not checking table size here, so try and handle illegal sizes in some way
    # for more than 5 players, just augment the tps 12 by 12
    # table sizes are checked in check_table_vps though, so the score only counts
    # if it gets overriden by a judge
    tps = [t for _, t in zip(range(max(5, len(scores))), itertools.count(12, 12))]
    if len(scores) < 5:
        tps.pop(2)
        # for less than 4, remove the lowest scores, so it stays relevant
        tps = tps[4 - len(scores) :]
    assert len(tps) == len(scores)
    scores_by_vps = sorted(scores, key=lambda x: x.vp)
    # iter over scores in rising order, group by vp count
    for vp, results in itertools.groupby(scores_by_vps, lambda x: x.vp):
        # multiple players can have the same vp count: they shares TPs
        # for the positions they cover
        results = list(results)
        tp = sum(tps.pop(0) for _ in range(len(results))) // len(results)
        # only highest score over 2 (last group = highest vp,
        if vp >= 2 and len(results) == 1 and len(tps) == 0:
            gw = 1
        else:
            gw = 0
        for r in results:
            r.gw = gw
            r.tp = tp
    return vp


class ScoringError(ValueError): ...


class InvalidTableSize(ScoringError): ...


class InsufficientTotal(ScoringError): ...


class ExcessiveTotal(ScoringError): ...


class MissingVP(ScoringError): ...


class MissingHalfVP(ScoringError): ...


def check_table_vps(scores: list[Score]) -> ScoringError | None:
    """Check VPs validity on a table"""
    # check table size
    if len(scores) < 4 or len(scores) > 5:
        return InvalidTableSize()
    # checking the total is easy, just ceil the half points and total is table size
    total = sum(math.ceil(s.vp) for s in scores)
    if total < len(scores):
        return InsufficientTotal()
    if total > len(scores):
        return ExcessiveTotal()
    vps = [[i, s.vp] for i, s in enumerate(scores)]
    # go through all ousts successively: we begin anywhere on the table
    # and search for a zero (which means an oust, otherwise it would be 0.5)
    while len(vps) > 0:
        LOG.debug("scores check pass: %s", vps)
        for j, (idx, vp_count) in enumerate(vps):
            # each oust (vp_count == 0), remove 1 vp from predator ("account" for it)
            # and remove the item from the vps list.
            # Note the predator can have been ousted first (and we're not there yet)
            # so the "accounted" scores can become temporarily negative before
            # being transfered to the next predator
            if vp_count <= 0:
                # vp_count can be negative but should not have half points
                # that would mean we were in a [0.5, <=0] situation previous loop:
                # a half-point score followed by an oust, missing a point
                if vp_count % 1:
                    return MissingVP(f"missing VP for seat {idx + 1}")
                vps[(j - 1) % len(vps)][1] += vp_count - 1
                vps.pop(j)
                break
        # we did not break, all remaining scores are positive
        else:
            # We have some remaining because we checked the total: len(vps) > 0
            # if everyone is at 0.5 it's a timeout
            if all([vp == 0.5 for _, vp in vps]):
                # there must be more than one
                if len(vps) == 1:
                    return MissingHalfVP(f"Seat {vps[0][0] + 1} cannot timeout alone")
            # remove all 0.5
            vps = [[i, vp] for i, vp in vps if vp != 0.5]
            # we can still have one standing if the 0.5 were withdrawals, but not more
            if len(vps) > 1:
                return MissingHalfVP(
                    f"Missing half vps for seats {[i + 1 for i, _ in vps]}"
                )
            # if there is one left, he has 1 point (because of the total check)
            break
