import enum
import uuid
import pydantic
import typing
from pydantic import dataclasses

from . import scoring


def uuid_str() -> str:
    return str(uuid.uuid4())


class EventType(enum.StrEnum):
    REGISTER = "REGISTER"
    OPEN_CHECKIN = "OPEN_CHECKIN"
    APPOINT_JUDGE = "APPOINT_JUDGE"
    APPOINT_HEAD_JUDGE = "APPOINT_HEAD_JUDGE"
    REMOVE_JUDGE = "REMOVE_JUDGE"
    CHECK_IN = "CHECK_IN"
    ROUND_START = "ROUND_START"
    ROUND_ALTER = "ROUND_ALTER"
    ROUND_FINISH = "ROUND_FINISH"
    SET_RESULT = "SET_RESULT"
    DROP = "DROP"
    SANCTION = "SANCTION"
    UNSANCTION = "UNSANCTION"
    OVERRIDE = "OVERRIDE"
    SEED_FINALS = "SEED_FINALS"
    SEAT_FINALS = "SEAT_FINALS"
    FINISH = "FINISH"


class SanctionLevel(enum.StrEnum):
    CAUTION = "Caution"
    WARNING = "Warning"
    DISQUALIFICATION = "Disqualification"


@dataclasses.dataclass(kw_only=True)
class Event:
    type: EventType
    uid: str = pydantic.Field(default_factory=uuid_str)


@dataclasses.dataclass(kw_only=True)
class Register(Event):
    type: typing.Literal[EventType.REGISTER]
    name: str
    vekn: str
    player_uid: str = pydantic.Field(default_factory=uuid_str)


@dataclasses.dataclass(kw_only=True)
class OpenCheckin(Event):
    type: typing.Literal[EventType.OPEN_CHECKIN]


@dataclasses.dataclass(kw_only=True)
class AppointJudge(Event):
    type: typing.Literal[EventType.APPOINT_JUDGE]
    judge_uid: str = pydantic.Field(default_factory=uuid_str)


@dataclasses.dataclass(kw_only=True)
class AppointHeadJudge(Event):
    type: typing.Literal[EventType.APPOINT_HEAD_JUDGE]
    judge_uid: str = pydantic.Field(default_factory=uuid_str)


@dataclasses.dataclass(kw_only=True)
class RemoveJudge(Event):
    type: typing.Literal[EventType.REMOVE_JUDGE]
    judge_uid: str


@dataclasses.dataclass(kw_only=True)
class CheckIn(Event):
    type: typing.Literal[EventType.CHECK_IN]
    player_uid: str


@dataclasses.dataclass(kw_only=True)
class RoundStart(Event):
    type: typing.Literal[EventType.ROUND_START]
    seating: list[list[str]]  # list of tables: [[player_uid]]


@dataclasses.dataclass(kw_only=True)
class RoundAlter(Event):
    type: typing.Literal[EventType.ROUND_ALTER]
    round: int
    seating: list[list[str]]  # list of tables: [[player_uid]]


@dataclasses.dataclass(kw_only=True)
class RoundFinish(Event):
    type: typing.Literal[EventType.ROUND_FINISH]


@dataclasses.dataclass(kw_only=True)
class SetResult(Event):
    type: typing.Literal[EventType.SET_RESULT]
    player_uid: str
    round: int
    result: scoring.Score
    judge_uid: str = ""


@dataclasses.dataclass(kw_only=True)
class Drop(Event):
    type: typing.Literal[EventType.DROP]
    player_uid: str


@dataclasses.dataclass(kw_only=True)
class Sanction(Event):
    type: typing.Literal[EventType.SANCTION]
    level: SanctionLevel
    judge_uid: str
    player_uid: str
    comment: str


@dataclasses.dataclass(kw_only=True)
class Unsanction(Event):
    type: typing.Literal[EventType.UNSANCTION]
    level: SanctionLevel
    judge_uid: str
    player_uid: str
    comment: str


@dataclasses.dataclass(kw_only=True)
class Override(Event):
    type: typing.Literal[EventType.OVERRIDE]
    round: int
    table: int
    judge_uid: str
    comment: str


@dataclasses.dataclass(kw_only=True)
class SeedFinals(Event):
    type: typing.Literal[EventType.SEED_FINALS]
    seeds: list[str]  # [player_uid] in seed order (first is top seed)


@dataclasses.dataclass(kw_only=True)
class SeatFinals(Event):
    type: typing.Literal[EventType.SEAT_FINALS]
    seating: list[str]  # [player_uid]


@dataclasses.dataclass(kw_only=True)
class Finish(Event):
    type: typing.Literal[EventType.FINISH]


TournamentEvent = typing.Union[
    Register,
    OpenCheckin,
    AppointJudge,
    AppointHeadJudge,
    RemoveJudge,
    CheckIn,
    RoundStart,
    RoundAlter,
    RoundFinish,
    SetResult,
    Drop,
    Sanction,
    Unsanction,
    Override,
    SeedFinals,
    SeatFinals,
    Finish,
]
