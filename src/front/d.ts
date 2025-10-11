import * as events from "./events"

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

export enum TournamentState {
    REGISTRATION = "Registration",
    WAITING = "Waiting",
    PLAYING = "Playing",
    FINALS = "Finals",
    FINISHED = "Finished",
}

export enum StandingsMode {
    PRIVATE = "Private",
    CUTOFF = "Cutoff",
    TOP_10 = "Top 10",
    PUBLIC = "Public",
}

export enum DeckListsMode {
    WINNER = "Winner",  // Default
    FINALISTS = "Finalists",
    ALL = "All",
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

export enum RankingCategoy {
    CONSTRUCTED_ONLINE = "Constructed Online",
    CONSTRUCTED_ONSITE = "Constructed Onsite",
    LIMITED_ONLINE = "Limited Online",
    LIMITED_ONSITE = "Limited Onsite",
}

export enum LeagueRanking {
    RTP = "RTP",
    GP = "GP",
    Score = "Score",
}

export enum LeagueKind {
    LEAGUE = "League",
    META = "Meta-League",
}

export enum MemberRole {
    ADMIN = "Admin",
    PRINCE = "Prince",
    RULEMONGER = "Rulemonger",  // Judge Coordinator
    JUDGE = "Judge",
    JUDGEKIN = "Judgekin",  // Judge in training
    NC = "NC",  // National Coordinator
    PTC = "PTC",  // Playtest Coordinator
    PLAYTESTER = "Playtester",
    ETHICS = "Ethics",  // Member of the Ethics committee
}

// ---------------------------------- frontend enums
export enum MemberFilter {
    MY_RECRUITS = "My Recruits",
    NO_SPONSOR = "No Sponsor",
    NO_VEKN = "No VEKN",
}

export enum AlertLevel {
    INFO = "Info",
    SUCCESS = "Success",
    WARNING = "Warning",
    DANGER = "Danger",
}
// ---------------------------------- end frontend enums

export interface Score {
    gw: number,
    vp: number,
    tp: number,
}

export interface PublicPerson {
    name: string,
    vekn?: string,
    uid: string,
    country?: string | null,  // country name
    country_flag?: string | null,  // unicode flag char
    city?: string | null,  // city name
    roles?: MemberRole[],
}

export interface TournamentRef {
    name: string,
    uid?: string,
    format: TournamentFormat,
    online?: boolean,
    start: string,
    timezone: string,
    rank?: TournamentRank,
}

export interface Sanction {
    uid?: string,
    judge?: Person,
    level?: events.SanctionLevel,
    category?: events.SanctionCategory,
    comment?: string,
}

export interface RegisteredSanction extends Sanction {
    tournament?: TournamentRef | null,
}

export interface Person extends PublicPerson {
    nickname?: string | null,  // player nickname
    sponsor?: string | null,
    sanctions?: RegisteredSanction[],
    ranking?: Record<RankingCategoy, number>,
}

export interface PersonsUpdate {
    update: Person[],
    delete: string[],
}

export interface KrcgCard {
    id: number,
    name: string,
    count: number,
    comments: string,
}

export interface KrcgCardsGroup {
    type: string,
    count: number,
    cards: KrcgCard[],
}

export interface KrcgCrypt {
    count: number,
    cards: KrcgCard[],
}

export interface KrcgLibrary {
    count: number,
    cards: KrcgCardsGroup[],
}

export interface KrcgDeck {
    id?: string,
    crypt: KrcgCrypt,
    library: KrcgLibrary,
    vdb_link?: string,
    name?: string,
    author?: string,
    comments?: string,
}

export interface PlayerInfo extends PublicPerson {
    state?: PlayerState,
    rounds_played?: number,
    table?: number,
    seat?: number,
    result?: Score,
    seed?: number,
    toss?: number,
    rating_points?: number,
}

export interface LeaguePlayer extends PublicPerson {
    tournaments?: string[],
    score?: Score,
    points?: number,
}

export interface Player extends Person {
    state: PlayerState,
    barriers?: Barrier[],
    rounds_played?: number,
    table?: number,  // non-zero when playing
    seat?: number,  // non-zero when playing
    toss?: number,  // non-zero when draws for seeding finals
    seed?: number,  // Finals seed
    result?: Score,
    deck?: KrcgDeck | null,
    rating_points?: number,
}

export interface SeatInfo {
    player_uid: string,
    result: Score,
}

export interface TableSeat extends SeatInfo {
    deck?: KrcgDeck | null,
    judge_uid?: string
}

export interface ScoreOverride {
    judge: Person,
    comment?: string,
}

export interface TableInfo {
    seating: SeatInfo[],
}

export interface Table {
    seating: TableSeat[],
    state: TableState,
    override?: ScoreOverride | null,
}

export interface RoundInfo {
    tables: TableInfo[]
}

export interface Round {
    tables: Table[]
}

export interface LimitedFormat {
    mono_vampire?: boolean,
    mono_clan?: boolean,
    storyline?: string,
    include?: number[],
    exclude?: number[],
}

export interface LeagueRef {
    name: string,
    uid: string,
}

export interface LeagueMinimal extends LeagueRef {
    start: string,
    finish?: string | null,
    timezone: string,
    online?: boolean,
    country?: string | null,
    country_flag?: string | null,
    format: TournamentFormat,
    ranking: LeagueRanking,
    kind: LeagueKind,
    organizers?: PublicPerson[],
    parent?: LeagueRef | null,
}

export interface League extends LeagueMinimal {
    description?: string,
}

export interface TournamentMinimal extends TournamentRef {
    finish?: string | null,
    country?: string | null,
    country_flag?: string | null,
    league?: LeagueRef | null,
    state?: TournamentState,
}

export interface TournamentConfig extends TournamentMinimal {
    venue?: string,
    venue_url?: string,
    address?: string,
    map_url?: string,
    proxies?: boolean,
    multideck?: boolean,
    decklist_required?: boolean,
    description?: string,
    judges?: Person[],
    standings_mode?: StandingsMode,
    decklists_mode?: DeckListsMode,
    max_rounds?: number,
    limited?: LimitedFormat | null,
}

export interface Tournament extends TournamentConfig {
    // active tournament console
    // current_round: number,
    checkin_code?: boolean,
    players: Record<string, Player>,
    finals_seeds: string[],
    rounds: Round[],
    sanctions: Record<string, Sanction[]>,
    winner?: string,
    extra?: any,
}

export interface TournamentInfo extends TournamentConfig {
    players?: Record<string, PlayerInfo>,
    finals_seeds?: string[],
    rounds?: RoundInfo[],
    winner?: string,
}

export interface TournamentFilter {
    date?: string,
    uid?: string,
    country?: string,
    online?: boolean,
    states?: TournamentState[],
    member_uid?: string,
    year?: number,
    name?: string,
}

export interface VenueCompletion {
    venue: string,
    venue_url: string | null,
    address: string | null,
    map_url: string | null,
}

export interface LeagueWithTournaments extends League {
    leagues?: LeagueMinimal[]
    tournaments?: TournamentInfo[]
    rankings?: [number, LeaguePlayer][]
}

export interface LeagueFilter {
    date?: string,
    uid?: string,
    country?: string,
    online?: boolean,
}

export interface DeckInfo {
    deck: KrcgDeck,
    score: Score,
    winner?: boolean,
    finalist?: boolean,
}

export interface TournamentDeckInfo extends TournamentConfig {
    decks?: DeckInfo[]
}

export interface DiscordUser {
    id: string,  // the user's id (Discord snowflake)
    username: string,  // the user's username, not unique across the platform
    discriminator: string,  // the user's Discord-tag
    global_name: string | null,  // the user's display name, if it is set
    // other fields should not be used
}

export interface TournamentRating {
    tournament: TournamentRef,
    size?: number
    rounds_played?: number,
    result?: Score,
    rank?: number,
    rating_points?: number,
}

export interface MemberInfo {
    name?: string | null,
    country?: string | null,  // country name
    city?: string | null,  // city name
    nickname?: string | null,  // player nickname (on social, lackey, etc.)
    email?: string | null,  // the user's email
    whatsapp?: string | null,  // phone
}

export interface PersonWithRatings extends Person {
    ratings?: Record<string, TournamentRating>
}

export interface Member extends PersonWithRatings {
    email?: string | null,  // the user's email
    verified?: boolean | null,  // whether the email has been verified
    discord?: DiscordUser | null,
    whatsapp?: string | null,
    authorized_clients?: Record<string, { authorized_at: string }>,  // client_uid -> {authorized_at: timestamp}
    // prefix: string | undefined // Do not use - temporary field will be removed
}

export interface Client {
    name: string,
    uid?: string | null,  // UUID assigned by the backend
}

export interface Country {
    iso: string,  // ISO-3166 alpha-2 country code
    iso3: string,  // ISO-3166 alpha-3 country code
    iso_numeric: number,  // ISO-3166 numeric country code
    fips: string,  // FIPS 2 - letters code
    country: string,  // Country name
    flag: string,  // Country flag (unicode char)
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
    unique_name: string,  // unique name in the country (w/ admin zone suffix)
    ascii_name: string,  // name of geographical point in plain ascii characters
    latitude: number,  // latitude in decimal degrees (wgs84)
    longitude: number,  // longitude in decimal degrees (wgs84)
    feature_class: string,  // see http://www.geonames.org/export/codes.html
    feature_code: string,  // see http://www.geonames.org/export/codes.html
    country_code: string,  // ISO-3166 2-letter country code, 2 characters
    country_name: string,  // country name, matches country.country
    country_flag: string,  // country flag, unicode char
    cc2: string[],  // alternate country codes, ISO-3166 2-letter country codes
    admin1: string,  // name of first administrative division (state/region)
    admin2: string,  // name of second administrative division (county)
    timezone: string,  // iana timezone id
    modification_date: string,  // date of last modification in ISO format
}
