import datetime
import enum
from pydantic import dataclasses


class TournamentState(enum.StrEnum):
    Registration = "Registration"
    Waiting = "Waiting"
    Playing = "Playing"
    Finals = "Finals"
    Finished = "Finished"


@dataclasses.dataclass(order=True, eq=True)
class Score:
    gw: int = 0
    vp: float = 0.0
    tp: int = 0

    def __str__(self):
        if self.gw:
            return f"({self.gw}GW{self.vp:.2g}, {self.tp}TP)"
        else:
            return f"({self.vp:.2g}VP, {self.tp}TP)"

    def __add__(self, rhs):
        return self.__class__(
            gw=self.gw + rhs.gw, vp=self.vp + rhs.vp, tp=self.tp + rhs.tp
        )

    def __iadd__(self, rhs):
        self.gw += rhs.gw
        self.vp += rhs.vp
        self.tp += rhs.tp
        return self


@dataclasses.dataclass
class Player:
    name: str
    vekn: str
    uid: str = ""

    def __hash__(self):
        return hash(self.vekn)


@dataclasses.dataclass
class TableSeat:
    player_vekn: str
    result: Score


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
class Tournament:
    name: str
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
