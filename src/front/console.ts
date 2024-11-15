import * as base from "./base"
import unidecode from 'unidecode'


const members_by_vekn = new Map()
const members_trie = new Map() as Map<string, Array<Member>>

function load() {
    const tournamentData = document.getElementById("tournamentData") as HTMLDivElement
    const tournament = JSON.parse(tournamentData.dataset.tournament) as Tournament
    window.localStorage.setItem("tournament", JSON.stringify(tournament))
    const membersData = document.getElementById("membersData") as HTMLDivElement
    const members = JSON.parse(membersData.dataset.members) as Member[]
    window.localStorage.setItem("members", JSON.stringify(members))
    // fill our maps: members_by_vekn and members_trie
    for (const member of members) {
        members_by_vekn.set(member.vekn, member)
        var name = unidecode(member.name).toLowerCase()
        // remove non-letters non-numbers
        name = name.replace(/[^\p{L}\p{N}\s]/gu, "")
        // remove spurious spaces
        name = name.replace(/\s{2,}/g, " ");
        const parts = name.split(" ")
        for (const part of parts) {
            for (var i = 1; i < part.length + 1; i++) {
                const piece = part.slice(0, 1)
                if (!members_trie.has(piece)) {
                    members_trie.set(piece, [])
                }
                members_trie.get(piece).push(member)
            }
        }
    }
}


window.addEventListener("load", (ev) => { base.load().then() })
window.addEventListener("load", (ev) => { load() })

// -------------------------------------------------------------------------- Interfaces
enum TournamentState {
    REGISTRATION = "Registration",
    WAITING = "Waiting",
    PLAYING = "Playing",
    FINALS = "Finals",
    FINISHED = "Finished",
}

enum PlayerState {
    REGISTERED = "Registered",
    CHECKED_IN = "Checked-in",
    PLAYING = "Playing",
    FINISHED = "Finished",
}

enum Barrier {
    MISSING_DECK = "Missing Deck",
    BANNED = "Banned",
    DISQUALIFIED = "Disqualified",
    MAX_ROUNDS = "Max Rounds",
}

interface Score {
    gw: number,
    vp: number,
    tp: number,
}

interface Player {
    name: string,
    uid: string,
    state: PlayerState,
    barriers: Barrier[],
    rounds_played: number,
    table: number,  // non-zero when playing
    seat: number,  // non-zero when playing
    seed: number,  // Finals seed
    result: Score,
}

interface TableSeat {
    player_uid: string,
    result: Score,
}

interface ScoreOverride {
    judge_uid: string,
    comment: string,
}

interface Table {
    seating: TableSeat[],
    override: ScoreOverride | undefined,
}

interface Round {
    tables: Table[]
}

enum TournamentFormat {
    Standard = "Standard",
    Limited = "Limited",
    Draft = "Draft",
}

enum TournamentRank {
    BASIC = "",
    NC = "National Championship",
    CC = "Continental Championship",
    GP = "Grand Prix",
}

interface LimitedFormat {
    mono_vampire: boolean,
    mono_clan: boolean,
    storyline: string,
    include: number[],
    exclude: number[],
}

enum SanctionLevel {
    CAUTION = "Caution",
    WARNING = "Warning",
    DISQUALIFICATION = "Disqualification",
}


interface Sanction {
    judge_uid: string,
    player_uid: string,
    level: SanctionLevel
    comment: string
}

interface Tournament {
    name: string,
    organizer: string,
    format: TournamentFormat,
    start: string,
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
    // active tournament console
    current_round: number,
    limited: LimitedFormat | undefined,
    state: TournamentState,
    players: { [key: string]: Player },
    finals_seeds: string[],
    rounds: Round[],
    sanctions: { [key: string]: Sanction[] },
    winner: string,
    extra: {},
}

interface Member {
    vekn: string,  // VEKN number
    name: string,  // player name
    nickname: string | undefined,  // player nickname
    email: string | undefined,  // the user's email
    verified: boolean | undefined,  // whether the email has been verified
    country: string | undefined,  // country name
    state: string | undefined,  // state/region name
    city: string | undefined,  // city name
    uid: string | undefined,  // UUID assigned by the backend
    discord: {} | undefined,
}
