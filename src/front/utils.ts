// Some common display utilities
// badges, acronyms, score, etc.
import * as d from "./d"
import { DateTime, DateTimeFormatOptions, Duration } from 'luxon'

export function tournament_rank_badge(tournament: d.TournamentMinimal): string {
    var cls
    var txt
    switch (tournament.rank) {
        case d.TournamentRank.NC:
            txt = "NC"
            cls = "text-bg-primary"
            break;
        case d.TournamentRank.GP:
            txt = "GP"
            cls = "text-bg-warning"
            break;
        case d.TournamentRank.CC:
            txt = "CC"
            cls = "text-bg-danger"
            break;
    }
    if (cls && txt) {
        return `<span class="badge ${cls} align-text-top text-nowrap">${txt}</span>`
    } else {
        return ""
    }
}

export function format_badge(event: d.TournamentMinimal | d.League): string {
    var cls
    const txt = event.format
    switch (event.format) {
        case d.TournamentFormat.Standard:
            cls = "text-bg-secondary"
            break;
        case d.TournamentFormat.V5:
            cls = "text-bg-warning"
            break;
        case d.TournamentFormat.Limited:
            cls = "text-bg-warning"
            break;
        case d.TournamentFormat.Draft:
            cls = "text-bg-primary"
            break;
    }
    if (cls && txt) {
        return `<span class="badge ${cls} align-text-top text-nowrap">${txt}</span>`
    } else {
        return ""
    }
}

export function score_string(score: d.Score): string {
    if (score.gw) {
        return `${score.gw}GW${score.vp}`
    }
    if (score.vp > 1) {
        return `${score.vp}VPs`
    }
    return `${score.vp}VP`
}

export function score_string_with_tp_badge(score: d.Score): string {
    var ret: string
    if (score.gw) {
        ret = `${score.gw}GW${score.vp}`
    } else if (score.vp > 1) {
        ret = `${score.vp}VPs`
    } else {
        ret = `${score.vp}VP`
    }
    ret += ` <span class="badge text-bg-secondary align-text-top">${score.tp}TPs</span>`
    return ret
}

export function full_score_string(player: d.Player, rank: number | undefined = undefined): string {
    const score = score_string(player.result)
    if (player.toss && player.toss > 0) {
        return (
            `<strong>${rank ?? player.seed}.</strong> `
            + `${score} `
            + `<span class="badge text-bg-secondary align-text-top">${player.result.tp}TPs, T: ${player.toss}</span>`
        )
    } else {
        return (
            `<strong>${rank ?? player.seed}.</strong> `
            + `${score} `
            + `<span class="badge text-bg-secondary align-text-top">${player.result.tp}TPs</span>`
        )
    }
}

export function tournament_result_string(result: d.TournamentRating): string {
    return `<strong>${result.rank}.</strong> ${score_string(result.result)}`
}


export function ranking_category(tournament: d.TournamentRef) {
    if (tournament.format == d.TournamentFormat.Standard) {
        if (tournament?.online) {
            return d.RankingCategoy.CONSTRUCTED_ONLINE
        }
        return d.RankingCategoy.CONSTRUCTED_ONSITE
    }
    if (tournament?.online) {
        return d.RankingCategoy.LIMITED_ONLINE
    }
    return d.RankingCategoy.LIMITED_ONSITE
}


// ------------------------------------------------------------------------------------------------------------ DateTime
export const DATETIME_UNAMBIGUOUS: DateTimeFormatOptions = {
    hour12: false,
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZoneName: "short",
    hour: "2-digit",
    minute: "2-digit"
}

function _datetime(date: string, timezone: string): DateTime | undefined {
    const ret = DateTime.fromFormat(
        `${date} ${timezone}`,
        "yyyy-MM-dd'T'HH:mm:ss z",
        { setZone: true }
    )
    if (ret.isValid) {
        return ret
    }
    return undefined
}

export function datetime(tournament: d.TournamentMinimal | d.League): DateTime | undefined {
    return _datetime(tournament.start, tournament.timezone)
}

export function datetime_finish(tournament: d.TournamentMinimal | d.League): DateTime | undefined {
    if (tournament.finish && tournament.finish.length > 0) {
        return _datetime(tournament.finish, tournament.timezone)
    }
    return undefined
}

export function overlap(lhs: d.TournamentMinimal | d.League, start: string, finish: string, timezone: string): boolean {
    const lhs_start = datetime(lhs)
    const rhs_start = _datetime(start, timezone) ?? lhs_start
    const lhs_finish = datetime_finish(lhs) ?? rhs_start
    const rhs_finish = _datetime(finish, timezone) ?? lhs_start
    // use a one-day tolerance to avoid timezone fumbles
    return lhs_start <= rhs_finish.plus({ days: 1 }) && rhs_start <= lhs_finish.plus({ days: 1 })
}

export function datetime_string(tournament: d.TournamentMinimal | d.League) {
    if (!tournament) { return "" }
    const dt = datetime(tournament)
    if (!tournament.country || tournament.country.length < 1) {
        return dt.toLocal().toLocaleString(DATETIME_UNAMBIGUOUS)
    } else {
        return dt.toLocaleString(DATETIME_UNAMBIGUOUS)
    }
}

export function datetime_string_finish(tournament: d.TournamentMinimal | d.League) {
    if (!tournament || !tournament.finish) { return "" }
    const dt = _datetime(tournament.finish, tournament.timezone)
    if (!tournament.country || tournament.country.length < 1) {
        return dt.toLocal().toLocaleString(DATETIME_UNAMBIGUOUS)
    } else {
        return dt.toLocaleString(DATETIME_UNAMBIGUOUS)
    }
}

export function date_string(tournament: d.TournamentMinimal | d.League) {
    if (!tournament) { return "" }
    const dt = datetime(tournament)
    if (!tournament.country || tournament.country.length < 1) {
        return dt.toLocal().toISODate()
    } else {
        return dt.toISODate()
    }
}

export function date_string_finish(tournament: d.TournamentMinimal | d.League) {
    if (!tournament || !tournament.finish || tournament.finish === "") { return "" }
    const dt = _datetime(tournament.finish, tournament.timezone)
    if (!tournament.country || tournament.country.length < 1) {
        return dt.toLocal().toISODate()
    } else {
        return dt.toISODate()
    }
}

// ----------------------------------------------------------------------------------------------------------- Standings
function compare_arrays(lhs: number[], rhs: number[]): number {
    for (let i = 0; i < lhs.length; i++) {
        if (lhs[i] < rhs[i]) {
            return -1
        }
        if (lhs[i] > rhs[i]) {
            return 1
        }
    }
    return 0
}

function compare_players_standings(lhs: [number[], d.Player], rhs: [number[], d.Player]): number {
    const ret = compare_arrays(lhs[0], rhs[0])
    if (ret != 0) {
        return ret
    }

    return lhs[1].name.localeCompare(rhs[1].name)
}

function _calculate_rankings(
    tournament: d.Tournament,
    players: d.Player[],
    ignore_toss: boolean = false
): [number, d.Player][] {
    function standings_array(p: d.Player): number[] {
        return [
            // dropouts go last (only matters when tournament in progress)
            +(p.state == d.PlayerState.FINISHED),
            // winner always first if not DQ
            -(p.uid == tournament.winner),
            // then finalists (higher score can have dropped out)
            -(tournament.finals_seeds.includes(p.uid)),
            - p.result.gw,
            -p.result.vp,
            -p.result.tp,
            -(p.rating_points || 0),
            ignore_toss ? 0 : p.toss,
        ]
    }
    const sorted_players: [number[], d.Player][] = Object.values(players).map(
        p => [standings_array(p), p]
    )
    sorted_players.sort(compare_players_standings)
    if (sorted_players.length < 1) {
        return []
    }
    var rank = 1
    var next_rank = 0
    const res: [number, d.Player][] = []
    var finalists = 5
    if (tournament.state == d.TournamentState.FINISHED) {
        finalists = 0
    }
    var last_standings: number[] = sorted_players[0][0]
    for (const [standings_array, player] of sorted_players) {
        if (finalists < 5) {
            finalists++
            if (finalists == 1) {
                rank = 1
            } else {
                next_rank++
                rank = 2
            }
        } else if (compare_arrays(last_standings, standings_array) < 0) {
            rank += next_rank
            next_rank = 1
            last_standings = standings_array
        } else {
            next_rank++
        }
        res.push([rank, player])
    }
    return res
}


export function standings(
    tournament: d.Tournament,
    players: d.Player[] | undefined = undefined,
    ignore_toss: boolean = false
): [number, d.Player][] {
    const players_list = Object.values(players ?? tournament.players).filter(p => p.rounds_played > 0)
    return _calculate_rankings(tournament, players_list, ignore_toss)
}

export function ranked_players(
    tournament: d.Tournament,
    players: d.Player[] | undefined = undefined,
    ignore_toss: boolean = false
): [number, d.Player][] {
    const players_list = Object.values(players ?? tournament.players)
    return _calculate_rankings(tournament, players_list, ignore_toss)
}

export function ordinal(n: number): string {
    if (!n) { return "" }
    if (n <= 0) { return n.toString() }
    const suffix = n.toString().slice(-1)
    if (suffix == "1") { return `${n}<sup>st</sup>` }
    if (suffix == "2") { return `${n}<sup>nd</sup>` }
    if (suffix == "3") { return `${n}<sup>rd</sup>` }
    return `${n}<sup>th</sup>`
}

export function constrain_string(str: string, max_length: number): string {
    if (str.length <= max_length) {
        return str
    }
    return str.slice(0, max_length - 1) + "…"
}
