import * as d from "./d"
import * as base from "./base"
import * as events from "./events"
import * as member from "./member"
import * as bootstrap from 'bootstrap'
import * as uuid from 'uuid'
import { Base64 } from 'js-base64'
import DOMPurify from 'isomorphic-dompurify'
import { marked, Tokens } from 'marked'
import { DateTime, DateTimeFormatOptions } from 'luxon'
import QrScanner from 'qr-scanner'
import { stringify } from 'yaml'
import * as tempusDominus from '@eonasdan/tempus-dominus'
import { biOneIcons } from '@eonasdan/tempus-dominus/dist/plugins/bi-one'

export const DATETIME_UNAMBIGUOUS: DateTimeFormatOptions = {
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

export function score_string(score: d.Score): string {
    if (score.gw) {
        return `${score.gw}GW${score.vp}`
    }
    if (score.vp > 1) {
        return `${score.vp}VPs`
    }
    return `${score.vp}VP`
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

class ScoreModal {
    display: TournamentDisplay
    tournament: d.Tournament
    player_uid: string
    round_number: number
    modal_div: HTMLDivElement
    modal: bootstrap.Modal
    title: HTMLHeadingElement
    constructor(el: HTMLDivElement, display: TournamentDisplay) {
        this.display = display
        this.modal_div = base.create_append(el, "div", ["modal", "fade"],
            { tabindex: "-1", "aria-hidden": "true", "aria-labelledby": "scoreModalLabel" }
        )
        const dialog = base.create_append(this.modal_div, "div", ["modal-dialog"])
        const content = base.create_append(dialog, "div", ["modal-content"])
        const header = base.create_append(content, "div", ["modal-header"])
        this.title = base.create_append(header, "h1", ["modal-title", "fs-5"])
        base.create_append(header, "button", ["btn-close"], { "data-bs-dismiss": "modal", "aria-label": "Close" })
        const body = base.create_append(content, "div", ["modal-body", "d-flex", "flex-column", "align-items-center"])
        const row_1 = base.create_append(body, "div", ["d-flex", "flex-row", "align-items-center"])
        const btn_00 = base.create_append(row_1, "button", ["btn", "btn-primary", "me-1", "mb-1"], { type: "button" })
        const btn_10 = base.create_append(row_1, "button", ["btn", "btn-primary", "me-1", "mb-1"], { type: "button" })
        const btn_20 = base.create_append(row_1, "button", ["btn", "btn-primary", "me-1", "mb-1"], { type: "button" })
        const btn_30 = base.create_append(row_1, "button", ["btn", "btn-primary", "me-1", "mb-1"], { type: "button" })
        const btn_40 = base.create_append(row_1, "button", ["btn", "btn-primary", "me-1", "mb-1"], { type: "button" })
        const btn_50 = base.create_append(row_1, "button", ["btn", "btn-primary", "me-1", "mb-1"], { type: "button" })
        const row_2 = base.create_append(body, "div", ["d-flex", "flex-row", "align-items-center"])
        const btn_05 = base.create_append(row_2, "button", ["btn", "btn-primary", "me-1", "mb-1"], { type: "button" })
        const btn_15 = base.create_append(row_2, "button", ["btn", "btn-primary", "me-1", "mb-1"], { type: "button" })
        const btn_25 = base.create_append(row_2, "button", ["btn", "btn-primary", "me-1", "mb-1"], { type: "button" })
        const btn_35 = base.create_append(row_2, "button", ["btn", "btn-primary", "me-1", "mb-1"], { type: "button" })
        const btn_45 = base.create_append(row_2, "button", ["btn", "btn-primary", "me-1", "mb-1"], { type: "button" })
        btn_00.innerText = "0"
        btn_05.innerText = "0.5"
        btn_10.innerText = "1"
        btn_15.innerText = "1.5"
        btn_20.innerText = "2"
        btn_25.innerText = "2.5"
        btn_30.innerText = "3"
        btn_35.innerText = "3.5"
        btn_40.innerText = "4"
        btn_45.innerText = "4.5"
        btn_50.innerText = "5"
        btn_00.addEventListener("click", (ev) => this.set_score(0))
        btn_05.addEventListener("click", (ev) => this.set_score(0.5))
        btn_10.addEventListener("click", (ev) => this.set_score(1))
        btn_15.addEventListener("click", (ev) => this.set_score(1.5))
        btn_20.addEventListener("click", (ev) => this.set_score(2))
        btn_25.addEventListener("click", (ev) => this.set_score(2.5))
        btn_30.addEventListener("click", (ev) => this.set_score(3))
        btn_35.addEventListener("click", (ev) => this.set_score(3.5))
        btn_40.addEventListener("click", (ev) => this.set_score(4))
        btn_45.addEventListener("click", (ev) => this.set_score(4.5))
        btn_50.addEventListener("click", (ev) => this.set_score(5))
        this.modal = new bootstrap.Modal(this.modal_div)
    }

    async set_score(score: number) {
        await this.display.set_score(this.tournament, this.player_uid, this.round_number, score)
        this.modal.hide()
    }

    show(tournament: d.Tournament, player: d.Player, round_number: number, vps: number = 0) {
        this.title.innerText = `${player.name} result: round ${round_number}`
        this.tournament = tournament
        this.player_uid = player.uid
        this.round_number = round_number
        this.modal.show()
    }
}

class DeckModal {
    display: TournamentDisplay
    tournament: d.Tournament
    player_uid: string
    modal_div: HTMLDivElement
    qr_scanner: QrScanner
    form: HTMLFormElement
    deck: HTMLTextAreaElement
    modal: bootstrap.Modal
    title: HTMLHeadingElement
    constructor(el: HTMLDivElement, display: TournamentDisplay) {
        this.display = display
        this.modal_div = base.create_append(el, "div", ["modal", "fade"],
            { tabindex: "-1", "aria-hidden": "true", "aria-labelledby": "scoreModalLabel" }
        )
        const dialog = base.create_append(this.modal_div, "div", ["modal-dialog"])
        const content = base.create_append(dialog, "div", ["modal-content"])
        const header = base.create_append(content, "div", ["modal-header"])
        this.title = base.create_append(header, "h1", ["modal-title", "fs-5"])
        base.create_append(header, "button", ["btn-close"], { "data-bs-dismiss": "modal", "aria-label": "Close" })
        const body = base.create_append(content, "div", ["modal-body"])
        const qr_code_button = base.create_append(body, "button", ["btn", "btn-primary", "my-2"], { type: "button" })
        qr_code_button.innerHTML = '<i class="bi bi-qr-code-scan"> Scan VDB</i>'
        const video = base.create_append(body, "video", ["w-100"])
        this.qr_scanner = new QrScanner(video, async (result) => this.scanned(result), { highlightScanRegion: true })
        qr_code_button.addEventListener("click", (ev) => {
            qr_code_button.disabled = true
            this.qr_scanner.start()
        })
        this.form = base.create_append(body, "form")
        const deck_div = base.create_append(this.form, "div", ["input-group", "form-floating"])
        this.deck = base.create_append(deck_div, "textarea", ["form-control", "mb-2", "h-100"],
            { id: "deckModalTextInput", type: "text", autocomplete: "new-deck", rows: "10", maxlength: 10000 }
        )
        this.deck.ariaLabel = "Deck list (plain text or URL)"
        const label = base.create_append(deck_div, "label", ["form-label"], { for: "deckModalTextInput" })
        label.innerText = "Deck list (plain text or URL: accepts VDB, Amaranth or VTESDecks)"
        const btn_div = base.create_append(this.form, "div", ["col-auto"])
        base.create_append(btn_div, "button", ["btn", "btn-primary", "me-2"], { type: "submit" }).innerText = "Submit"
        this.form.addEventListener("submit", (ev) => this.submit(ev))
        this.modal = new bootstrap.Modal(this.modal_div)
        this.modal_div.addEventListener("hide.bs.modal", (ev) => {
            this.qr_scanner.stop()
            qr_code_button.disabled = false
        })
    }

    scanned(result: QrScanner.ScanResult) {
        this.qr_scanner.stop()
        this.deck.value = result.data
        this.form.dispatchEvent(new SubmitEvent("submit", { submitter: this.qr_scanner.$video }))
    }

    async submit(ev: SubmitEvent) {
        ev.preventDefault()
        await this.display.set_deck(this.tournament, this.player_uid, this.deck.value)
        this.modal.hide()
    }

    show(tournament: d.Tournament, player: d.Player) {
        this.title.innerText = `${player.name}'s deck`
        this.tournament = tournament
        this.player_uid = player.uid
        this.deck.value = ""
        this.modal.show()
    }
}

class CheckInModal {
    display: TournamentDisplay
    tournament: d.Tournament
    player_uid: string
    round_number: number
    modal_div: HTMLDivElement
    video: HTMLVideoElement
    modal: bootstrap.Modal
    title: HTMLHeadingElement
    qr_scanner: QrScanner
    constructor(el: HTMLDivElement, display: TournamentDisplay) {
        this.display = display
        this.modal_div = base.create_append(el, "div", ["modal", "fade"],
            { tabindex: "-1", "aria-hidden": "true", "aria-labelledby": "scoreModalLabel" }
        )
        const dialog = base.create_append(this.modal_div, "div", ["modal-dialog"])
        const content = base.create_append(dialog, "div", ["modal-content"])
        const header = base.create_append(content, "div", ["modal-header"])
        this.title = base.create_append(header, "h1", ["modal-title", "fs-5"])
        this.title.innerText = "Check-in"
        base.create_append(header, "button", ["btn-close"], { "data-bs-dismiss": "modal", "aria-label": "Close" })
        const body = base.create_append(content, "div", ["modal-body"])
        const help_text = base.create_append(body, "p")
        help_text.innerHTML = 'Scan the Check-in QR Code <i class="bi bi-qr-code"></i>'
        this.video = base.create_append(body, "video", ["w-100"])
        this.modal = new bootstrap.Modal(this.modal_div)
        this.modal_div.addEventListener("shown.bs.modal", (ev) => {
            this.qr_scanner = new QrScanner(
                this.video,
                async (result) => { console.log('decoded qr code:', result); await this.checkin(result.data) },
                { highlightScanRegion: true },
            )
            this.qr_scanner.start()
        })
    }

    async checkin(code: string) {
        await this.display.checkin(this.tournament, this.player_uid, code)
        this.qr_scanner.stop();
        this.qr_scanner.destroy()
        this.modal.hide()
    }

    show(tournament: d.Tournament, player: d.Player) {
        this.tournament = tournament
        this.player_uid = player.uid
        this.modal.show()
    }
}

export class TournamentDisplay {
    root: HTMLDivElement
    included: boolean
    score_modal: ScoreModal | undefined
    deck_modal: DeckModal | undefined
    checkin_modal: CheckInModal | undefined
    countries: d.Country[]
    token: base.Token
    user_id: string
    members_map: member.MemberMap
    alert: HTMLDivElement
    // form inputs
    name: HTMLInputElement
    format: HTMLSelectElement
    rank: HTMLSelectElement
    proxies: HTMLInputElement
    proxies_label: HTMLLabelElement
    multideck: HTMLInputElement
    multideck_label: HTMLLabelElement
    decklist_required: HTMLInputElement
    decklist_required_label: HTMLLabelElement
    online: HTMLInputElement
    venue: HTMLInputElement
    country: HTMLSelectElement
    venue_url: HTMLInputElement
    address: HTMLInputElement
    map_url: HTMLInputElement
    start: HTMLInputElement
    finish: HTMLInputElement
    timezone: HTMLSelectElement
    description: HTMLTextAreaElement
    judges: Set<string>
    constructor(root: HTMLDivElement, included: boolean = false) {
        this.root = base.create_append(root, "div")
        this.included = included
        if (!included) {
            this.score_modal = new ScoreModal(root, this)
            this.deck_modal = new DeckModal(root, this)
            this.checkin_modal = new CheckInModal(root, this)
        }
    }
    async init(
        token: base.Token | undefined = undefined,
        members_map: member.MemberMap | undefined = undefined,
        countries: d.Country[] | undefined = undefined,
    ) {
        this.token = token
        if (this.token) {
            this.user_id = JSON.parse(window.atob(token.access_token.split(".")[1]))["sub"]
            this.judges = new Set([this.user_id])
        }
        if (countries) {
            this.countries = countries
        } else {
            const res = await base.do_fetch("/api/vekn/country", {})
            this.countries = await res.json() as d.Country[]
        }
        if (members_map) {
            this.members_map = members_map
        } else if (this.user_id) {
            this.members_map = new member.MemberMap()
            await this.members_map.init(token)
        }
    }
    set_alert(message: string, level: d.AlertLevel) {
        if (!this.alert) { return }
        this.alert.innerText = message
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
    async display(tournament: d.Tournament) {
        base.remove_children(this.root)
        if (!this.included) {
            this.alert = base.create_append(this.root, "div", ["alert"], { role: "alert" })
        }
        this.judges = new Set(tournament.judges)
        // ----------------------------------------------------------------------------------------------------- User ID
        if (this.user_id && Object.hasOwn(tournament.players, this.user_id)) {
            const player = tournament.players[this.user_id]
            if (player.state != d.PlayerState.FINISHED) {
                this.set_alert("You are registered for this tournament", d.AlertLevel.SUCCESS)
            }
        }
        // ------------------------------------------------------------------------------------------------------- Title
        if (!this.included) {
            base.create_append(this.root, "h1", ["mb-2"]).innerText = tournament.name
        }
        // ----------------------------------------------------------------------------------------------------- Buttons
        const buttons_div = base.create_append(this.root, "div", ["d-sm-flex", "mt-4", "mb-2"])
        if (this.included) {
            const edit_button = base.create_append(buttons_div, "button", ["btn", "btn-primary", "me-2", "mb-2"])
            edit_button.innerText = "Edit"
            edit_button.addEventListener("click", (ev) => this.display_form(tournament))
            const download_button = base.create_append(buttons_div, "a", ["btn", "btn-primary", "mb-2"],
                { role: "button" }
            )
            download_button.innerHTML = '<i class="bi bi-download"></i> Download'
            download_button.href = "data:application/yaml;charset=utf-8;base64," + Base64.encode(stringify(tournament))
            download_button.download = `${tournament.name}.txt`
        } else if (this.user_id && tournament.judges.includes(this.user_id)) {
            base.create_append(buttons_div, "a", ["btn", "btn-primary", "me-2", "mb-2"],
                { href: `/tournament/${tournament.uid}/console.html` }
            ).innerText = "Console"
        }
        // ------------------------------------------------------------------------------------------------------ Badges
        const badges_div = base.create_append(this.root, "div", ["mt-2", "d-md-flex"])
        base.create_append(badges_div, "span",
            ["me-2"]
        ).innerText = `${Object.getOwnPropertyNames(tournament.players).length} contenders`
        const status_badge = base.create_append(badges_div, "span", ["me-2", "mb-2", "badge"])
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
        const format_badge = base.create_append(badges_div, "span", ["me-2", "mb-2", "badge"])
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
            const rank_badge = base.create_append(badges_div, "span", ["me-2", "mb-2", "badge"])
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
            base.create_append(badges_div, "span",
                ["me-2", "mb-2", "badge", "bg-info", "text-dark"]
            ).innerText = "Online"
        }
        if (tournament.proxies) {
            base.create_append(badges_div, "span",
                ["me-2", "badge", "bg-info", "text-dark"]
            ).innerText = "Proxies Allowed"
        } else {
            base.create_append(badges_div, "span", ["me-2", "mb-2", "badge", "bg-secondary"]).innerText = "No Proxy"
        }
        if (tournament.multideck) {
            base.create_append(badges_div, "span",
                ["me-2", "mb-2", "badge", "bg-info", "text-dark"]
            ).innerText = "Multideck"
        } else {
            base.create_append(badges_div, "span", ["me-2", "mb-2", "badge", "bg-secondary"]).innerText = "Single Deck"
        }
        if (tournament.decklist_required) {
            base.create_append(badges_div, "span",
                ["me-2", "mb-2", "badge", "bg-info", "text-dark"]
            ).innerText = "Decklist required"
        }
        // ------------------------------------------------------------------------------------------------- Date & Time
        const datetime_div = base.create_append(this.root, "div", ["d-md-flex", "mb-2"])
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
            base.create_append(this.root, "h2", ["mt-5", "mb-1"]).innerText = "Venue"
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
        // ------------------------------------------------------------------------------------------------------ Judges
        if (this.user_id) {
            const table = base.create_append(this.root, "table", ["table", "table-striped", "my-2"])
            const head = base.create_append(table, "thead")
            const row = base.create_append(head, "tr")
            for (const label of ["Judges", "", ""]) {
                const cel = base.create_append(row, "th", [], { scope: "col" })
                cel.innerText = label
            }

            const body = base.create_append(table, "tbody")
            for (const judge_uid of this.judges.values()) {
                const member = this.members_map.by_uid.get(judge_uid)
                body.append(this.create_judge_row(member, false))
            }
        }
        // ------------------------------------------------------------------------------------------------- Description
        if (tournament.description) {
            const description_div = base.create_append(this.root, "div", ["mt-5", "mb-1"])
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
        // ----------------------------------------------------------------------------------------------- User Commands
        if (!this.included && this.user_id && tournament.state != d.TournamentState.FINISHED) {
            const current_round = tournament.rounds.length
            var status: string
            switch (tournament.state) {
                case d.TournamentState.REGISTRATION:
                    if (current_round > 0) {
                        status = `Round ${current_round} finished`
                    } else {
                        status = "Registrations open, waiting for check-in"
                    }
                    break;
                case d.TournamentState.WAITING:
                    status = `Round ${current_round + 1} begins soon`
                    break;
                case d.TournamentState.PLAYING:
                    status = `Round ${current_round} in progress`
                    break;
                case d.TournamentState.FINALS:
                    status = `Finals in progress`
                    break;
            }
            const status_title = base.create_append(this.root, "h2", ["my-2"])
            status_title.innerText = status
            const buttons_div = base.create_append(this.root, "div", ["d-sm-flex", "align-items-center", "my-2"])
            if (Object.hasOwn(tournament.players, this.user_id)) {
                const player = tournament.players[this.user_id]
                if (tournament.multideck || tournament.rounds.length < 1) {
                    const upload_deck_button = base.create_append(buttons_div, "button", ["btn", "btn-primary", "me-2"])
                    if (tournament.multideck) {
                        upload_deck_button.innerText = `Upload Deck for round ${current_round + 1}`
                    } else {
                        upload_deck_button.innerText = "Upload Deck"
                    }
                    const tooltip = base.add_tooltip(upload_deck_button,
                        "You can re-upload a new version anytime before the tournament begins"
                    )
                    upload_deck_button.addEventListener("click", (ev) => {
                        tooltip.hide()
                        this.deck_modal.show(tournament, player)
                    })
                }
                if (tournament.multideck && player.state == d.PlayerState.PLAYING) {
                    const player_seat = tournament.rounds.at(-1).tables.at(player.table - 1).seating.at(player.seat - 1)
                    if (player_seat.deck?.vdb_link) {
                        const deck_link = base.create_append(buttons_div, "a", ["btn", "btn-vdb", "bg-vdb", "me-2"],
                            { target: "_blank" }
                        )
                        deck_link.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="align-top me-1" style="width:1.5em;" version="1.0" viewBox="0 0 270 270"><path d="M62 186c-9-9-13-13-15-19-3-10 0-33 12-74l4-13 1 11c1 38 3 49 12 56 3 3 5 3 9 3l7-4c4-5 7-14 8-24a465 465 0 0 0-1-54 443 443 0 0 1 27 76c0 1-1 2-6 3l-6 4-24 23-20 20zm108-10c-2-1-2-3-3-8-2-7-3-11-9-21-15-29-19-38-22-46-2-8-3-22-1-28 2-7 7-15 18-26a185 185 0 0 1 26-20l-5 11c-8 16-10 23-10 34 0 13 3 21 10 28 7 6 12 9 17 8 4-1 9-7 14-15 3-6 8-24 12-44l2-12 4 13c5 20 4 39-3 51-2 5-8 10-16 16-17 13-25 22-28 33a190 190 0 0 0-5 27l-1-1zm28 23c-4-4-4-4-4-13a276 276 0 0 0-1-36c0-4 2-8 9-16l16-15c1 0 1 2-3 9l-5 20c0 6 0 7 5 8 3 1 9 0 12-2 5-3 9-10 13-22l2-5v5c-1 9-5 25-9 31-2 4-6 8-9 10l-8 3-7 3c-2 2-4 8-6 16l-2 6-3-2zm68 55a616 616 0 0 0-32-26l5-2c5-2 7-4 9-8l6-20c1-8 1-14-2-23-2-9-3-16-2-21a71 71 0 0 1 26-41l-2 8c-3 10-4 14-4 21 0 12 3 16 11 20 3 2 4 2 10 2 5 0 6 0 9-2 9-4 15-12 20-26 2-6 4-14 4-19l1-2c2 5 4 20 4 33 0 15-2 23-5 28s-6 6-21 11-22 8-26 11c-4 2-5 4-7 8v26l-1 25-3-3z" style="fill:red;stroke-width:.537313;fill-opacity:1" transform="scale(.75)"/><path d="M184 333c-11-7-83-64-118-94-12-9-12-10-9-14l64-65c5-4 5-4 22 10a10369 10369 0 0 1 117 95c1 2 1 2-2 5-6 9-58 62-63 65-4 3-5 3-11-2z" style="fill:#FFFFFF;stroke-width:.537313;fill-opacity:1" transform="scale(.75)"/></svg>'
                        deck_link.innerHTML += `Round ${current_round} decklist`
                        deck_link.href = player.deck.vdb_link
                    }
                } else if (player.deck && player.deck.vdb_link) {
                    const deck_link = base.create_append(buttons_div, "a", ["btn", "btn-vdb", "bg-vdb", "me-2"],
                        { target: "_blank" }
                    )
                    deck_link.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="align-top me-1" style="width:1.5em;" version="1.0" viewBox="0 0 270 270"><path d="M62 186c-9-9-13-13-15-19-3-10 0-33 12-74l4-13 1 11c1 38 3 49 12 56 3 3 5 3 9 3l7-4c4-5 7-14 8-24a465 465 0 0 0-1-54 443 443 0 0 1 27 76c0 1-1 2-6 3l-6 4-24 23-20 20zm108-10c-2-1-2-3-3-8-2-7-3-11-9-21-15-29-19-38-22-46-2-8-3-22-1-28 2-7 7-15 18-26a185 185 0 0 1 26-20l-5 11c-8 16-10 23-10 34 0 13 3 21 10 28 7 6 12 9 17 8 4-1 9-7 14-15 3-6 8-24 12-44l2-12 4 13c5 20 4 39-3 51-2 5-8 10-16 16-17 13-25 22-28 33a190 190 0 0 0-5 27l-1-1zm28 23c-4-4-4-4-4-13a276 276 0 0 0-1-36c0-4 2-8 9-16l16-15c1 0 1 2-3 9l-5 20c0 6 0 7 5 8 3 1 9 0 12-2 5-3 9-10 13-22l2-5v5c-1 9-5 25-9 31-2 4-6 8-9 10l-8 3-7 3c-2 2-4 8-6 16l-2 6-3-2zm68 55a616 616 0 0 0-32-26l5-2c5-2 7-4 9-8l6-20c1-8 1-14-2-23-2-9-3-16-2-21a71 71 0 0 1 26-41l-2 8c-3 10-4 14-4 21 0 12 3 16 11 20 3 2 4 2 10 2 5 0 6 0 9-2 9-4 15-12 20-26 2-6 4-14 4-19l1-2c2 5 4 20 4 33 0 15-2 23-5 28s-6 6-21 11-22 8-26 11c-4 2-5 4-7 8v26l-1 25-3-3z" style="fill:red;stroke-width:.537313;fill-opacity:1" transform="scale(.75)"/><path d="M184 333c-11-7-83-64-118-94-12-9-12-10-9-14l64-65c5-4 5-4 22 10a10369 10369 0 0 1 117 95c1 2 1 2-2 5-6 9-58 62-63 65-4 3-5 3-11-2z" style="fill:#FFFFFF;stroke-width:.537313;fill-opacity:1" transform="scale(.75)"/></svg>'
                    deck_link.innerHTML += "See your decklist"
                    deck_link.href = player.deck.vdb_link
                }
                if (player.state != d.PlayerState.FINISHED) {
                    const drop_button = base.create_append(buttons_div, "button", ["btn", "btn-danger", "me-2"])
                    drop_button.innerHTML = '<i class="bi bi-x-circle-fill"></i> Drop from the tournament'
                    const tooltip = base.add_tooltip(drop_button, "Let the organizers know you are leaving")
                    drop_button.addEventListener("click", (ev) => { tooltip.hide(); this.drop(tournament, player) })

                }
                if (tournament.state == d.TournamentState.WAITING && player.state == d.PlayerState.REGISTERED) {
                    this.set_alert(
                        "You need to check in to play the next round. If you do not check in, you won't be seated.",
                        d.AlertLevel.WARNING
                    )
                    const tooltip_span = base.create_append(buttons_div, "span", [], { tabindex: "0" })
                    const checkin_button = base.create_append(tooltip_span, "button", ["btn", "btn-primary", "me-2"])
                    checkin_button.innerHTML = '<i class="bi bi-qr-code-scan"> Check In</i>'
                    checkin_button.addEventListener("click", (ev) => this.checkin_modal.show(tournament, player))
                    if (player.barriers.length > 0) {
                        checkin_button.disabled = true
                        var tooltip: string
                        switch (player.barriers[0]) {
                            case d.Barrier.BANNED:
                                tooltip = "You have been banned from tournament play"
                                this.set_alert(tooltip, d.AlertLevel.DANGER)
                                break;
                            case d.Barrier.DISQUALIFIED:
                                tooltip = "You have been disqualified"
                                this.set_alert(tooltip, d.AlertLevel.DANGER)
                                break;
                            case d.Barrier.MAX_ROUNDS:
                                tooltip = "You have played the maximum number of rounds"
                                this.set_alert(tooltip, d.AlertLevel.INFO)
                                break;
                            case d.Barrier.MISSING_DECK:
                                tooltip = "You must record your deck list"
                                this.set_alert(tooltip, d.AlertLevel.WARNING)
                                break;
                        }
                        base.add_tooltip(tooltip_span, tooltip)
                    } else {
                        checkin_button.disabled = false
                    }
                }
                else if (player.state == d.PlayerState.CHECKED_IN) {
                    this.set_alert(`You are ready to play`, d.AlertLevel.SUCCESS)
                }
                else if (player.state == d.PlayerState.PLAYING) {
                    const player_table = tournament.rounds[current_round - 1].tables[player.table - 1]
                    const table_div = base.create_append(this.root, "div")
                    if (tournament.state == d.TournamentState.FINALS) {
                        this.set_alert("You play the finals", d.AlertLevel.SUCCESS)
                    } else {
                        this.set_alert(`You play on table ${player.table}, seat ${player.seat}`, d.AlertLevel.SUCCESS)
                        status_title.innerText += ` — Your table: Table ${player.table}`
                    }
                    const table = base.create_append(table_div, "table", ["table"])
                    const head = base.create_append(table, "thead")
                    const tr = base.create_append(head, "tr")
                    var headers = ["Seat", "VEKN#", "Name", "Score", ""]
                    if (tournament.state == d.TournamentState.FINALS) {
                        headers = ["Seed", "VEKN#", "Name", "Score"]
                    }
                    for (const label of headers) {
                        const th = base.create_append(tr, "th", [], { scope: "col" })
                        th.innerText = label
                    }
                    const body = base.create_append(table, "tbody")
                    var player_seat: d.TableSeat
                    for (const [idx, seat] of player_table.seating.entries()) {
                        const seat_player = tournament.players[seat.player_uid]
                        const row = base.create_append(body, "tr", ["align-middle"])
                        var cell_cls = ["text-nowrap"]
                        var name_cls = ["w-100"]
                        if (player.uid == seat_player.uid) {
                            player_seat = seat
                            cell_cls.push("bg-primary-subtle")
                            name_cls.push("bg-primary-subtle")
                        }
                        if (tournament.state == d.TournamentState.FINALS) {
                            base.create_append(row, "td", cell_cls).innerHTML = full_score_string(seat_player)
                            base.create_append(row, "td", cell_cls).innerText = seat_player.vekn
                        } else {
                            base.create_append(row, "th", cell_cls, { scope: "row" }).innerText = (idx + 1).toString()
                            base.create_append(row, "td", cell_cls).innerText = seat_player.vekn
                        }
                        base.create_append(row, "td", name_cls).innerText = seat_player.name
                        if (seat) {
                            base.create_append(row, "td", cell_cls).innerText = score_string(seat.result)
                            const actions = base.create_append(row, "td", cell_cls)
                            const changeButton = base.create_append(actions, "button",
                                ["me-2", "btn", "btn-sm", "btn-primary"]
                            )
                            changeButton.innerHTML = '<i class="bi bi-pencil"></i>'
                            changeButton.addEventListener("click", (ev) => {
                                this.score_modal.show(tournament, seat_player, current_round, seat.result.vp)
                            })
                        }
                    }
                    if (player_seat && tournament.state != d.TournamentState.FINALS) {
                        const report_button = base.create_append(buttons_div, "button", ["btn", "btn-primary", "my-2"])
                        report_button.innerText = "Report Score"
                        report_button.addEventListener("click",
                            (ev) => this.score_modal.show(tournament, player, current_round, player_seat.result.vp)
                        )
                    }
                }
            }
            else if (tournament.state != d.TournamentState.FINALS) {
                const member = this.members_map.by_uid.get(this.user_id)
                if (member && member.vekn.length > 0) {
                    const register_button = base.create_append(buttons_div, "button", ["btn", "btn-primary", "my-2"])
                    register_button.innerText = "Register"
                    register_button.addEventListener("click", (ev) => this.register(tournament, member))
                } else {
                    const message = base.create_append(this.root, "p")
                    message.innerText = (
                        "A VEKN ID# is required to register to this event.\n" +
                        "Claim your VEKN ID# if you have one, you can do it in your Profile.\n" +
                        "If you don't, ask a Judge or an organizer to register you."
                    )
                }
            }
        }
        // --------------------------------------------------------------------------------------------------- Standings
        if (this.user_id &&
            (tournament.state == d.TournamentState.FINALS || tournament.state == d.TournamentState.FINISHED)
        ) {
            const table = base.create_append(this.root, "table", ["table", "table-striped"])
            const thead = base.create_append(table, "thead")
            const tr = base.create_append(thead, "tr")
            for (const header of ["Rank", "VEKN #", "Name", "City", "Country", "Score"]) {
                base.create_append(tr, "th", [], { scope: "col" }).innerText = header
            }
            const tbody = base.create_append(table, "tbody")
            for (const [rank, player] of standings(tournament)) {
                const tr = base.create_append(tbody, "tr")
                const classes = ["text-nowrap"]
                if (rank == 1 && tournament.state == d.TournamentState.FINISHED) {
                    classes.push("bg-warning-subtle")
                } else if (player.uid == this.user_id) {
                    classes.push("bg-primary-subtle")
                }
                base.create_append(tr, "th", classes, { scope: "row" }).innerText = rank.toString()
                base.create_append(tr, "td", classes).innerText = player.vekn
                base.create_append(tr, "td", classes).innerText = player.name
                base.create_append(tr, "td", classes).innerText = player.city
                base.create_append(tr, "td", classes).innerText = player.country
                base.create_append(tr, "td", classes).innerHTML = score_string(player.result)
            }
        }
    }
    async handle_tournament_event(tid: string, tev: events.TournamentEvent) {
        console.log("handle event", tev)
        // TODO: implement offline mode
        const res = await base.do_fetch(
            `/api/tournaments/${tid}/event`, {
            method: "post",
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.token.access_token}`
            },
            body: JSON.stringify(tev)
        }
        )
        if (!res) { return }
        const response = await res.json()
        console.log(response)
        await this.display(response)
        return response
    }
    async checkin(tournament: d.Tournament, user_id: string, code: string | undefined = undefined) {
        const tev = {
            uid: uuid.v4(),
            type: events.EventType.CHECK_IN,
            player_uid: user_id,
        } as events.CheckIn
        if (code) {
            tev.code = code
        }
        await this.handle_tournament_event(tournament.uid, tev)
    }
    async drop(tournament: d.Tournament, player: d.Player) {
        const tev = {
            uid: uuid.v4(),
            type: events.EventType.DROP,
            player_uid: player.uid,
        } as events.Drop
        await this.handle_tournament_event(tournament.uid, tev)
    }
    async set_score(tournament: d.Tournament, player_uid: string, round_number: number, score: number) {
        const tev = {
            uid: uuid.v4(),
            type: events.EventType.SET_RESULT,
            player_uid: player_uid,
            round: round_number,
            vps: score,
        } as events.SetResult
        await this.handle_tournament_event(tournament.uid, tev)
    }
    async set_deck(tournament: d.Tournament, player_uid: string, deck: string) {
        const tev = {
            uid: uuid.v4(),
            type: events.EventType.SET_DECK,
            player_uid: player_uid,
            deck: deck,
        } as events.SetDeck
        const ret = await this.handle_tournament_event(tournament.uid, tev)
        if (ret) {
            const alert = base.create_prepend(this.root, "div",
                ["alert", "alert-warning", "alert-dismissible", "fade", "show"],
                { role: "alert" }
            )
            base.create_prepend(alert, "i", ["bi", "bi-exclamation-triangle-fill"])
            alert.innerText = "A snapshot of your deck has been saved. If you change it, you need to upload it anew."
            base.create_append(alert, "button", ["btn-close"], { "data-bs-dismiss": "alert", "aria-label": "Close" })
        }
    }
    async register(tournament: d.Tournament, member: d.Member) {
        const tev = {
            uid: uuid.v4(),
            type: events.EventType.REGISTER,
            name: member.name,
            vekn: member.vekn,
            player_uid: member.uid,
            country: member.country,
            city: member.city,
        } as events.Register
        await this.handle_tournament_event(tournament.uid, tev)
    }
    async display_form(tournament: d.Tournament | undefined) {
        base.remove_children(this.root)
        const form = base.create_append(this.root, "form", ["row", "g-3", "mt-3"])
        form.addEventListener("submit", (ev) => this.submit_tournament(ev, tournament))
        // ------------------------------------------------------------------------------------------------------ line 1
        { // name
            const div = base.create_append(form, "div", ["col-md-6"])
            this.name = base.create_append(div, "input", ["form-control"],
                { type: "text", name: "name", placeholder: "Tournament Name", autocomplete: "off", spellcheck: "false" }
            )
            if (tournament?.name && tournament.name.length > 0) {
                this.name.value = tournament.name
            }
            this.name.ariaAutoComplete = "none"
            this.name.required = true
        }
        { // format
            const div = base.create_append(form, "div", ["col-md-3"])
            this.format = base.create_append(div, "select", ["form-select"], { name: "format" })
            this.format.required = true
            for (const value of Object.values(d.TournamentFormat)) {
                const option = base.create_append(this.format, "option")
                option.innerText = value
                option.value = value
            }
            if (tournament) {
                this.format.value = tournament.format
            } else {
                this.format.value = d.TournamentFormat.Standard
            }
            this.format.addEventListener("change", (ev) => this.select_format())
        }
        { // rank
            const div = base.create_append(form, "div", ["col-md-3"])
            this.rank = base.create_append(div, "select", ["form-select"], { name: "rank" })
            for (const value of Object.values(d.TournamentRank)) {
                const option = base.create_append(this.rank, "option")
                option.innerText = value
                option.value = value
                if (tournament?.rank == value) {
                    option.selected = true
                } else {
                    option.selected = false
                }
            }
            if (tournament) {
                this.rank.value = tournament.rank
            } else {
                this.rank.value = d.TournamentRank.BASIC
            }
            if (this.format.value != d.TournamentFormat.Standard) {
                this.rank.value = d.TournamentRank.BASIC
                this.rank.disabled = true
            }
            this.rank.addEventListener("change", (ev) => this.select_rank())
        }
        // ------------------------------------------------------------------------------------------------------ line 2
        { // proxies
            const div = base.create_append(form, "div", ["col-md-3", "d-flex", "align-items-center"])
            const field_div = base.create_append(div, "div", ["form-check", "form-switch"])
            this.proxies = base.create_append(field_div, "input", ["form-check-input"],
                { type: "checkbox", name: "proxies", id: "switchProxy" }
            )
            this.proxies_label = base.create_append(field_div, "label", ["form-check-label"], { for: "switchProxy" })
            if (tournament?.proxies) {
                this.proxies.checked = true
                this.proxies_label.innerText = "Proxies allowed"
            } else {
                this.proxies.checked = false
                this.proxies_label.innerText = "No proxy"
            }
            if (this.rank.value != d.TournamentRank.BASIC || tournament?.online) {
                this.proxies.checked = false
                this.proxies_label.innerText = "No proxy"
                this.proxies.disabled = true
            }
            this.proxies.addEventListener("change", (ev) => this.switch_proxies())
        }
        { // multideck
            const div = base.create_append(form, "div", ["col-md-3", "d-flex", "align-items-center"])
            const field_div = base.create_append(div, "div", ["form-check", "form-switch"])
            this.multideck = base.create_append(field_div, "input", ["form-check-input"],
                { type: "checkbox", name: "multideck", id: "switchMultideck" }
            )
            this.multideck_label = base.create_append(field_div, "label", ["form-check-label"],
                { for: "switchMultideck" }
            )
            if (tournament?.multideck) {
                this.multideck.checked = true
                this.multideck_label.innerText = "Multideck"
            } else {
                this.multideck.checked = false
                this.multideck_label.innerText = "Single deck"
            }
            if (this.rank.value != d.TournamentRank.BASIC) {
                this.multideck.checked = false
                this.multideck.innerText = "Single deck"
                this.multideck.disabled = true
            }
            this.multideck.addEventListener("change", (ev) => this.switch_multideck())
        }
        { // decklist
            const div = base.create_append(form, "div", ["col-md-3", "d-flex", "align-items-center"])
            const field_div = base.create_append(div, "div", ["form-check", "form-switch"])
            this.decklist_required = base.create_append(field_div, "input", ["form-check-input"],
                { type: "checkbox", name: "decklist_required", id: "switchDecklistRequired" }
            )
            this.decklist_required_label = base.create_append(field_div, "label", ["form-check-label"],
                { for: "switchDecklistRequired" }
            )
            if (!tournament || tournament.decklist_required) {
                this.decklist_required.checked = true
                this.decklist_required_label.innerText = "Decklist required"
            } else {
                this.decklist_required.checked = false
                this.decklist_required_label.innerText = "Decklist optional"
            }
            if (this.multideck.checked) {
                this.decklist_required.checked = false
                this.decklist_required.disabled = true
                this.decklist_required_label.innerText = "Decklist optional"
            }
            this.decklist_required.addEventListener("change", (ev) => this.switch_decklist_required())
        }
        // filler
        base.create_append(form, "div", ["w-100"])
        // ------------------------------------------------------------------------------------------------------ line 3
        { // online
            const div = base.create_append(form, "div", ["col-md-2", "d-flex", "align-items-center"])
            const field_div = base.create_append(div, "div", ["form-check", "form-switch"])
            this.online = base.create_append(field_div, "input", ["form-check-input"],
                { type: "checkbox", name: "online", id: "switchOnline" }
            )
            base.create_append(field_div, "label", ["form-check-label"], { for: "switchOnline" }).innerText = "Online"
            this.online.addEventListener("change", (ev) => this.switch_online())
            if (tournament?.online) {
                this.online.checked = true
            } else {
                this.online.checked = false
            }
        }
        { // venue
            const div = base.create_append(form, "div", ["col-md-6"])
            this.venue = base.create_append(div, "input", ["form-control"],
                { type: "text", name: "venue", placeholder: "Venue", autocomplete: "off", spellcheck: "false" }
            )
            this.venue.ariaLabel = "Venue"
            this.venue.ariaAutoComplete = "none"
            if (tournament?.venue && tournament.venue.length > 0) {
                this.venue.value = tournament.venue
            }
        }
        { // country
            const div = base.create_append(form, "div", ["col-md-4"])
            this.country = base.create_append(div, "select", ["form-select"], { name: "country" })
            this.country.ariaLabel = "Country"
            this.country.options.add(base.create_element("option", [], { value: "", label: "Country" }))
            for (const country of this.countries) {
                const option = document.createElement("option")
                option.value = country.country
                option.label = country.country
                this.country.options.add(option)
                if (tournament?.country == country.country) {
                    option.selected = true
                }
            }
            if (tournament?.online) {
                this.country.selectedIndex = 0
                this.country.disabled = true
                this.country.required = false
            } else {
                this.country.required = true
            }
        }
        // ------------------------------------------------------------------------------------------------------ line 4
        { // venue_url
            const div = base.create_append(form, "div", ["col-md-4"])
            const group = base.create_append(div, "div", ["input-group"])
            base.create_append(group, "i", ["input-group-text", "bi", "bi-link-45deg"])
            this.venue_url = base.create_append(group, "input", ["form-control"],
                { type: "text", name: "venue_url", placeholder: "Venue URL", autocomplete: "off", spellcheck: "false" }
            )
            this.venue_url.ariaLabel = "Venue URL"
            this.venue_url.ariaAutoComplete = "none"
            if (tournament?.venue_url && tournament.venue_url.length > 0) {
                this.venue_url.value = tournament.venue_url
            }
        }
        { // address
            const div = base.create_append(form, "div", ["col-md-4"])
            this.address = base.create_append(div, "input", ["form-control"],
                { type: "text", name: "address", placeholder: "Address", autocomplete: "off", spellcheck: "false" }
            )
            this.address.ariaLabel = "Address"
            this.address.ariaAutoComplete = "none"
            if (tournament?.address && tournament.address.length > 0) {
                this.address.value = tournament.address
            }
            if (tournament?.online) {
                this.address.value = ""
                this.address.disabled = true
            }
        }
        { // map_url
            const div = base.create_append(form, "div", ["col-md-4"])
            const group = base.create_append(div, "div", ["input-group"])
            base.create_append(group, "i", ["input-group-text", "bi", "bi-geo-alt-fill"])
            this.map_url = base.create_append(group, "input", ["form-control"],
                { type: "text", name: "map_url", placeholder: "Map URL", autocomplete: "off", spellcheck: "false" }
            )
            this.map_url.ariaLabel = "Address"
            this.map_url.ariaAutoComplete = "none"
            if (tournament?.map_url && tournament.map_url.length > 0) {
                this.map_url.value = tournament.map_url
            }
            if (tournament?.online) {
                this.map_url.value = ""
                this.map_url.disabled = true
            }
        }
        // ------------------------------------------------------------------------------------------------------ line 5
        { // start
            const div = base.create_append(form, "div", ["col-md-4"])
            const group = base.create_append(div, "div", ["input-group", "form-floating"], { id: "pickerStart" })
            group.dataset.tdTargetInput = "nearest"
            group.dataset.tdTargetToggle = "nearest"
            this.start = base.create_append(group, "input", ["form-control"], {
                id: "tournamentStart",
                type: "text",
                name: "start",
                autocomplete: "off",
                spellcheck: "false"
            })
            this.start.ariaLabel = "Start"
            this.start.ariaAutoComplete = "none"
            this.start.dataset.tdTarget = "#pickerStart"
            base.create_append(group, "label", ["form-label"], { for: "tournamentStart" }).innerText = "Start"
            const span = base.create_append(group, "span", ["input-group-text"])
            span.dataset.tdTarget = "#pickerStart"
            span.dataset.tdToggle = "datetimepicker"
            base.create_append(span, "i", ["bi", "bi-calendar"])
            if (tournament?.start && tournament.start.length > 0) {
                this.start.value = tournament.start
            }
            new tempusDominus.TempusDominus(group, {
                display: { icons: biOneIcons },
                localization: { format: "yyyy-MM-dd HH:mm", hourCycle: "h23" },
                stepping: 15,
                promptTimeOnDateChange: true
            })
        }
        { // finish
            const div = base.create_append(form, "div", ["col-md-4"])
            const group = base.create_append(div, "div", ["input-group", "form-floating"], { id: "pickerFinish" })
            group.dataset.tdTargetInput = "nearest"
            group.dataset.tdTargetToggle = "nearest"
            this.finish = base.create_append(group, "input", ["form-control"], {
                id: "tournamentFinish",
                type: "text",
                name: "finish",
                autocomplete: "off",
                spellcheck: "false"
            })
            this.finish.ariaLabel = "Finish"
            this.finish.ariaAutoComplete = "none"
            this.finish.dataset.tdTarget = "#pickerFinish"
            base.create_append(group, "label", ["form-label"], { for: "tournamentFinish" }).innerText = "Finish"
            const span = base.create_append(group, "span", ["input-group-text"])
            span.dataset.tdTarget = "#pickerFinish"
            span.dataset.tdToggle = "datetimepicker"
            base.create_append(span, "i", ["bi", "bi-calendar"])
            if (tournament?.finish && tournament.finish.length > 0) {
                this.finish.value = tournament.finish
            }
            new tempusDominus.TempusDominus(group, {
                display: { icons: biOneIcons },
                localization: { format: "yyyy-MM-dd HH:mm", hourCycle: "h23" },
                stepping: 15,
                promptTimeOnDateChange: true
            })
        }
        { // timezone
            const div = base.create_append(form, "div", ["col-md-4"])
            const group = base.create_append(div, "div", ["input-group", "form-floating"])
            this.timezone = base.create_append(group, "select", ["form-select"],
                { id: "timezoneSelect", name: "timezone" }
            )
            this.timezone.ariaLabel = "Timezone"
            base.create_append(group, "label", ["form-label"], { for: "timezoneSelect" }).innerText = "Timezone"
            const browser_timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
            for (const tz of Intl.supportedValuesOf('timeZone')) {
                const option = document.createElement("option") as HTMLOptionElement
                option.value = tz
                option.label = tz
                if (tournament?.timezone && tournament.timezone.length > 0) {
                    if (tz == tournament.timezone) {
                        option.selected = true
                    }
                }
                else if (tz == browser_timezone) {
                    option.selected = true
                }
                this.timezone.append(option)
            }
        }
        // ------------------------------------------------------------------------------------------------------ line 6
        {
            const div = base.create_append(form, "div", ["position-relative", "col-12"])
            this.description = base.create_append(div, "textarea", ["form-control"],
                { rows: "8", name: "description", placeholder: "Description" }
            )
            const mardown_link = base.create_append(div, "a",
                ["btn", "btn-sm", "btn-outline-primary", "mb-2", "me-3", "position-absolute", "bottom-0", "end-0"],
                { href: "https://www.markdownguide.org/basic-syntax/", target: "_blank" }
            )
            mardown_link.innerText = "Markdown"
            base.create_append(mardown_link, "i", ["bi", "bi-question-circle-fill"])
            if (tournament?.description && tournament.description.length > 0) {
                console.log(tournament.description)
                this.description.value = tournament.description
            }
        }
        // ------------------------------------------------------------------------------------------------------ Judges
        {
            const table = base.create_append(form, "table", ["table", "table-striped", "my-2"])
            const head = base.create_append(table, "thead")
            const row = base.create_append(head, "tr")
            for (const label of ["Judges", "", ""]) {
                const cel = base.create_append(row, "th", [], { scope: "col" })
                cel.innerText = label
            }

            const body = base.create_append(table, "tbody")
            for (const judge_uid of this.judges.values()) {
                const member = this.members_map.by_uid.get(judge_uid)
                body.append(this.create_judge_row(member, true))
            }
            const lookup_row = base.create_append(body, "tr", [])
            const lookup_cell = base.create_append(body, "td", [], { colspan: "3" })
            const lookup = new member.PersonLookup(this.members_map, lookup_cell, "Add Judge", true)
            lookup.form.addEventListener("submit", (ev) => {
                ev.preventDefault()
                const person = lookup.person
                lookup.reset()
                if (this.judges.has(person.uid)) { return }
                this.judges.add(person.uid)
                body.insertBefore(this.create_judge_row(person, true), lookup_row)
            })
        }
        // ------------------------------------------------------------------------------------------------------ submit
        {
            const div = base.create_append(form, "div", ["col-auto", "mb-2"])
            base.create_append(div, "button", ["btn", "btn-primary", "me-2"], { type: "submit" }).innerText = "Submit"
            const cancel_button = base.create_append(div, "button", ["btn", "btn-secondary", "me-2"],
                { type: "button" }
            )
            cancel_button.innerText = "Cancel"
            if (tournament) {
                cancel_button.addEventListener("click", (ev) => this.display(tournament))
            } else {
                cancel_button.addEventListener("click", (ev) => history.back())
            }
        }
    }

    create_judge_row(member: d.Member, edit: boolean) {
        const row = base.create_element("tr")
        base.create_append(row, "th", [], { scope: "row" }).innerText = member.vekn
        base.create_append(row, "td", ["w-100"]).innerText = member.name
        const actions = base.create_append(row, "td")
        if (edit && this.user_id != member.uid) {
            const button = base.create_append(actions, "button", ["btn", "btn-sm", "btn-danger", "me-2"])
            button.innerHTML = '<i class="bi bi-x-circle-fill"></i>'
            const tip = base.add_tooltip(button, "Remove")
            button.addEventListener("click", (ev) => {
                tip.dispose();
                this.judges.delete(member.uid);
                row.remove()
            })
        }
        return row
    }

    select_format() {
        // Ranks are only available for Standard constructed
        if (this.format.value == d.TournamentFormat.Standard) {
            this.rank.disabled = false
        } else {
            this.rank.value = d.TournamentRank.BASIC
            this.rank.disabled = true
            this.rank.dispatchEvent(new Event('change', { bubbles: true }))
        }
    }

    select_rank() {
        // No proxy and no multideck for national tournaments and above
        if (this.rank.value != d.TournamentRank.BASIC) {
            this.proxies.checked = false
            this.proxies.disabled = true
            this.proxies.dispatchEvent(new Event('change', { bubbles: true }))
            this.multideck.checked = false
            this.multideck.disabled = true
            this.multideck.dispatchEvent(new Event('change', { bubbles: true }))
        }
        else {
            if (!this.online.checked) {
                this.proxies.disabled = false
            }
            this.multideck.disabled = false
        }
    }

    switch_proxies() {
        // Label change between "No Proxy" / "Proxies allowed"
        if (this.proxies.checked) {
            this.proxies_label.innerText = "Proxies allowed"
        }
        else {
            this.proxies_label.innerText = "No Proxy"
        }
    }

    switch_multideck() {
        // Label change between "Multideck" / "Single deck"
        if (this.multideck.checked) {
            this.multideck_label.innerText = "Multideck"
            this.decklist_required.checked = false
            this.decklist_required.disabled = true
            this.decklist_required.dispatchEvent(new Event('change', { bubbles: true }))
        }
        else {
            this.multideck_label.innerText = "Single deck"
            this.decklist_required.disabled = false
        }
    }
    switch_decklist_required() {
        if (this.decklist_required.checked) {
            this.decklist_required_label.innerText = "Decklist required"
        } else {
            this.decklist_required_label.innerText = "Decklist optional"
        }
    }
    switch_online() {
        // No physical venue for online tournaments, pre-fill venue name and URL with official discord
        if (this.online.checked) {
            this.venue.value = "VTES Discord"
            this.venue_url.value = (
                "https://discord.com/servers/vampire-the-eternal-struggle-official-887471681277399091"
            )
            this.country.options.selectedIndex = 0
            this.country.disabled = true
            this.country.required = false
            this.country.dispatchEvent(new Event('change', { bubbles: true }))
            this.proxies.checked = false
            this.proxies.disabled = true
            this.proxies.dispatchEvent(new Event('change', { bubbles: true }))
            this.address.disabled = true
            this.map_url.disabled = true
        } else {
            this.venue.value = ""
            this.venue_url.value = ""
            this.country.disabled = false
            this.country.required = true
            if (this.rank.options.selectedIndex < 1) {
                this.proxies.disabled = false
            }
            this.address.disabled = false
            this.map_url.disabled = false
        }
    }

    async submit_tournament(ev: Event, tournament: d.Tournament | undefined) {
        // create or update tournament
        ev.preventDefault()
        console.log("submitting")
        const tournamentForm = ev.currentTarget as HTMLFormElement
        const data = new FormData(tournamentForm)
        var json_data = Object.fromEntries(data.entries()) as unknown as d.TournamentConfig
        // fix fields that need some fixing
        if (json_data.finish.length < 1) { json_data.finish = undefined }
        json_data.judges = [...this.judges.values()]
        // checkboxes are "on" if checked, non-listed otherwise - do it by hand
        json_data.multideck = this.multideck.checked
        json_data.proxies = this.proxies.checked
        json_data.online = this.online.checked
        json_data.decklist_required = this.decklist_required.checked
        console.log("submitting data", json_data)
        var url = "/api/tournaments/"
        var method = "post"
        if (tournament) {
            // we are in edit mode
            url += `${tournament.uid}/`
            method = "put"
        }
        const res = await base.do_fetch(url, {
            method: method,
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.token.access_token}`
            },
            body: JSON.stringify(json_data)
        })
        if (!res) { return }
        const response = await res.json()
        console.log(response)
        if (tournament) {
            Object.assign(tournament, json_data)
            await this.display(tournament)
        } else {
            window.location.href = response.url
        }
    }
}
