import datetime
import enum
import uuid
import pydantic
import secrets
from pydantic import dataclasses

from . import events
from . import scoring


class TournamentState(enum.StrEnum):
    REGISTRATION = "Registration"
    WAITING = "Waiting"
    PLAYING = "Playing"
    FINALS = "Finals"
    FINISHED = "Finished"


class PlayerState(enum.StrEnum):
    REGISTERED = "Registered"
    CHECKED_IN = "Checked-in"
    PLAYING = "Playing"
    FINISHED = "Finished"


class TableState(enum.StrEnum):
    FINISHED = "Finished"
    IN_PROGRESS = "In Progress"
    INVALID = "Invalid"


class Barrier(enum.StrEnum):
    MISSING_DECK = "Missing Deck"
    BANNED = "Banned"
    DISQUALIFIED = "Disqualified"
    MAX_ROUNDS = "Max Rounds"


@dataclasses.dataclass
class Person:
    name: str
    vekn: str = ""
    uid: str = pydantic.Field(default_factory=uuid.uuid4)
    country: str | None = ""  # country name
    city: str | None = ""  # city name


@dataclasses.dataclass
class KrcgCard:
    id: int
    name: str
    count: int
    comments: str = ""


@dataclasses.dataclass
class KrcgCardsGroup:
    type: str
    count: int
    cards: list[KrcgCard] = pydantic.Field(default_factory=list)


@dataclasses.dataclass
class KrcgCrypt:
    count: int
    cards: list[KrcgCard] = pydantic.Field(default_factory=list)


@dataclasses.dataclass
class KrcgLibrary:
    count: int
    cards: list[KrcgCardsGroup] = pydantic.Field(default_factory=list)


@dataclasses.dataclass
class KrcgDeck:
    id: str
    crypt: KrcgCrypt
    library: KrcgLibrary
    vdb_link: str = ""
    event: str = ""
    event_link: str = ""
    place: str = ""
    date: datetime.date | None = None
    tournament_format: str = ""
    players_count: int = 0
    player: str = ""
    score: str = ""
    name: str = ""
    author: str = ""
    comments: str = ""


@dataclasses.dataclass
class Player(Person):
    state: PlayerState = PlayerState.REGISTERED
    barriers: list[Barrier] = pydantic.Field(default_factory=list)
    rounds_played: int = 0
    table: int = 0  # non-zero when playing
    seat: int = 0  # non-zero when playing
    toss: int = 0  # non-zero when draws for seeding finals
    seed: int = 0  # Finals seed
    result: scoring.Score = pydantic.Field(default_factory=scoring.Score)
    deck: KrcgDeck | None = None  # card ID: card count, default deck (monodeck)

    def __hash__(self):
        return hash(self.vekn)


@dataclasses.dataclass
class TableSeat:
    player_uid: str
    deck: KrcgDeck | None = None  # card ID: card count
    result: scoring.Score = pydantic.Field(default_factory=scoring.Score)
    judge_uid: str = ""  # Result set by a judge cannot be modified by a player


@dataclasses.dataclass
class ScoreOverride:
    judge_uid: str
    comment: str = ""


@dataclasses.dataclass
class Table:
    seating: list[TableSeat]
    state: TableState = TableState.IN_PROGRESS
    override: ScoreOverride | None = None


@dataclasses.dataclass
class Round:
    tables: list[Table]


class TournamentFormat(enum.StrEnum):
    Standard = "Standard"
    Limited = "Limited"
    Draft = "Draft"


class TournamentRank(enum.StrEnum):
    BASIC = ""
    NC = "National Championship"
    CC = "Continental Championship"
    GP = "Grand Prix"


@dataclasses.dataclass
class LimitedFormat:
    mono_vampire: bool = False
    mono_clan: bool = False
    storyline: str = ""
    include: list[int] = pydantic.Field(default_factory=list)
    exclude: list[int] = pydantic.Field(default_factory=list)


@dataclasses.dataclass
class Sanction:
    judge_uid: str
    player_uid: str
    uid: str = pydantic.Field(default_factory=lambda: str(uuid.uuid4()))
    level: events.SanctionLevel = events.SanctionLevel.CAUTION
    category: events.SanctionCategory = events.SanctionCategory.NONE
    comment: str = ""


@dataclasses.dataclass
class TournamentConfig:
    name: str
    format: TournamentFormat
    start: datetime.datetime
    timezone: str = "UTC"
    uid: str = pydantic.Field(default_factory=lambda: str(uuid.uuid4()))
    judges: list[str] = pydantic.Field(default_factory=list)
    rank: TournamentRank = TournamentRank.BASIC
    country: str | None = None
    venue: str = ""
    venue_url: str = ""
    address: str = ""
    map_url: str = ""
    online: bool = False
    proxies: bool = False
    multideck: bool = False
    decklist_required: bool = True
    finish: datetime.datetime | None = None
    description: str = ""
    max_rounds: int = 0


@dataclasses.dataclass
class Tournament(TournamentConfig):
    # active tournament console
    # # For now, rounds[-1] is always current.
    # # This might come back to bite us for staggered tournament,
    # # but let's try to avoid it.
    # current_round: int = 0
    limited: LimitedFormat | None = None
    checkin_code: str = pydantic.Field(
        default_factory=lambda: secrets.token_urlsafe(16)
    )
    state: TournamentState = TournamentState.REGISTRATION
    # note the doc is not great for this kind of dict, keys show as "additionalProp".
    # Might be improved in a future version of redoc
    # https://github.com/swagger-api/swagger-ui/pull/9739
    players: dict[str, Player] = pydantic.Field(default_factory=dict)
    finals_seeds: list[str] = pydantic.Field(default_factory=list)
    rounds: list[Round] = pydantic.Field(default_factory=list)
    sanctions: dict[str, list[Sanction]] = pydantic.Field(default_factory=dict)
    winner: str = ""
    extra: dict = pydantic.Field(default_factory=dict)  # third-party data if any


@dataclasses.dataclass
class Country:
    iso: str  # ISO-3166 alpha-2 country code
    iso3: str  # ISO-3166 alpha-3 country code
    iso_numeric: int  # ISO-3166 numeric country code
    fips: str  # FIPS 2 - letters code
    country: str  # Country name
    capital: str  # Capital name
    continent: str  # Continent 2 - letters code(cf.top - level comment)
    tld: str  # Internet Top - Level Domain, including the dot
    currency_code: str  # ISO 4217 alpha - 3 currency code
    currency_name: str  # Currency name
    phone: str  # Phone prefix
    postal_code_regex: str  # Perl / Python regular expression
    languages: list[str]  # list of IETF language tags
    geoname_id: int  # integer id of record in geonames database


@dataclasses.dataclass
class City:
    geoname_id: int  # integer id of record in geonames database
    name: str  # name of geographical point (utf8) varchar(200)
    ascii_name: str  # name of geographical point in plain ascii characters
    latitude: float  # latitude in decimal degrees (wgs84)
    longitude: float  # longitude in decimal degrees (wgs84)
    feature_class: str  # see http://www.geonames.org/export/codes.html
    feature_code: str  # see http://www.geonames.org/export/codes.html
    country_code: str  # ISO-3166 2-letter country code, 2 characters
    country_name: str  # Country name (matches country.country)
    cc2: list[str]  # alternate country codes, ISO-3166 2-letter country codes
    admin1: str  # name of first administrative division (state/region)
    admin2: str  # name of second administrative division (county)
    timezone: str  # iana timezone id
    modification_date: str  # date of last modification in ISO format


@dataclasses.dataclass
class DiscordUser:
    id: str  # the user's id (Discord snowflake)
    username: str  # the user's username, not unique across the platform
    discriminator: str  # the user's Discord-tag
    global_name: str | None  # the user's display name, if it is set.
    email: str | None  # the user's email
    verified: bool | None  # whether the email has been verified
    mfa_enabled: bool | None  # whether the user has two factor enabled
    locale: str | None  # the user's chosen language option
    # we ignore the rest:
    # avatar: str | None  # the user's avatar hash
    # bot: bool | None  # whether the user belongs to an OAuth2 application
    # system: bool | None  # whether the user is an Official Discord System user
    # banner: str | None  # the user's banner hash
    # accent_color: int | None  # the user's banner color
    # flags: int | None  # the flags on a user's account
    # premium_type: int | None  # the type of Nitro subscription on a user's account
    # public_flags: int | None  # the public flags on a user's account
    # avatar_decoration_data: dict | None  # data for the user's avatar decoration


@dataclasses.dataclass(kw_only=True)
class RegisteredSanction(Sanction):
    tournament_uid: str
    tournament_name: str
    tournament_start: datetime.datetime
    tournament_timezone: str


@dataclasses.dataclass
class Member(Person):
    nickname: str | None = None  # player nickname (on social, lackey, etc.)
    email: str | None = None  # the user's email
    verified: bool | None = None  # whether the email has been verified
    state: str | None = None  # state/region name
    discord: DiscordUser | None = None  # Discord data
    sanctions: list[RegisteredSanction] = pydantic.Field(default_factory=list)


@dataclasses.dataclass
class Client:
    name: str
    uid: str | None = None  # UUID assigned by the backend
