import datetime
import enum
import uuid
import pydantic
import secrets
from pydantic import dataclasses

from . import events
from . import scoring


class TournamentFormat(enum.StrEnum):
    Standard = "Standard"
    Limited = "Limited"
    Draft = "Draft"


class TournamentRank(enum.StrEnum):
    BASIC = ""
    NC = "National Championship"
    CC = "Continental Championship"
    GP = "Grand Prix"


class TournamentState(enum.StrEnum):
    REGISTRATION = "Registration"
    WAITING = "Waiting"
    PLAYING = "Playing"
    FINALS = "Finals"
    FINISHED = "Finished"


class StandingsMode(enum.StrEnum):
    PRIVATE = "Private"  # Default
    CUTOFF = "Cutoff"  # Cutoff to make top 5
    TOP_10 = "Top 10"  # Top 10 players
    PUBLIC = "Public"  # All players


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


class RankingCategoy(enum.StrEnum):
    CONSTRUCTED_ONLINE = "Constructed Online"
    CONSTRUCTED_ONSITE = "Constructed Onsite"
    LIMITED_ONLINE = "Limited Online"
    LIMITED_ONSITE = "Limited Onsite"


class LeagueRanking(enum.StrEnum):
    RTP = "RTP"
    GP = "GP"
    Score = "Score"


class MemberRole(enum.StrEnum):
    ADMIN = "Admin"
    PRINCE = "Prince"
    RULEMONGER = "Rulemonger"  # Super-Judge
    JUDGE = "Judge"  # Judge (event judges don't need to be official judges)
    JUDGEKIN = "Judgekin"  # Judge in training
    NC = "NC"  # National Coordinator
    PTC = "PTC"  # Playtest Coordinator
    PLAYTESTER = "Playtester"
    ETHICS = "Ethics"  # Member of the Ethics Comitee


@dataclasses.dataclass
class PublicPerson:
    name: str
    vekn: str = ""
    uid: str = pydantic.Field(default_factory=lambda: str(uuid.uuid4()))
    country: str | None = ""  # country name
    country_flag: str | None = ""  # unicode flag char
    city: str | None = ""  # city name


@dataclasses.dataclass(kw_only=True)
class TournamentRef:
    name: str
    uid: str = pydantic.Field(default_factory=lambda: str(uuid.uuid4()))
    format: TournamentFormat
    online: bool = False
    start: datetime.datetime
    timezone: str = "UTC"
    rank: TournamentRank = TournamentRank.BASIC


@dataclasses.dataclass
class Sanction:
    judge: PublicPerson | None = None  # not set on endpoint, set before entering DB
    uid: str = pydantic.Field(default_factory=lambda: str(uuid.uuid4()))
    level: events.SanctionLevel = events.SanctionLevel.CAUTION
    category: events.SanctionCategory = events.SanctionCategory.NONE
    comment: str = ""


@dataclasses.dataclass(kw_only=True)
class RegisteredSanction(Sanction):
    tournament: TournamentRef | None = None


@dataclasses.dataclass
class Person(PublicPerson):
    nickname: str | None = None  # player nickname (on social, lackey, etc.)
    roles: list[MemberRole] = pydantic.Field(default_factory=list)
    sponsor: str | None = ""  # useful for organizers, to find their recruits
    sanctions: list[RegisteredSanction] = pydantic.Field(default_factory=list)
    ranking: dict[RankingCategoy, int] = pydantic.Field(default_factory=dict)

    @pydantic.field_validator("ranking", mode="before")
    @classmethod
    def convert_migration_2025_04(cls, v):
        # TODO: drop after migration
        if "constructed_online" in v:
            v[RankingCategoy.CONSTRUCTED_ONLINE.value] = v["constructed_online"]
            del v["constructed_online"]
        if "constructed_onsite" in v:
            v[RankingCategoy.CONSTRUCTED_ONSITE.value] = v["constructed_onsite"]
            del v["constructed_onsite"]
        if "limited_online" in v:
            v[RankingCategoy.LIMITED_ONLINE.value] = v["limited_online"]
            del v["limited_online"]
        if "limited_onsite" in v:
            v[RankingCategoy.LIMITED_ONSITE.value] = v["limited_onsite"]
            del v["limited_onsite"]
        return v

    @pydantic.field_validator("roles", mode="before")
    @classmethod
    def convert_migration_2025_04_27(cls, v):
        # TODO: drop after migration
        roles = set(v)
        if roles & {"Anc. Judge", "Neo. Judge"}:
            roles.add(MemberRole.JUDGEKIN)
        roles.discard("Anc. Judge")
        roles.discard("Neo. Judge")
        return list(roles)


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
    crypt: KrcgCrypt
    library: KrcgLibrary
    id: str = pydantic.Field(default_factory=lambda: str(uuid.uuid4()))
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
class PlayerInfo(PublicPerson):
    state: PlayerState = PlayerState.REGISTERED
    rounds_played: int = 0
    table: int = 0  # non-zero when playing
    seat: int = 0  # non-zero when playing
    result: scoring.Score = pydantic.Field(default_factory=scoring.Score)
    seed: int = 0  # Finals seed
    toss: int = 0  # non-zero when draws for seeding finals


@dataclasses.dataclass
class LeaguePlayer(PublicPerson):
    tournaments: list[str] = pydantic.Field(default_factory=list)
    score: scoring.Score = pydantic.Field(default_factory=scoring.Score)
    points: int = 0


@dataclasses.dataclass
class Player(Person):
    state: PlayerState = PlayerState.REGISTERED
    rounds_played: int = 0
    table: int = 0  # non-zero when playing
    seat: int = 0  # non-zero when playing
    result: scoring.Score = pydantic.Field(default_factory=scoring.Score)
    seed: int = 0  # Finals seed
    barriers: list[Barrier] = pydantic.Field(default_factory=list)
    toss: int = 0  # non-zero when draws for seeding finals
    deck: KrcgDeck | None = None  # card ID: card count, default deck (monodeck)

    def __hash__(self):
        return hash(self.vekn)


@dataclasses.dataclass
class SeatInfo:
    player_uid: str
    result: scoring.Score = pydantic.Field(default_factory=scoring.Score)


@dataclasses.dataclass
class TableSeat(SeatInfo):
    deck: KrcgDeck | None = None  # card ID: card count
    judge: PublicPerson | None = None  # Players cannot modify results set by a judge


@dataclasses.dataclass
class ScoreOverride:
    judge: Person
    comment: str = ""


@dataclasses.dataclass
class TableInfo:
    seating: list[SeatInfo]


@dataclasses.dataclass
class Table(TableInfo):
    seating: list[TableSeat]
    state: TableState = TableState.IN_PROGRESS
    override: ScoreOverride | None = None


@dataclasses.dataclass
class RoundInfo:
    tables: list[TableInfo]


@dataclasses.dataclass
class Round:
    tables: list[Table]


@dataclasses.dataclass
class LimitedFormat:
    mono_vampire: bool = False
    mono_clan: bool = False
    storyline: str = ""
    include: list[int] = pydantic.Field(default_factory=list)
    exclude: list[int] = pydantic.Field(default_factory=list)


@dataclasses.dataclass
class LeagueRef:
    name: str
    uid: str = pydantic.Field(default_factory=lambda: str(uuid.uuid4()))


@dataclasses.dataclass(kw_only=True)
class League(LeagueRef):
    start: datetime.datetime
    timezone: str
    format: TournamentFormat
    ranking: LeagueRanking
    finish: datetime.datetime | None = None
    description: str = ""
    online: bool = False
    country: str | None = None
    country_flag: str | None = None
    organizers: list[PublicPerson] = pydantic.Field(default_factory=list)


@dataclasses.dataclass(kw_only=True)
class TournamentMinimal(TournamentRef):
    finish: datetime.datetime | None = None
    country: str | None = None
    country_flag: str | None = None
    league: LeagueRef | None = None
    state: TournamentState = TournamentState.REGISTRATION


@dataclasses.dataclass(kw_only=True)
class TournamentConfig(TournamentMinimal):
    judges: list[PublicPerson] = pydantic.Field(default_factory=list)
    venue: str = ""
    venue_url: str = ""
    address: str = ""
    map_url: str = ""
    proxies: bool = False
    multideck: bool = False
    decklist_required: bool = True
    description: str = ""
    standings_mode: StandingsMode = StandingsMode.PRIVATE
    max_rounds: int = 0
    limited: LimitedFormat | None = None


@dataclasses.dataclass(kw_only=True)
class Tournament(TournamentConfig):
    # active tournament console
    # # For now, rounds[-1] is always current.
    # # This might come back to bite us for staggered tournament,
    # # but let's try to avoid it.
    # current_round: int = 0
    checkin_code: str = pydantic.Field(
        default_factory=lambda: secrets.token_urlsafe(16)
    )
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
class TournamentInfo(TournamentConfig):
    players: dict[str, PlayerInfo] = pydantic.Field(default_factory=dict)
    finals_seeds: list[str] = pydantic.Field(default_factory=list)
    rounds: list[RoundInfo] = pydantic.Field(default_factory=list)
    winner: str = ""


# note: cannot use dataclass as query param
class TournamentFilter(pydantic.BaseModel):
    date: str = ""
    uid: str = ""
    country: str = ""
    online: bool = True
    states: list[TournamentState] = pydantic.Field(default_factory=list)


@dataclasses.dataclass
class VenueCompletion:
    venue: str
    venue_url: str | None
    address: str | None
    map_url: str | None


@dataclasses.dataclass
class LeagueWithTournaments(League):
    tournaments: list[TournamentInfo] = pydantic.Field(default_factory=list)
    rankings: list[tuple[int, LeaguePlayer]] = pydantic.Field(default_factory=list)


# note: cannot use dataclass as query param
class LeagueFilter(pydantic.BaseModel):
    date: str = ""
    uid: str = ""
    country: str = ""
    online: bool = True


@dataclasses.dataclass
class DeckInfo:
    deck: KrcgDeck
    score: scoring.Score
    winner: bool = False


@dataclasses.dataclass
class TournamentDeckInfo(TournamentConfig):
    decks: list[DeckInfo] = pydantic.Field(default_factory=list)


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


@dataclasses.dataclass
class TournamentRating:
    tournament: TournamentRef
    size: int = 0
    rounds_played: int = 0
    result: scoring.Score = pydantic.Field(default_factory=scoring.Score)
    rank: int = 0
    rating_points: int = 0
    gp_points: int = 0


@dataclasses.dataclass
class MemberInfo:
    name: str | None = None
    country: str | None = None  # country name
    city: str | None = None  # city name
    nickname: str | None = None  # player nickname (on social, lackey, etc.)
    email: str | None = None  # the user's email
    whatsapp: str | None = None  # phone


@dataclasses.dataclass
class PersonWithRatings(Person):
    ratings: dict[str, TournamentRating] = pydantic.Field(default_factory=dict)


@dataclasses.dataclass
class Member(PersonWithRatings):
    email: str | None = None  # the user's email
    verified: bool | None = None  # whether the email has been verified
    discord: DiscordUser | None = None  # Discord data
    password_hash: str = ""
    whatsapp: str | None = None  # phone
    prefix: str | None = None  # temporary, to compute sponsors when syncing vekn


@dataclasses.dataclass
class Client:
    name: str
    uid: str | None = None  # UUID assigned by the backend


@dataclasses.dataclass
class Country:
    iso: str  # ISO-3166 alpha-2 country code
    iso3: str  # ISO-3166 alpha-3 country code
    iso_numeric: int  # ISO-3166 numeric country code
    fips: str  # FIPS 2 - letters code
    country: str  # Country name
    flag: str  # Country flag (unicode char)
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
    unique_name: str  # A name unique in the country (w/ admin divisions when needed)
    name: str  # name of geographical point (utf8) varchar(200)
    ascii_name: str  # name of geographical point in plain ascii characters
    latitude: float  # latitude in decimal degrees (wgs84)
    longitude: float  # longitude in decimal degrees (wgs84)
    feature_class: str  # see http://www.geonames.org/export/codes.html
    feature_code: str  # see http://www.geonames.org/export/codes.html
    country_code: str  # ISO-3166 2-letter country code, 2 characters
    country_name: str  # Country name (matches country.country)
    country_flag: str  # Country flag (unicode char)
    cc2: list[str]  # alternate country codes, ISO-3166 2-letter country codes
    admin1: str  # name of first administrative division (state/region)
    admin2: str  # name of second administrative division (county)
    timezone: str  # iana timezone id
    modification_date: str  # date of last modification in ISO format


@dataclasses.dataclass
class RoleParameter:
    role: MemberRole


@dataclasses.dataclass
class VeknParameter:
    vekn: str


@dataclasses.dataclass
class PasswordParameter:
    password: str
