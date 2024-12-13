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

export enum SanctionLevel {
    CAUTION = "Caution",
    WARNING = "Warning",
    DISQUALIFICATION = "Disqualification",
}

export interface Sanction {
    judge_uid: string,
    player_uid: string,
    level: SanctionLevel
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

export interface Member extends Person {
    nickname: string | undefined,  // player nickname
    email: string | undefined,  // the user's email
    verified: boolean | undefined,  // whether the email has been verified
    state: string | undefined,  // state/region name
    discord: {} | undefined,
}
