// Some common display utilities
// badges, acronyms, score, etc.
import * as d from "./d"
import { DateTime, DateTimeFormatOptions } from 'luxon'

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

function _datetime(date: string, timezone: string): DateTime {
    return DateTime.fromFormat(
        `${date} ${timezone}`,
        "yyyy-MM-dd'T'HH:mm:ss z",
        { setZone: true }
    )
}

export function datetime(tournament: d.TournamentMinimal | d.League): DateTime {
    return _datetime(tournament.start, tournament.timezone)
}

export function datetime_finish(tournament: d.TournamentMinimal | d.League): DateTime | void {
    if (tournament.finish) {
        return _datetime(tournament.finish, tournament.timezone)
    }
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
    const length = lhs.length < rhs.length ? lhs.length : rhs.length
    for (var i = 0; i < length; i++) {
        const val = lhs[i] - rhs[i]
        if (val != 0) { return val }
    }
    return 0
}

function compare_players_standings(lhs: [number[], d.Player], rhs: [number[], d.Player]): number {
    const ret = compare_arrays(lhs[0], rhs[0])
    if (ret != 0) { return ret }
    return lhs[1].name.localeCompare(rhs[1].name)
}

export function standings(
    tournament: d.Tournament,
    players: d.Player[] | undefined = undefined,
    ignore_toss: boolean = false
): [number, d.Player][] {
    function standings_array(p: d.Player): number[] {
        return [
            +(p.state == d.PlayerState.FINISHED),
            -(p.uid == tournament.winner),
            -p.result.gw,
            -p.result.vp,
            -p.result.tp,
            ignore_toss ? 0 : p.toss,
        ]
    }
    const sorted_players: [number[], d.Player][] = Object.values(players ?? tournament.players).map(
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
