import * as events from "./events"

export enum TournamentState {
    REGISTRATION = "Registration",
    WAITING = "Waiting",
    PLAYING = "Playing",
    FINALS = "Finals",
    FINISHED = "Finished",
}

export enum PlayerState {
    REGISTERED = "Registered",
    CHECKED_IN = "Checked-in",
    PLAYING = "Playing",
    FINISHED = "Finished",
}

export enum TableState {
    FINISHED = "Finished",
    IN_PROGRESS = "In Progress",
    INVALID = "Invalid",
}

export enum Barrier {
    MISSING_DECK = "Missing Deck",
    BANNED = "Banned",
    DISQUALIFIED = "Disqualified",
    MAX_ROUNDS = "Max Rounds",
}

export enum AlertLevel {
    INFO = "Info",
    WARNING = "Warning",
}

export interface Score {
    gw: number,
    vp: number,
    tp: number,
}

export interface Person {
    name: string,
    vekn: string,
    uid: string,
    country: string | undefined,  // country name
    city: string | undefined,  // city name
}

export interface Player extends Person {
    state: PlayerState,
    barriers: Barrier[],
    rounds_played: number,
    table: number,  // non-zero when playing
    seat: number,  // non-zero when playing
    toss: number,  // non-zero when draws for seeding finals
    seed: number,  // Finals seed
    result: Score,
}

export interface TableSeat {
    player_uid: string,
    result: Score,
}

export interface ScoreOverride {
    judge_uid: string,
    comment: string,
}

export interface Table {
    seating: TableSeat[],
    state: TableState,
    override: ScoreOverride | undefined,
}

export interface Round {
    tables: Table[]
}

export enum TournamentFormat {
    Standard = "Standard",
    Limited = "Limited",
    Draft = "Draft",
}

export enum TournamentRank {
    BASIC = "",
    NC = "National Championship",
    CC = "Continental Championship",
    GP = "Grand Prix",
}

export interface LimitedFormat {
    mono_vampire: boolean,
    mono_clan: boolean,
    storyline: string,
    include: number[],
    exclude: number[],
}

export interface Sanction {
    uid: string,
    judge_uid: string,
    player_uid: string,
    level: events.SanctionLevel
    category: events.SanctionCategory
    comment: string
}

export interface TournamentConfig {
    name: string,
    format: TournamentFormat,
    start: string,
    timezone: string,
    uid: string | undefined,
    rank: TournamentRank | undefined,
    country?: string | undefined,
    city?: string | undefined,
    venue?: string,
    venue_url?: string,
    address?: string,
    map_url?: string,
    online?: boolean,
    proxies?: boolean,
    multideck?: boolean,
    finish?: string,
    description?: string,
    judges?: string[],
}

export interface Tournament extends TournamentConfig {
    // active tournament console
    // current_round: number,
    limited: LimitedFormat | undefined,
    state: TournamentState,
    players: Record<string, Player>,
    finals_seeds: string[],
    rounds: Round[],
    sanctions: Record<string, Sanction[]>,
    winner: string,
    extra: {},
}

export interface RegisteredSanction extends Sanction {
    tournament_uid: string,
    tournament_name: string
    tournament_start: string,
    tournament_timezone: string,
}

export interface Member extends Person {
    nickname: string | undefined,  // player nickname
    email: string | undefined,  // the user's email
    verified: boolean | undefined,  // whether the email has been verified
    state: string | undefined,  // state/region name
    sanctions: RegisteredSanction[] | undefined,  // previous sanctions delivered
    discord: {} | undefined,
}

export interface Country {
    iso: string,  // ISO-3166 alpha-2 country code
    iso3: string,  // ISO-3166 alpha-3 country code
    iso_numeric: number,  // ISO-3166 numeric country code
    fips: string,  // FIPS 2 - letters code
    country: string,  // Country name
    capital: string,  // Capital name
    continent: string,  // Continent 2 - letters code(cf.top - level comment)
    tld: string,  // Internet Top - Level Domain, including the dot
    currency_code: string,  // ISO 4217 alpha - 3 currency code
    currency_name: string,  // Currency name
    phone: string,  // Phone prefix
    postal_code_regex: string,  // Perl / Python regular expression
    languages: string[],  // list of IETF language tags
    geoname_id: number,  // integer id of record in geonames database
}

export interface City {
    geoname_id: number,  // integer id of record in geonames database
    name: string,  // name of geographical point (utf8) varchar(200)
    ascii_name: string,  // name of geographical point in plain ascii characters
    latitude: number,  // latitude in decimal degrees (wgs84)
    longitude: number,  // longitude in decimal degrees (wgs84)
    feature_class: string,  // see http://www.geonames.org/export/codes.html
    feature_code: string,  // see http://www.geonames.org/export/codes.html
    country_code: string,  // ISO-3166 2-letter country code, 2 characters
    country_name: string,  // country name, matches country.country
    cc2: string[],  // alternate country codes, ISO-3166 2-letter country codes
    admin1: string,  // name of first administrative division (state/region)
    admin2: string,  // name of second administrative division (county)
    timezone: string,  // iana timezone id
    modification_date: string,  // date of last modification in ISO format
}
