import * as bootstrap from "bootstrap"
import * as base from "../../base"
import * as d from "../../d"
import * as utils from "../../utils"
import DOMPurify from 'isomorphic-dompurify'
import { marked, Tokens } from 'marked'

export class VenueCompletion extends base.Completion<d.VenueCompletion> {
    token: base.Token | undefined
    country: HTMLSelectElement
    address: HTMLInputElement
    venue_url: HTMLInputElement
    map_url: HTMLInputElement
    constructor(
        input: HTMLInputElement,
        token: base.Token | undefined,
        country: HTMLSelectElement,
        address: HTMLInputElement,
        venue_url: HTMLInputElement,
        map_url: HTMLInputElement
    ) {
        super(input)
        this.token = token
        this.country = country
        this.address = address
        this.venue_url = venue_url
        this.map_url = map_url
    }
    async complete_input(value: string): Promise<d.VenueCompletion[]> {
        const res = await base.do_fetch_with_token(
            "/api/tournaments/venue-completion/"
            + encodeURIComponent(this.country.value)
            + "/"
            + encodeURIComponent(value),
            this.token,
            {}
        )
        var venues_list: d.VenueCompletion[] = []
        if (res) {
            venues_list = await res.json()
        }
        return venues_list
    }
    item_label(item: d.VenueCompletion): string {
        return item.venue
    }
    item_selected(item: d.VenueCompletion): void {
        if (item.address) {
            this.address.value = item.address
        } else {
            this.address.value = ""
        }
        if (item.venue_url) {
            this.venue_url.value = item.venue_url
        } else {
            this.venue_url.value = ""
        }
        if (item.map_url) {
            this.map_url.value = item.map_url
        } else {
            this.map_url.value = ""
        }
    }
}

export class BaseTournamentDisplay {
    // Public display, and display in the console info tab
    root: HTMLDivElement
    declare token: base.Token | undefined
    declare user_id: string | undefined
    alert: HTMLDivElement
    constructor(root: HTMLDivElement) {
        this.root = root
    }
    init(
        token: base.Token | undefined = undefined,
    ) {
        this.token = token
        if (token) {
            this.user_id = base.user_uid_from_token(token)
        }
    }
    set_alert(message: string, level: d.AlertLevel) {
        if (!this.alert) { return }
        this.alert.innerHTML = message
        this.alert.classList.remove("alert-info", "alert-success", "alert-warning", "alert-danger")
        switch (level) {
            case d.AlertLevel.INFO:
                this.alert.classList.add("alert-info")
                break;
            case d.AlertLevel.SUCCESS:
                this.alert.classList.add("alert-success")
                break;
            case d.AlertLevel.WARNING:
                this.alert.classList.add("alert-warning")
                break;
            case d.AlertLevel.DANGER:
                this.alert.classList.add("alert-sanger")
                break;
            default:
                break;
        }
    }
    display_header(tournament: d.TournamentConfig) {
        // ------------------------------------------------------------------------------------------------------ Badges
        const badges_div = base.create_append(this.root, "div", ["mt-2", "d-md-flex", "align-items-center"])
        const status_badge = base.create_append(badges_div, "span", ["me-2", "mb-2", "text-nowrap", "badge"])
        switch (tournament.state) {
            case d.TournamentState.REGISTRATION:
                status_badge.classList.add("text-bg-info")
                status_badge.innerText = "Registration"
                break;
            case d.TournamentState.FINISHED:
                status_badge.classList.add("text-bg-secondary")
                status_badge.innerText = "Finished"
                break;
            default:
                status_badge.classList.add("text-bg-warning")
                status_badge.innerText = "In Progress"
                break;
        }
        const format_badge = base.create_append(badges_div, "span", ["me-2", "mb-2", "text-nowrap", "badge"])
        format_badge.innerText = tournament.format
        switch (tournament.format) {
            case d.TournamentFormat.Standard:
                format_badge.classList.add("text-bg-secondary")
                break;
            case d.TournamentFormat.Limited:
                format_badge.classList.add("text-bg-warning")
                break;
            case d.TournamentFormat.Draft:
                format_badge.classList.add("text-bg-info")
                break;
        }
        if (tournament.rank != d.TournamentRank.BASIC) {
            const rank_badge = base.create_append(badges_div, "span", ["me-2", "mb-2", "text-nowrap", "badge"])
            rank_badge.innerText = tournament.rank ?? ""
            switch (tournament.rank) {
                case d.TournamentRank.NC:
                    rank_badge.classList.add("text-bg-primary")
                    break;
                case d.TournamentRank.GP:
                    rank_badge.classList.add("text-bg-warning")
                    break;
                case d.TournamentRank.CC:
                    rank_badge.classList.add("text-bg-danger")
                    break;
            }
        }
        if (tournament.online) {
            base.create_append(badges_div, "span",
                ["me-2", "mb-2", "text-nowrap", "badge", "text-bg-info"]
            ).innerText = "Online"
        }
        if (tournament.proxies) {
            base.create_append(badges_div, "span",
                ["me-2", "mb-2", "text-nowrap", "badge", "text-bg-info"]
            ).innerText = "Proxies Allowed"
        } else {
            base.create_append(badges_div, "span",
                ["me-2", "mb-2", "text-nowrap", "badge", "text-bg-secondary"]
            ).innerText = "No Proxy"
        }
        if (tournament.multideck) {
            base.create_append(badges_div, "span",
                ["me-2", "mb-2", "text-nowrap", "badge", "text-bg-info"]
            ).innerText = "Multideck"
        } else {
            base.create_append(badges_div, "span",
                ["me-2", "mb-2", "text-nowrap", "badge", "text-bg-secondary"]
            ).innerText = "Single Deck"
        }
        if (tournament.decklist_required) {
            base.create_append(badges_div, "span",
                ["me-2", "mb-2", "text-nowrap", "badge", "text-bg-info"]
            ).innerText = "Decklist required"
        }
        if (tournament.league) {
            base.create_append(badges_div, "a",
                ["me-2", "mb-2", "text-nowrap", "badge", "text-bg-info", "text-decoration-none"],
                { href: `/league/${tournament.league.uid}/display.html` }
            ).innerText = utils.constrain_string(tournament.league.name, 50)
        }
        // ------------------------------------------------------------------------------------------------- Date & Time
        const datetime_div = base.create_append(this.root, "div", ["d-md-flex", "mb-2"])
        const start = base.create_append(datetime_div, "div", ["me-2"])
        start.innerText = utils.datetime_string(tournament)
        if (tournament.finish && tournament.finish.length > 0) {
            base.create_append(datetime_div, "div", ["me-2"]).innerHTML = '<i class="bi bi-arrow-right"></i>'
            const finish = base.create_append(datetime_div, "div", ["me-2"])
            finish.innerText = utils.datetime_string_finish(tournament)
        }
    }
    display_venue(tournament: d.TournamentConfig) {
        if (!tournament.online && tournament.venue) {
            base.create_append(this.root, "h2", ["mt-5", "mb-1"]).innerText = "Venue"
            const venue_div = base.create_append(this.root, "div", ["d-flex"])
            base.create_append(venue_div, "div", ["me-2"]).innerText = tournament.venue
            if (tournament.venue_url) {
                base.create_append(venue_div, "a", ["me-2"],
                    { href: tournament.venue_url, target: "_blank" }
                ).innerHTML = '<i class="bi bi-globe"></i>'
            }
            const location = base.create_append(venue_div, "div", ["me-2"])
            location.innerText = ""
            if (tournament.address) {
                location.innerText += `${tournament.address}`
            }
            if (tournament.country) {
                location.innerText += `, ${tournament.country} ${tournament.country_flag}`
            }
            if (tournament.map_url) {
                base.create_append(venue_div, "a", ["me-2"],
                    { href: tournament.map_url, target: "_blank" }
                ).innerHTML = '<i class="bi bi-geo-alt-fill"></i>'
            }
        }
    }
    display_judges(tournament: d.TournamentConfig) {
        if (this.user_id && tournament.judges && tournament.judges.length > 0) {
            const table = base.create_append(this.root, "table", ["table", "table-striped", "my-2"])
            const head = base.create_append(table, "thead")
            const row = base.create_append(head, "tr", ["align-middle"])
            base.create_append(row, "th", [], { scope: "col", colspan: "3" }).innerText = "Judges & Organizers"
            const body = base.create_append(table, "tbody")
            for (const judge of tournament.judges.values()) {
                body.append(this.create_judge_row(judge))
            }
        }
    }
    display_description(tournament: d.TournamentConfig) {
        if (tournament.description) {
            const description_div = base.create_append(this.root, "div", ["mt-5", "mb-1"])
            const renderer = new marked.Renderer();
            const linkRenderer = renderer.link;
            renderer.link = ({ href, title, tokens }: Tokens.Link): string => {
                const html = linkRenderer.call(renderer, { href, title, tokens });
                return html.replace(/^<a /, '<a target="_blank" rel="nofollow noreferrer" ');
            };
            marked(tournament.description, { renderer: renderer, async: true }).then(
                (html: string) => {
                    description_div.innerHTML = DOMPurify.sanitize(html, { ADD_ATTR: ['target'] })
                },
                (error: Error) => {
                    console.error(error)
                    description_div.innerHTML = `Error parsing description: ${error.message}`
                }
            )
        }
    }
    display_standings(tournament: d.Tournament) {
        const standings = utils.standings(tournament)
        base.create_append(this.root, "h2", ["mt-4"]).innerText = `Standings (${standings.length} contenders)`
        const table = base.create_append(this.root, "table", ["table", "table-striped"])
        const thead = base.create_append(table, "thead")
        const tr = base.create_append(thead, "tr", ["align-middle"])
        var headers = ["Rank", "VEKN #", "Name", "City", "Country", "Score"]
        if (tournament.state == d.TournamentState.FINISHED) {
            headers.push("Rating")
        }
        for (const header of headers) {
            base.create_append(tr, "th", [], { scope: "col" }).innerText = header
        }
        const tbody = base.create_append(table, "tbody")
        for (const [rank, player] of standings) {
            const tr = base.create_append(tbody, "tr", ["align-middle"])
            const classes = ["text-nowrap"]
            if (rank == 1 && tournament.state == d.TournamentState.FINISHED) {
                classes.push("bg-warning-subtle")
            } else if (player.uid == this.user_id) {
                classes.push("bg-primary-subtle")
            }
            if (
                tournament.standings_mode == d.StandingsMode.TOP_10 && !(
                    tournament.state == d.TournamentState.FINALS ||
                    tournament.state == d.TournamentState.FINISHED
                ) && rank > 10
            ) {
                break
            }
            base.create_append(tr, "th", classes, { scope: "row" }).innerText = rank.toString()
            base.create_append(tr, "td", classes).innerText = player.vekn ?? ""
            base.create_append(tr, "td", classes).innerText = player.name
            base.create_append(tr, "td", classes).innerText = player.city ?? ""
            base.create_append(tr, "td", classes).innerText = `${player.country} ${player.country_flag}`
            base.create_append(tr, "td", classes).innerHTML = utils.score_string(player.result ?? { gw: 0, vp: 0, tp: 0 })
            if (tournament.state == d.TournamentState.FINISHED) {
                base.create_append(tr, "td", classes).innerText = player.rating_points?.toString() || ""
            }
        }
    }
    create_judge_row(person: d.Person) {
        const row = base.create_element("tr")
        base.create_append(row, "th", [], { scope: "row" }).innerText = person.vekn || ""
        base.create_append(row, "td", ["w-100"]).innerText = person.name
        return row
    }
}
