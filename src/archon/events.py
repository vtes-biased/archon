import enum
import uuid
import pydantic
import typing
from pydantic import dataclasses


def uuid_str() -> str:
    return str(uuid.uuid4())


class EventType(enum.StrEnum):
    REGISTER = "REGISTER"
    OPEN_CHECKIN = "OPEN_CHECKIN"
    CHECK_IN = "CHECK_IN"
    CHECK_EVERYONE_IN = "CHECK_EVERYONE_IN"
    CHECK_OUT = "CHECK_OUT"
    ROUND_START = "ROUND_START"
    ROUND_ALTER = "ROUND_ALTER"
    ROUND_FINISH = "ROUND_FINISH"
    ROUND_CANCEL = "ROUND_CANCEL"
    SET_RESULT = "SET_RESULT"
    SET_DECK = "SET_DECK"
    DROP = "DROP"
    SANCTION = "SANCTION"
    UNSANCTION = "UNSANCTION"
    OVERRIDE = "OVERRIDE"
    UNOVERRIDE = "UNOVERRIDE"
    SEED_FINALS = "SEED_FINALS"
    SEAT_FINALS = "SEAT_FINALS"
    FINISH_TOURNAMENT = "FINISH_TOURNAMENT"


class SanctionLevel(enum.StrEnum):
    CAUTION = "Caution"
    WARNING = "Warning"
    DISQUALIFICATION = "Disqualification"
    BAN = "Ban"


class SanctionCategory(enum.StrEnum):
    NONE = ""
    DECK_PROBLEM = "Deck Problem"
    PROCEDURAL_ERROR = "Procedural Error"
    CARD_DRAWING = "Card drawing"
    MARKED_CARDS = "Marked Cards"
    SLOW_PLAY = "Slow Play"
    UNSPORTSMANLIKE_CONDUCT = "Unsportsmanlike Conduct"
    CHEATING = "Cheating"
    ETHICS = "Ethics"


@dataclasses.dataclass(kw_only=True)
class Event:
    type: EventType
    uid: str = pydantic.Field(default_factory=uuid_str)


@dataclasses.dataclass(kw_only=True)
class Register(Event):
    type: typing.Literal[EventType.REGISTER]
    name: str
    vekn: str = ""
    player_uid: str = pydantic.Field(default_factory=uuid_str)
    country: str | None = ""
    city: str | None = ""


@dataclasses.dataclass(kw_only=True)
class OpenCheckin(Event):
    type: typing.Literal[EventType.OPEN_CHECKIN]


@dataclasses.dataclass(kw_only=True)
class CheckIn(Event):
    type: typing.Literal[EventType.CHECK_IN]
    player_uid: str
    code: str = ""


@dataclasses.dataclass(kw_only=True)
class CheckEveryoneIn(Event):
    type: typing.Literal[EventType.CHECK_EVERYONE_IN]


@dataclasses.dataclass(kw_only=True)
class CheckOut(Event):
    type: typing.Literal[EventType.CHECK_OUT]
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
class RoundCancel(Event):
    type: typing.Literal[EventType.ROUND_CANCEL]


@dataclasses.dataclass(kw_only=True)
class SetResult(Event):
    type: typing.Literal[EventType.SET_RESULT]
    player_uid: str
    round: int
    vps: float


@dataclasses.dataclass(kw_only=True)
class SetDeck(Event):
    type: typing.Literal[EventType.SET_DECK]
    player_uid: str
    round: int | None = None  # Can have a different deck each round if multideck
    deck: str  # Deck builder URL or plain text decklist


@dataclasses.dataclass(kw_only=True)
class Drop(Event):
    type: typing.Literal[EventType.DROP]
    player_uid: str


@dataclasses.dataclass(kw_only=True)
class Sanction(Event):
    type: typing.Literal[EventType.SANCTION]
    level: SanctionLevel
    sanction_uid: str
    player_uid: str
    comment: str = ""
    category: SanctionCategory | None = None


@dataclasses.dataclass(kw_only=True)
class Unsanction(Event):
    type: typing.Literal[EventType.UNSANCTION]
    player_uid: str
    sanction_uid: str


@dataclasses.dataclass(kw_only=True)
class Override(Event):
    type: typing.Literal[EventType.OVERRIDE]
    round: int
    table: int
    comment: str


@dataclasses.dataclass(kw_only=True)
class Unoverride(Event):
    type: typing.Literal[EventType.UNOVERRIDE]
    round: int
    table: int


@dataclasses.dataclass(kw_only=True)
class SeedFinals(Event):
    type: typing.Literal[EventType.SEED_FINALS]
    toss: dict[str, int]  # {player_uid; toss}
    seeds: list[str]  # [player_uid] in seed order (first is top seed)


@dataclasses.dataclass(kw_only=True)
class SeatFinals(Event):
    type: typing.Literal[EventType.SEAT_FINALS]
    seating: list[str]  # [player_uid]


@dataclasses.dataclass(kw_only=True)
class FinishTournament(Event):
    type: typing.Literal[EventType.FINISH_TOURNAMENT]


TournamentEvent = typing.Union[
    Register,
    OpenCheckin,
    CheckIn,
    CheckEveryoneIn,
    CheckOut,
    RoundStart,
    RoundAlter,
    RoundFinish,
    RoundCancel,
    SetResult,
    SetDeck,
    Drop,
    Sanction,
    Unsanction,
    Override,
    Unoverride,
    SeedFinals,
    SeatFinals,
    FinishTournament,
]


OPENAPI_EXAMPLES = {
    "Register": {
        "summary": "Register a player",
        "description": (
            "Neither VEKN nor UID is mandatory. "
            "To register a new player who has no VEKN account, provide a new UUID4. "
            "If you do not provide one, "
            "a new UUID4 will be generated and an account created for that person."
        ),
        "value": {
            "type": "Register",
            "name": "John Doe",
            "vekn": "12300001",
            "player_uid": "24AAC87E-DE63-46DF-9784-AB06B2F37A24",
        },
    },
    "Open Check-in": {
        "summary": "Open the check-in. JUDGE ONLY",
        "description": (
            "Check a player in, signaling they are present "
            "and ready to play the next round."
            "You should perform the check-in just before the round starts to limit "
            "the number of players who do not show up to their table."
        ),
        "value": {"type": "OpenCheckin"},
    },
    "Appoint Judge": {
        "summary": "Appoint a judge. JUDGE ONLY",
        "description": (
            "Judges have permission to send all events, simple players are limited. "
            "The UID must match a VEKN member UID."
        ),
        "value": {
            "type": "AppointJudge",
            "judge_uid": "238CD960-7E54-4A38-A676-8288A5700FC8",
        },
    },
    "Remove Judge": {
        "summary": "Remove a judge. JUDGE ONLY",
        "description": (
            "Judges have permission to send all events, simple players are limited. "
            "The UID must match a VEKN member UID."
        ),
        "value": {
            "type": "RemoveJudge",
            "judge_uid": "238CD960-7E54-4A38-A676-8288A5700FC8",
        },
    },
    "Check In": {
        "summary": "Check a player in",
        "description": "Mark a player as ready to play. Players can self-check-in. ",
        "value": {
            "type": "CheckIn",
            "player_uid": "238CD960-7E54-4A38-A676-8288A5700FC8",
        },
    },
    "Check Everyone In": {
        "summary": "Check everyone in. JUDGE ONLY",
        "description": (
            "When running registrations in situ, or after first round. "
            "It will not check-in players who have dropped (FINISHED state) "
            "or have an active barrier (missing deck, having been disqualified, etc.)"
        ),
        "value": {
            "type": "CheckEveryoneIn",
        },
    },
    "Round Start": {
        "summary": "Starts the next round. JUDGE ONLY",
        "description": (
            "Only possible if the previous round is finished. "
            "The provided seating must list players UID forming the tables. "
            "Each UID must match a VEKN member UID. "
        ),
        "value": {
            "type": "RoundStart",
            "seating": [
                [
                    "238CD960-7E54-4A38-A676-8288A5700FC8",
                    "796CD3CE-BC2B-4505-B448-1C2D42E9F140",
                    "80E9FD37-AD8C-40AA-A42D-138065530F10",
                    "586616DC-3FEA-4DAF-A222-1E77A2CBD809",
                    "8F28E4C2-1953-473E-A1C5-C281957072D1",
                ],
                [
                    "BD570AA9-B70C-43CA-AD05-3B4C7DADC28C",
                    "AB6F75B3-ED60-45CA-BDFF-1BF8DD5F02C4",
                    "1CB1E9A7-576B-4065-8A9C-F7920AAF977D",
                    "8907BE41-91A7-4395-AF91-54D94C489A36",
                ],
            ],
        },
    },
    "Round Alter": {
        "summary": "Changes a round seating. JUDGE ONLY",
        "description": (
            "Rounds are numbered starting with 1. You can alter a finished round."
            "The provided seating must list players UID forming the tables. "
            "Each UID must match a VEKN member UID. "
        ),
        "value": {
            "type": "RoundAlter",
            "round": 1,
            "seating": [
                [
                    "238CD960-7E54-4A38-A676-8288A5700FC8",
                    "796CD3CE-BC2B-4505-B448-1C2D42E9F140",
                    "80E9FD37-AD8C-40AA-A42D-138065530F10",
                    "586616DC-3FEA-4DAF-A222-1E77A2CBD809",
                    "8F28E4C2-1953-473E-A1C5-C281957072D1",
                ],
                [
                    "BD570AA9-B70C-43CA-AD05-3B4C7DADC28C",
                    "AB6F75B3-ED60-45CA-BDFF-1BF8DD5F02C4",
                    "1CB1E9A7-576B-4065-8A9C-F7920AAF977D",
                    "8907BE41-91A7-4395-AF91-54D94C489A36",
                ],
            ],
        },
    },
    "Round Finish": {
        "summary": "Finish the current round. JUDGE ONLY",
        "description": (
            "Once a round is finished you cannot re-open it, but you can still modify "
            "it with RoundAlter, SetResult and Override events"
        ),
        "value": {"type": "RoundFinish"},
    },
    "Round Cancel": {
        "summary": "Cancel the current round. JUDGE ONLY",
        "description": (
            "A round can be canceled, if no result has been set yet. "
            "Beware this removes the current seating and cannot be undone."
            "Can be used to cancel a final's seeding, but will not reset the toss data."
        ),
        "value": {"type": "RoundCancel"},
    },
    "Set Result": {
        "summary": "Set a player's result",
        "description": (
            "Players can set their and their table result for the current round. "
            "Only VPs are provided, the GW and TP computations are done by the engine."
        ),
        "value": {
            "type": "SetResult",
            "player_uid": "238CD960-7E54-4A38-A676-8288A5700FC8",
            "round": 1,
            "vps": 2.5,
        },
    },
    "Set Deck": {
        "summary": "Set a player's deck",
        "description": (
            "Players can set their deck for the tournament, "
            "or the next round for multideck tournaments. "
            "The `deck` field can contain a plaintext deck list, or a deckbuilder URL "
            "(VDB, Amaranth, VTESDecks)"
        ),
        "value": {
            "type": "SetDeck",
            "player_uid": "238CD960-7E54-4A38-A676-8288A5700FC8",
            "deck": "https://vdb.im/decks/11808",
        },
    },
    "Drop": {
        "summary": "Drop a player from the tournament.",
        "description": (
            "A player can drop by themselves. "
            "A Judge can drop a player if they note they have juse left. "
            "To **disqualify** a player, use the Sanction event."
        ),
        "value": {"type": "Drop", "player_uid": "238CD960-7E54-4A38-A676-8288A5700FC8"},
    },
    "Sanction": {
        "summary": "Sanction (punish) a player. JUDGE ONLY",
        "description": (
            "The sanction levels are: `CAUTION`, `WARNING` and `DISQUALIFICATION`."
            "Cautions are just informative. "
            "Warnings are recorded (accessible to organizers, even in future events). "
            "Disqualifications are recorded and remove the player from the tournament. "
            "Sanction also have an optional category, one of: \n"
            "- ``\n"
            "- `DECK_PROBLEM`\n"
            "- `PROCEDURAL_ERRORS`\n"
            "- `CARD_DRAWING`\n"
            "- `MARKED_CARDS`\n"
            "- `SLOW_PLAY`\n"
            "- `UNSPORTSMANLIKE_CONDUCT`\n"
            "- `CHEATING`\n"
        ),
        "value": {
            "type": "Sanction",
            "level": "WARNING",
            "sanction_uid": "586616DC-3FEA-4DAF-A222-1E77A2CBD809",
            "player_uid": "238CD960-7E54-4A38-A676-8288A5700FC8",
            "comment": "Free comment",
            "category": "PROCEDURAL_ERRORS",
        },
    },
    "Unsanction": {
        "summary": "Remove all sanctions of given level for a player. JUDGE ONLY",
        "description": (
            "Judges have permission to send all events, simple players are limited. "
            "The player UID must match a VEKN member UID. "
            "The sanction UID must match an existing sanction UID for that player. "
        ),
        "value": {
            "type": "Unsanction",
            "sanction_uid": "586616DC-3FEA-4DAF-A222-1E77A2CBD809",
            "player_uid": "238CD960-7E54-4A38-A676-8288A5700FC8",
        },
    },
    "Override": {
        "summary": "Override a table score. JUDGE ONLY",
        "description": (
            "Judges can validated an odd table score. For example, if they disqualify "
            "a player but do not award VPs to their predator, the final table score "
            "will not appear valid until it's overriden.\n"
            "Rounds and tables are counted starting from 1."
        ),
        "value": {
            "type": "Override",
            "round": 1,
            "table": 1,
            "comment": "Free form comment",
        },
    },
    "Seed Finals": {
        "summary": "Seed the finals. JUDGE ONLY",
        "description": (
            "A finals is seeded first before players elect their seat in seed order."
        ),
        "value": {
            "type": "SeedFinals",
            "seeds": [
                "238CD960-7E54-4A38-A676-8288A5700FC8",
                "796CD3CE-BC2B-4505-B448-1C2D42E9F140",
                "80E9FD37-AD8C-40AA-A42D-138065530F10",
                "586616DC-3FEA-4DAF-A222-1E77A2CBD809",
                "8F28E4C2-1953-473E-A1C5-C281957072D1",
            ],
        },
    },
    "Seat Finals": {
        "summary": "Seat the finals. JUDGE ONLY",
        "description": ("Note what seating position finalists have elected"),
        "value": {
            "type": "SeatFinals",
            "seating": [
                "238CD960-7E54-4A38-A676-8288A5700FC8",
                "796CD3CE-BC2B-4505-B448-1C2D42E9F140",
                "80E9FD37-AD8C-40AA-A42D-138065530F10",
                "586616DC-3FEA-4DAF-A222-1E77A2CBD809",
                "8F28E4C2-1953-473E-A1C5-C281957072D1",
            ],
        },
    },
    "Finish": {
        "summary": "Finish the tournament. JUDGE ONLY",
        "description": (
            "This closes up the tournament. "
            "The winner, if finals results have been recorded, "
            "is automatically computed."
        ),
        "value": {
            "type": "Finish",
        },
    },
}
