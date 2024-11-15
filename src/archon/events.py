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


@dataclasses.dataclass
class Event:
    type: EventType
    uid: str = pydantic.Field(default_factory=uuid_str)


@dataclasses.dataclass
class Register(Event):
    type: pydantic.Literal[EventType.REGISTER]
    name: str
    player_uid: str = pydantic.Field(default_factory=uuid_str)


@dataclasses.dataclass
class OpenCheckin(Event):
    type: pydantic.Literal[EventType.OPEN_CHECKIN]


@dataclasses.dataclass
class AppointJudge(Event):
    type: pydantic.Literal[EventType.APPOINT_JUDGE]
    judge_uid: str = pydantic.Field(default_factory=uuid_str)


@dataclasses.dataclass
class AppointHeadJudge(Event):
    type: pydantic.Literal[EventType.APPOINT_HEAD_JUDGE]
    judge_uid: str = pydantic.Field(default_factory=uuid_str)


@dataclasses.dataclass
class RemoveJudge(Event):
    type: pydantic.Literal[EventType.REMOVE_JUDGE]
    judge_uid: str


@dataclasses.dataclass
class CheckIn(Event):
    type: pydantic.Literal[EventType.CHECK_IN]
    player_uid: str


@dataclasses.dataclass
class RoundStart(Event):
    type: pydantic.Literal[EventType.ROUND_START]
    seating: list[list[str]]  # list of tables: [[player_uid]]


@dataclasses.dataclass
class RoundAlter(Event):
    type: pydantic.Literal[EventType.ROUND_ALTER]
    round: int
    seating: list[list[str]]  # list of tables: [[player_uid]]


@dataclasses.dataclass
class RoundFinish(Event):
    type: pydantic.Literal[EventType.ROUND_FINISH]


@dataclasses.dataclass
class SetResult(Event):
    type: pydantic.Literal[EventType.SET_RESULT]
    player_uid: str
    round: int
    result: scoring.Score
    judge_uid: str = ""


@dataclasses.dataclass
class Drop(Event):
    type: pydantic.Literal[EventType.DROP]
    player_uid: str


@dataclasses.dataclass
class Sanction(Event):
    type: pydantic.Literal[EventType.SANCTION]
    level: SanctionLevel
    judge_uid: str
    player_uid: str
    comment: str


@dataclasses.dataclass
class Unsanction(Event):
    type: pydantic.Literal[EventType.UNSANCTION]
    level: SanctionLevel
    judge_uid: str
    player_uid: str
    comment: str


@dataclasses.dataclass
class Override(Event):
    type: pydantic.Literal[EventType.OVERRIDE]
    round: int
    table: int
    judge_uid: str
    comment: str


@dataclasses.dataclass
class SeedFinals(Event):
    type: pydantic.Literal[EventType.SEED_FINALS]
    seeds: list[str]  # [player_uid] in seed order (first is top seed)


@dataclasses.dataclass
class SeatFinals(Event):
    type: pydantic.Literal[EventType.SEAT_FINALS]
    seating: list[str]  # [player_uid]


@dataclasses.dataclass
class Finish(Event):
    type: pydantic.Literal[EventType.FINISH]


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
