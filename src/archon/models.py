import datetime
import enum
import uuid
import pydantic
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


class Barrier(enum.StrEnum):
    MISSING_DECK = "Missing Deck"
    BANNED = "Banned"
    DISQUALIFIED = "Disqualified"
    MAX_ROUNDS = "Max Rounds"


@dataclasses.dataclass
class Player:
    name: str
    uid: str = pydantic.Field(default_factory=uuid.uuid4)
    state: PlayerState = PlayerState.REGISTERED
    barriers: list[Barrier] = pydantic.Field(default_factory=list)
    rounds_played: int = 0
    table: int = 0  # non-zero when playing
    seat: int = 0  # non-zero when playing
    toss: int = 0  # non-zero when draws for seeding finals
    seed: int = 0  # Finals seed
    result: scoring.Score = pydantic.Field(default_factory=scoring.Score)

    def __hash__(self):
        return hash(self.vekn)


@dataclasses.dataclass
class TableSeat:
    player_uid: str
    result: scoring.Score


@dataclasses.dataclass
class ScoreOverride:
    judge_uid: str
    comment: str = ""


@dataclasses.dataclass
class Table:
    seating: list[TableSeat]
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
    level: events.SanctionLevel
    comment: str


@dataclasses.dataclass
class Tournament:
    name: str
    organizer: str  # Member.uid
    format: TournamentFormat
    start: datetime.datetime
    uid: str | None = None
    rank: TournamentRank | None = None
    country: str | None = None
    city: str | None = None
    venue: str = ""
    venue_url: str = ""
    address: str = ""
    map_url: str = ""
    online: bool = False
    proxies: bool = False
    multideck: bool = False
    finish: datetime.datetime | None = None
    description: str = ""
    judges: list[str]  # list of Member.uid, first one is head judge
    max_rounds: int = 0
    # active tournament console
    current_round: int = 0
    limited: LimitedFormat
    state: TournamentState = TournamentState.REGISTRATION
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
class DiscordAuth:
    access_token: str
    token_type: str  # "Bearer"
    expires_in: int  # seconds
    refresh_token: str
    scope: str  # "identify email"


@dataclasses.dataclass
class DiscordUser:
    id: str  # the user's id (Discord snowflake)
    username: str  # the user's username, not unique across the platform
    auth: DiscordAuth  # the user's tokens
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


@dataclasses.dataclass
class Member:
    vekn: str  # VEKN number
    name: str  # player name (first name last name concatenation)
    nickname: str | None = None  # player nickname (on social, lackey, etc.)
    email: str | None = None  # the user's email
    verified: bool | None = None  # whether the email has been verified
    country: str | None = None  # country name
    state: str | None = None  # state/region name
    city: str | None = None  # city name
    uid: str | None = None  # UUID assigned by the backend
    discord: DiscordUser | None = None  # Discord data
