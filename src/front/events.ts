
export enum EventType {
    REGISTER = "REGISTER",
    OPEN_CHECKIN = "OPEN_CHECKIN",
    CHECK_IN = "CHECK_IN",
    CHECK_OUT = "CHECK_OUT",
    ROUND_START = "ROUND_START",
    ROUND_ALTER = "ROUND_ALTER",
    ROUND_FINISH = "ROUND_FINISH",
    SET_RESULT = "SET_RESULT",
    DROP = "DROP",
    SANCTION = "SANCTION",
    UNSANCTION = "UNSANCTION",
    OVERRIDE = "OVERRIDE",
    SEED_FINALS = "SEED_FINALS",
    SEAT_FINALS = "SEAT_FINALS",
    FINISH_TOURNAMENT = "FINISH_TOURNAMENT",
}

export enum SanctionLevel {
    CAUTION = "Caution",
    WARNING = "Warning",
    DISQUALIFICATION = "Disqualification",
}

export enum SanctionCategory {
    NONE = "",
    DECK_PROBLEM = "Deck Problem",
    PROCEDURAL_ERROR = "Procedural Error",
    CARD_DRAWING = "Card drawing",
    MARKED_CARDS = "Marked Cards",
    SLOW_PLAY = "Slow Play",
    UNSPORTSMANLIKE_CONDUCT = "Unsportsmanlike Conduct",
    CHEATING = "Cheating",
}

export interface Score {
    gw: number,
    vp: number,
    tp: number,
}

export interface Event {
    uid: string
}

export interface Register extends Event {
    type: EventType.REGISTER,
    name: string,
    vekn: string,
    player_uid: string,
    country: string,
    city: string,
}

export interface OpenCheckin extends Event {
    type: EventType.OPEN_CHECKIN,
}

export interface CheckIn extends Event {
    type: EventType.CHECK_IN,
    player_uid: string
}

export interface CheckOut extends Event {
    type: EventType.CHECK_OUT,
    player_uid: string
}

export interface RoundStart extends Event {
    type: EventType.ROUND_START,
    seating: string[][]  // list of tables: [[player_uid]]
}

export interface RoundAlter extends Event {
    type: EventType.ROUND_ALTER,
    round: number,
    seating: string[][]  // list of tables: [[player_uid]]
}

export interface RoundFinish extends Event {
    type: EventType.ROUND_FINISH
}

export interface SetResult extends Event {
    type: EventType.SET_RESULT,
    player_uid: string
    round: number
    vps: number
}

export interface Drop extends Event {
    type: EventType.DROP,
    player_uid: string
}

export interface Sanction extends Event {
    type: EventType.SANCTION,
    level: SanctionLevel,
    category: SanctionCategory,
    player_uid: string,
    comment: string,
}

export interface Unsanction extends Event {
    type: EventType.UNSANCTION,
    level: SanctionLevel,
    player_uid: string,
    comment: string,
}

export interface Override extends Event {
    type: EventType.OVERRIDE,
    round: number,
    table: number,
    comment: string,
}

export interface SeedFinals extends Event {
    type: EventType.SEED_FINALS,
    toss: Record<string, number>  // {player_uid: toss} (lower is first)
    seeds: string[]  // [player_uid] in seed order (first is top seed)
}

export interface SeatFinals extends Event {
    type: EventType.SEAT_FINALS
    seating: string[]  // [player_uid]
}

export interface FinishTournament extends Event {
    type: EventType.FINISH_TOURNAMENT
}

export type TournamentEvent = (
    Register |
    OpenCheckin |
    CheckIn |
    CheckOut |
    RoundStart |
    RoundAlter |
    RoundFinish |
    SetResult |
    Drop |
    Sanction |
    Unsanction |
    Override |
    SeedFinals |
    SeatFinals |
    FinishTournament
)
