import * as d from "./d"
import * as base from "./base"
import DOMPurify from 'isomorphic-dompurify'
import { marked, Tokens } from 'marked'
import { DateTime, DateTimeFormatOptions } from 'luxon'


const DATETIME_UNAMBIGUOUS: DateTimeFormatOptions = {
    hour12: false,
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZoneName: "short",
    hour: "2-digit",
    minute: "2-digit"
}

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

export function standings(tournament: d.Tournament) {
    function standings_array(p: d.Player): number[] {
        return [
            +(p.state == d.PlayerState.FINISHED),
            -(p.uid == tournament.winner),
            -p.result.gw,
            -p.result.vp,
            -p.result.tp,
            p.toss,
        ]
    }
    const sorted_players: [number[], d.Player][] = Object.values(tournament.players).map(p => [standings_array(p), p])
    sorted_players.sort(compare_players_standings)
    var rank = 1
    var next_rank = 0
    const res = []
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

function score_string(score: d.Score, rank: number = undefined): string {
    var res: string
    if (score.gw) {
        res = `${score.gw}GW${score.vp}`
    }
    else if (score.vp > 1) {
        res = `${score.vp}VPs`
    }
    else {
        res = `${score.vp}VP`
    }
    if (rank) {
        res = `${rank}. ${res} (${score.tp}TPs)`
    }
    return res
}

export class TournamentDisplay {
    root: HTMLDivElement
    constructor(root: HTMLDivElement) {
        this.root = root
    }
    async display(tournament: d.Tournament, token: base.Token, included: boolean = false) {
        // ----------------------------------------------------------------------------------------------------- User ID
        const [p1, p2, p3] = token.access_token.split(".")
        const payload = JSON.parse(window.atob(p2))
        console.log("JWT payload", payload)
        const user_id = payload["sub"]
        if (Object.hasOwn(tournament.players, user_id)) {
            const player = tournament.players[user_id]
            if (player.state != d.PlayerState.FINISHED) {
                const alert = base.create_append(this.root, "div", ["alert", "alert-success"], { role: "alert" })
                alert.innerText = "You are registered for this tournament"
            }
        }
        // ------------------------------------------------------------------------------------------------------- Title
        if (!included) {
            base.create_append(this.root, "h1", ["mb-2"]).innerText = tournament.name
        }
        // ----------------------------------------------------------------------------------------------------- Buttons
        if (!included && tournament.judges.includes(user_id)) {
            base.create_append(this.root, "a", ["btn", "btn-primary", "my-3"],
                { href: `/tournament/${tournament.uid}/console.html` }
            ).innerText = "Console"
        }
        // ------------------------------------------------------------------------------------------------------ Badges
        const badges_div = base.create_append(this.root, "div", ["my-2", "d-flex"])
        base.create_append(badges_div, "span",
            ["me-2"]
        ).innerText = `${Object.getOwnPropertyNames(tournament.players).length} contenders`
        const status_badge = base.create_append(badges_div, "span", ["me-2", "badge"])
        switch (tournament.state) {
            case d.TournamentState.REGISTRATION:
                status_badge.classList.add("bg-info", "text-dark")
                status_badge.innerText = "Registration"
                break;
            case d.TournamentState.FINISHED:
                status_badge.classList.add("bg-secondary")
                status_badge.innerText = "Finished"
                break;
            default:
                status_badge.classList.add("bg-warning", "text-dark")
                status_badge.innerText = "In Progress"
                break;
        }
        const format_badge = base.create_append(badges_div, "span", ["me-2", "badge"])
        format_badge.innerText = tournament.format
        switch (tournament.format) {
            case d.TournamentFormat.Standard:
                format_badge.classList.add("bg-secondary")
                break;
            case d.TournamentFormat.Limited:
                format_badge.classList.add("bg-warning", "text-dark")
                break;
            case d.TournamentFormat.Draft:
                format_badge.classList.add("bg-info", "text-dark")
                break;
        }
        if (tournament.rank != d.TournamentRank.BASIC) {
            const rank_badge = base.create_append(badges_div, "span", ["me-2", "badge"])
            rank_badge.innerText = tournament.rank
            switch (tournament.rank) {
                case d.TournamentRank.NC:
                    rank_badge.classList.add("bg-primary")
                    break;
                case d.TournamentRank.GP:
                    rank_badge.classList.add("bg-warning", "text-dark")
                    break;
                case d.TournamentRank.CC:
                    rank_badge.classList.add("bg-danger")
                    break;
            }
        }
        if (tournament.online) {
            base.create_append(badges_div, "span", ["me-2", "badge", "bg-info", "text-dark"]).innerText = "Online"
        }
        if (tournament.proxies) {
            base.create_append(badges_div, "span",
                ["me-2", "badge", "bg-info", "text-dark"]
            ).innerText = "Proxies Allowed"
        } else {
            base.create_append(badges_div, "span", ["me-2", "badge", "bg-secondary"]).innerText = "No Proxy"
        }
        if (tournament.multideck) {
            base.create_append(badges_div, "span", ["me-2", "badge", "bg-info", "text-dark"]).innerText = "Multideck"
        } else {
            base.create_append(badges_div, "span", ["me-2", "badge", "bg-secondary"]).innerText = "Single Deck"
        }
        // ------------------------------------------------------------------------------------------------- Date & Time
        const datetime_div = base.create_append(this.root, "div", ["mb-2", "d-flex"])
        const start = DateTime.fromFormat(
            `${tournament.start} ${tournament.timezone}`,
            "yyyy-MM-dd'T'HH:mm:ss z",
            { setZone: true }
        )
        var finish = undefined
        if (tournament.finish) {
            finish = DateTime.fromFormat(
                `${tournament.finish} ${tournament.timezone}`,
                "yyyy-MM-dd'T'HH:mm:ss z",
                { setZone: true }
            )
        }
        var start_string = undefined
        var finish_string = undefined
        if (tournament.online) {
            start_string = start.toLocal().toLocal().toLocaleString(DATETIME_UNAMBIGUOUS)
            finish_string = finish?.toLocal()?.toLocal()?.toLocaleString(DATETIME_UNAMBIGUOUS)
        } else {
            base.create_append(datetime_div, "div", ["me-2"]).innerText = `${tournament.country}`
            start_string = start.toLocaleString(DATETIME_UNAMBIGUOUS)
            finish_string = finish?.toLocaleString(DATETIME_UNAMBIGUOUS)
        }
        base.create_append(datetime_div, "div", ["me-2"]).innerText = start_string
        if (finish) {
            base.create_append(datetime_div, "div", ["me-2"]).innerHTML = '<i class="bi bi-arrow-right"></i>'
            base.create_append(datetime_div, "div", ["me-2"]).innerText = finish_string
        }
        // ------------------------------------------------------------------------------------------------------- Venue
        if (!tournament.online && tournament.venue) {
            base.create_append(this.root, "h2", ["mt-3", "mb-1"]).innerText = "Venue"
            const venue_div = base.create_append(this.root, "div", ["d-flex"])
            base.create_append(venue_div, "div", ["me-2"]).innerText = tournament.venue
            if (tournament.venue_url) {
                base.create_append(venue_div, "a", ["me-2"],
                    { href: tournament.venue_url, target: "_blank" }
                ).innerHTML = '<i class="bi bi-globe"></i>'
            }
            if (tournament.address) {
                base.create_append(venue_div, "div", ["me-2"]).innerText = tournament.address
            }
            if (tournament.map_url) {
                base.create_append(venue_div, "a", ["me-2"],
                    { href: tournament.map_url, target: "_blank" }
                ).innerHTML = '<i class="bi bi-geo-alt-fill"></i>'
            }
        }
        // ------------------------------------------------------------------------------------------------- Description
        if (tournament.description) {
            const description_div = base.create_append(this.root, "div", ["mt-3", "mb-1"])
            const renderer = new marked.Renderer();
            const linkRenderer = renderer.link;
            renderer.link = ({ href, title, tokens }: Tokens.Link): string => {
                const html = linkRenderer.call(renderer, { href, title, tokens });
                return html.replace(/^<a /, '<a target="_blank" rel="nofollow noreferrer" ');
            };
            description_div.innerHTML = DOMPurify.sanitize(
                await marked(tournament.description, { renderer: renderer }),
                { ADD_ATTR: ['target'] }
            )
        }
        // --------------------------------------------------------------------------------------------------- Standings
        if (tournament.state == d.TournamentState.FINALS || tournament.state == d.TournamentState.FINISHED) {
            const table = base.create_append(this.root, "table", ["table", "table-striped"])
            const thead = base.create_append(table, "thead")
            const tr = base.create_append(thead, "tr")
            for (const header of ["Rank", "VEKN #", "Name", "City", "Country", "Score"]) {
                base.create_append(tr, "th", [], { scope: "col" }).innerText = header
            }
            const tbody = base.create_append(table, "tbody")
            for (const [rank, player] of standings(tournament)) {
                const tr = base.create_append(tbody, "tr")
                const classes = []
                if (rank == 1 && tournament.state == d.TournamentState.FINISHED) {
                    classes.push("bg-warning-subtle")
                } else if (player.uid == user_id) {
                    classes.push("bg-primary-subtle")
                }
                base.create_append(tr, "th", classes, { scope: "row" }).innerText = rank
                base.create_append(tr, "td", classes).innerText = player.vekn
                base.create_append(tr, "td", classes).innerText = player.name
                base.create_append(tr, "td", classes).innerText = player.city
                base.create_append(tr, "td", classes).innerText = player.country
                base.create_append(tr, "td", classes).innerText = score_string(player.result, rank)
            }
        }
    }
}

async function load() {
    const tournamentDisplay = document.getElementById("tournamentDisplay") as HTMLDivElement
    if (tournamentDisplay) {
        const display = new TournamentDisplay(tournamentDisplay)
        const tournament = JSON.parse(tournamentDisplay.dataset.tournament) as d.Tournament
        const token = await base.fetchToken()
        await display.display(tournament, token)
    }
}

window.addEventListener("load", (ev) => { base.load() })
window.addEventListener("load", (ev) => { load() })
