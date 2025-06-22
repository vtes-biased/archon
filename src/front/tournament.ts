import * as d from "./d"
import * as base from "./base"
import * as events from "./events"
import * as member from "./member"
import * as utils from "./utils"
import * as bootstrap from 'bootstrap'
import * as uuid from 'uuid'
import { Base64 } from 'js-base64'
import DOMPurify from 'isomorphic-dompurify'
import { marked, Tokens } from 'marked'
import QrScanner from 'qr-scanner'
import { stringify } from 'yaml'
import * as tempusDominus from '@eonasdan/tempus-dominus'
import { biOneIcons } from '@eonasdan/tempus-dominus/dist/plugins/bi-one'


class ScoreModal {
    display: TournamentDisplay
    tournament: d.Tournament
    player_uid: string
    round_number: number
    modal_div: HTMLDivElement
    modal: bootstrap.Modal
    title: HTMLHeadingElement
    btn_50: HTMLButtonElement
    btn_35: HTMLButtonElement
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
        this.btn_50 = base.create_append(row_1, "button", ["btn", "btn-primary", "me-1", "mb-1"], { type: "button" })
        const row_2 = base.create_append(body, "div", ["d-flex", "flex-row", "align-items-center"])
        const btn_05 = base.create_append(row_2, "button", ["btn", "btn-primary", "me-1", "mb-1"], { type: "button" })
        const btn_15 = base.create_append(row_2, "button", ["btn", "btn-primary", "me-1", "mb-1"], { type: "button" })
        const btn_25 = base.create_append(row_2, "button", ["btn", "btn-primary", "me-1", "mb-1"], { type: "button" })
        this.btn_35 = base.create_append(row_2, "button", ["btn", "btn-primary", "me-1", "mb-1"], { type: "button" })
        btn_00.innerText = "0"
        btn_05.innerText = "0.5"
        btn_10.innerText = "1"
        btn_15.innerText = "1.5"
        btn_20.innerText = "2"
        btn_25.innerText = "2.5"
        btn_30.innerText = "3"
        this.btn_35.innerText = "3.5"
        btn_40.innerText = "4"
        this.btn_50.innerText = "5"
        btn_00.addEventListener("click", (ev) => this.set_score(0))
        btn_05.addEventListener("click", (ev) => this.set_score(0.5))
        btn_10.addEventListener("click", (ev) => this.set_score(1))
        btn_15.addEventListener("click", (ev) => this.set_score(1.5))
        btn_20.addEventListener("click", (ev) => this.set_score(2))
        btn_25.addEventListener("click", (ev) => this.set_score(2.5))
        btn_30.addEventListener("click", (ev) => this.set_score(3))
        this.btn_35.addEventListener("click", (ev) => this.set_score(3.5))
        btn_40.addEventListener("click", (ev) => this.set_score(4))
        this.btn_50.addEventListener("click", (ev) => this.set_score(5))
        this.modal = new bootstrap.Modal(this.modal_div)
    }

    async set_score(score: number) {
        await this.display.set_score(this.tournament, this.player_uid, this.round_number, score)
        this.modal.hide()
    }

    show(tournament: d.Tournament, player: d.Player, round_number: number, table_size: number, vps: number = 0) {
        this.title.innerText = `${player.name} result: round ${round_number}`
        this.tournament = tournament
        this.player_uid = player.uid
        this.round_number = round_number
        if (table_size < 5) {
            this.btn_50.hidden = true
            this.btn_35.hidden = true
        } else {
            this.btn_50.hidden = false
            this.btn_35.hidden = false
        }
        this.modal.show()
    }
}

type DeckSubmitCallback = (player: string, deck: string, round: number | undefined) => Promise<void>

export class DeckSubmit {
    root: HTMLDivElement
    callback: DeckSubmitCallback
    qr_code_button: HTMLButtonElement
    qr_scanner: QrScanner | undefined
    video: HTMLVideoElement
    form: HTMLFormElement
    round_div: HTMLDivElement
    round_select: HTMLSelectElement
    deck_link: HTMLAnchorElement
    deck_div: HTMLDivElement
    deck: HTMLTextAreaElement
    submit_button: HTMLButtonElement
    player_uid: string
    tournament: d.Tournament
    constructor(el: HTMLDivElement, callback: DeckSubmitCallback, modal_div: HTMLDivElement | undefined = undefined) {
        this.root = el
        this.callback = callback
        this.form = base.create_append(this.root, "form", ["w-100"])
        const deck_buttons_div = base.create_append(this.form, "div", ["d-md-flex"])
        this.deck_link = base.create_append(deck_buttons_div, "a",
            ["btn", "btn-vdb", "bg-vdb", "text-white", "me-2", "mb-2"],
            { target: "_blank" }
        )
        this.qr_code_button = base.create_append(deck_buttons_div, "button", ["btn", "btn-primary", "me-2", "mb-2"],
            { type: "button" }
        )
        this.qr_code_button.innerHTML = '<i class="bi bi-qr-code-scan"> Scan VDB</i>'
        this.video = base.create_append(this.form, "video", ["w-100"])
        this.video.hidden = true
        this.qr_code_button.addEventListener("click", async (ev) => { ev.preventDefault(); await this.toggle_video() })
        this.round_div = base.create_append(this.form, "div", ["input-group", "form-floating"])
        this.round_select = base.create_append(this.round_div, "select", ["form-select", "my-2"],
            { name: "round", id: "deckModalRoundInput" }
        )
        base.create_append(this.round_div, "label", ["form-label"], { for: "deckModalRoundInput" }).innerText = "Round"
        this.round_select.addEventListener("change", (ev) => this.display_round(this.round_select.selectedIndex + 1))
        this.deck_div = base.create_append(this.form, "div", ["input-group", "form-floating"])
        this.deck = base.create_append(this.deck_div, "textarea", ["form-control", "mb-2", "h-100"],
            { id: "deckModalTextInput", type: "text", autocomplete: "new-deck", rows: "10", maxlength: 10000 }
        )
        this.deck.ariaLabel = "Deck list (plain text or URL)"
        const label = base.create_append(this.deck_div, "label", ["form-label"], { for: "deckModalTextInput" })
        label.innerText = "Deck list (plain text or URL)"
        const btn_div = base.create_append(this.form, "div", ["col-auto"])
        this.submit_button = base.create_append(btn_div, "button", ["btn", "btn-primary", "me-2", "mb-2"],
            { type: "submit" }
        )
        this.submit_button.innerText = "Submit"
        this.form.addEventListener("submit", async (ev) => await this.submit(ev))
        if (modal_div) {
            this.root.addEventListener("hide.bs.modal", (ev) => this.stop_video())
        }
    }
    async toggle_video() {
        if (this.qr_scanner) {
            this.qr_scanner.stop()
            this.qr_scanner.destroy()
            this.qr_scanner = undefined
            this.video.hidden = true
            this.qr_code_button.innerHTML = '<i class="bi bi-qr-code-scan"> Scan VDB</i>'
        } else {
            this.video.hidden = false
            this.qr_scanner = new QrScanner(this.video, async (result) => this.scanned(result),
                { highlightScanRegion: true }
            )
            this.qr_code_button.innerHTML = '<i class="bi bi-qr-code-scan"> Stop scan</i>'
            await this.qr_scanner.start()
        }
    }
    stop_video() {
        if (this.qr_scanner) { this.toggle_video() }
    }
    init(
        player_uid: string,
        tournament: d.Tournament,
        round: number | undefined = undefined,
        submit_disabled: boolean = false
    ) {
        this.player_uid = player_uid
        this.tournament = tournament
        this.deck.value = ""
        if (submit_disabled) {
            this.deck_div.hidden = true
            this.submit_button.hidden = true
            this.qr_code_button.disabled = true
        } else {
            this.deck_div.hidden = false
            this.submit_button.hidden = false
            this.qr_code_button.disabled = false
        }
        this.stop_video()
        base.remove_children(this.round_select)
        round = round ?? tournament.rounds.length
        if (tournament.multideck && round > 0) {
            this.round_select.hidden = false
            this.round_div.classList.add("visible")
            this.round_div.classList.remove("invisible")
            for (var idx = 1; idx <= tournament.rounds.length; idx++) {
                const option = base.create_element("option")
                if (idx == tournament.rounds.length && tournament.finals_seeds.length) {
                    option.label = "Finals"
                } else {
                    option.label = `Round ${idx}`
                }
                option.value = idx.toString()
                this.round_select.options.add(option)
            }
            if (round > 0) {
                this.round_select.selectedIndex = round - 1
                this.display_round(round)
            }
        } else {
            this.round_div.classList.add("invisible")
            this.round_div.classList.remove("visible")
            this.round_select.selectedIndex = -1
            this.round_select.hidden = true
            this.display_round(0)
        }
    }
    display_round(round: number) {
        var current_deck = undefined
        if (this.tournament.multideck && round > 0) {
            for (const table of this.tournament.rounds[round - 1].tables) {
                for (const seating of table.seating) {
                    if (seating.player_uid == this.player_uid) {
                        current_deck = seating.deck ?? undefined
                    }
                }
            }
        } else {
            current_deck = this.tournament.players[this.player_uid]?.deck
        }
        if (current_deck?.vdb_link) {
            this.deck_link.href = current_deck.vdb_link
            this.deck_link.innerHTML = '<i class="bi bi-file-text"></i> Decklist'
            this.deck_link.classList.remove("disabled")
        } else {
            this.deck_link.innerHTML = "No decklist"
            this.deck_link.href = "javascript:void(0)"
            this.deck_link.classList.add("disabled")
        }
    }
    scanned(result: QrScanner.ScanResult) {
        this.qr_scanner.stop()
        this.deck.value = result.data
        this.form.dispatchEvent(new SubmitEvent("submit", { submitter: this.qr_scanner.$video }))
    }
    async submit(ev: SubmitEvent) {
        ev.preventDefault()
        var round = undefined
        if (this.round_select.selectedIndex >= 0) {
            round = this.round_select.selectedIndex + 1
        }
        await this.callback(this.player_uid, this.deck.value, round)
    }
}

class DeckModal extends base.Modal {
    display: TournamentDisplay
    deck_submit: DeckSubmit
    tournament: d.Tournament
    player_uid: string
    constructor(el: HTMLDivElement, display: TournamentDisplay) {
        super(el)
        this.display = display
        this.deck_submit = new DeckSubmit(this.modal_body, (a, b, c) => this.submit(a, b, c), this.modal_div)
    }
    async submit(player: string, deck: string, round: number | undefined) {
        await this.display.set_deck(this.tournament, player, deck, round)
        this.modal.hide()
    }
    show(tournament: d.Tournament, player: d.Player, submit_disabled: boolean) {
        this.modal_title.innerText = `${player.name}'s deck`
        this.tournament = tournament
        this.deck_submit.init(player.uid, tournament, undefined, submit_disabled)
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
                async (result) => { await this.checkin(result.data) },
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


function ordinal(n: number): string {
    if (!n) { return "" }
    if (n <= 0) { return n.toString() }
    const suffix = n.toString().slice(-1)
    if (suffix == "1") { return `${n}<sup>st</sup>` }
    if (suffix == "2") { return `${n}<sup>nd</sup>` }
    if (suffix == "3") { return `${n}<sup>rd</sup>` }
    return `${n}<sup>th</sup>`
}

interface TournamentDisplayCallback {
    (): Promise<void>
}

export class TournamentDisplay {
    root: HTMLDivElement
    display_callback: TournamentDisplayCallback
    confirmation_modal: base.ConfirmationModal
    score_modal: ScoreModal | undefined
    deck_modal: DeckModal | undefined
    checkin_modal: CheckInModal | undefined
    countries: Map<string, d.Country>
    token: base.Token
    user: d.Person
    members_map: member.MembersDB
    leagues: d.League[]
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
    league: HTMLSelectElement
    online: HTMLInputElement
    venue: HTMLInputElement
    venue_dropdown: HTMLUListElement
    venue_focus: HTMLLIElement | undefined
    dropdown: bootstrap.Dropdown
    country: HTMLSelectElement
    venue_url: HTMLInputElement
    address: HTMLInputElement
    map_url: HTMLInputElement
    start: HTMLInputElement
    finish: HTMLInputElement
    timezone: HTMLSelectElement
    description: HTMLTextAreaElement
    judges: d.Person[]
    constructor(root: HTMLDivElement, display_callback: TournamentDisplayCallback | undefined = undefined) {
        this.root = base.create_append(root, "div")
        this.display_callback = display_callback
        this.confirmation_modal = new base.ConfirmationModal(root)
        if (!display_callback) {
            this.score_modal = new ScoreModal(root, this)
            this.deck_modal = new DeckModal(root, this)
            this.checkin_modal = new CheckInModal(root, this)
        }
    }
    async init(
        token: base.Token | undefined = undefined,
        members_map: member.MembersDB | undefined = undefined,
        countries: d.Country[] | undefined = undefined,
    ) {
        this.token = token
        var user_id: string
        if (this.token) {
            user_id = JSON.parse(window.atob(token.access_token.split(".")[1]))["sub"]
        }
        if (!countries) {
            const res = await base.do_fetch("/api/vekn/country", {})
            countries = await res.json() as d.Country[]
        }
        this.countries = new Map(countries.map(c => [c.country, c]))
        if (members_map) {
            this.members_map = members_map
        } else if (user_id) {
            this.members_map = new member.MembersDB(token)
            await this.members_map.init()
        }
        if (user_id) {
            this.user = await this.members_map.get_by_uid(user_id)
            this.judges = [this.user]
        }
        {
            const res = await base.do_fetch("/api/leagues/", {})
            this.leagues = (await res.json())[1]
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
    async display(tournament: d.Tournament) {
        base.remove_children(this.root)
        if (!this.display_callback) {
            this.alert = base.create_append(this.root, "div", ["alert"], { role: "alert" })
        }
        this.judges = tournament.judges
        // ------------------------------------------------------------------------------------------------------- Title
        if (!this.display_callback) {
            base.create_append(this.root, "h1", ["mb-2"]).innerText = tournament.name
        }
        // ----------------------------------------------------------------------------------------------------- Buttons
        if (this.display_callback) {
            const buttons_div = base.create_append(this.root, "div", ["d-sm-flex", "mt-4", "mb-2"])
            const edit_button = base.create_append(buttons_div, "button", ["btn", "btn-primary", "me-2", "mb-2"])
            edit_button.innerHTML = '<i class="bi bi-pencil"></i> Edit'
            edit_button.addEventListener("click", (ev) => this.display_form(tournament))
            if (this.user.roles.includes(d.MemberRole.ADMIN)) {
                const res = await base.do_fetch_with_token(
                    `/api/tournaments/${tournament.uid}/info`,
                    this.token,
                    { method: "get" }
                )
                const tournament_info_data: d.TournamentInfo = await res.json()
                const download_button = base.create_append(buttons_div, "a",
                    ["btn", "btn-secondary", "text-nowrap", "me-2", "mb-2"],
                    { role: "button" }
                )
                download_button.innerHTML = '<i class="bi bi-download"></i> Download'
                download_button.href = "data:application/yaml;charset=utf-8;base64," + Base64.encode(
                    stringify(tournament_info_data)
                )
                download_button.download = `${tournament.name}.txt`
                const delete_button = base.create_append(buttons_div, "a",
                    ["btn", "btn-danger", "text-nowrap", "me-2", "mb-2"],
                    { role: "button" }
                )
                delete_button.innerHTML = '<i class="bi bi-trash"></i> Delete'
                delete_button.addEventListener("click", (ev) => this.confirmation_modal.show(
                    "This will permanently and officially delete this tournament data<br>" +
                    "<em>Only do this if this tournament is invalid or has not taken place</em>",
                    () => this.delete_tournament(tournament)
                ))
            }
            if (member.can_admin_tournament(this.user, tournament)) {
                // TODO: Remove when removing vekn.net
                const temp_div = base.create_append(this.root, "div", ["d-sm-flex", "mt-4", "mb-2", "align-items-center"])
                if (!tournament.extra["vekn_id"]) {
                    const vekn_id = base.create_append(temp_div, "input", ["form-control", "me-2", "mb-2", "flex-shrink"], {
                        id: "tournamentVeknId",
                        type: "text",
                        name: "vekn_id",
                        placeholder: "VEKN Event ID#",
                        autocomplete: "new-vekn-id",
                        spellcheck: "false",
                    })
                    const set_vekn_span = base.create_append(temp_div, "span", ["d-inline-block"], { tabindex: "0" })
                    const set_vekn = base.create_append(set_vekn_span, "button",
                        ["me-2", "mb-2", "text-nowrap", "btn", "btn-secondary"]
                    )
                    set_vekn.innerText = "Set VEKN Event ID"
                    const tooltip = base.add_tooltip(set_vekn_span, "Set event id# if it exists on vekn.net already")
                    set_vekn.addEventListener("click", (ev) => {
                        tooltip.hide()
                        this.set_vekn(vekn_id.value, tournament)
                    })
                    set_vekn.disabled = true
                    vekn_id.addEventListener("input", (ev) => {
                        if (vekn_id.value && vekn_id.value.match(/^\d{1,5}$/)) {
                            set_vekn.disabled = false
                        } else {
                            set_vekn.disabled = true
                        }
                    })
                    base.create_append(temp_div, "p", ["me-2", "mb-2"]).innerText = "OR"
                    const rounds = base.create_append(temp_div, "select", ["form-select", "me-2", "mb-2"])
                    rounds.options.add(base.create_element("option", [], { value: "", label: "Number of rounds" }))
                    rounds.options.add(base.create_element("option", [], { value: "3", label: "2R+F" }))
                    rounds.options.add(base.create_element("option", [], { value: "4", label: "3R+F" }))
                    const sync_vekn_span = base.create_append(temp_div, "span", ["d-inline-block"], { tabindex: "0" })
                    const sync_vekn = base.create_append(sync_vekn_span, "button",
                        ["me-2", "mb-2", "text-nowrap", "btn", "btn-secondary"]
                    )
                    sync_vekn.innerText = "Create on VEKN"
                    const tooltip2 = base.add_tooltip(sync_vekn_span,
                        "Create event on vekn.net if it does not exists yet")
                    sync_vekn.addEventListener("click", (ev) => {
                        tooltip2.hide()
                        this.vekn_sync(tournament, parseInt(rounds.selectedOptions[0].value))
                    })
                    sync_vekn.disabled = true
                    rounds.addEventListener("change", (ev) => {
                        if (rounds.selectedIndex > 0) {
                            sync_vekn.disabled = false
                        } else {
                            sync_vekn.disabled = true
                        }
                    })
                    base.create_append(temp_div, "div", ["w-100"])
                } else if (tournament.state == d.TournamentState.FINISHED) {
                    if (tournament.extra["vekn_submitted"]) {
                        const eid = tournament.extra["vekn_id"]
                        base.create_append(temp_div, "p").innerHTML = (
                            "Archon submitted to VEKN: " +
                            `<a href="https://www.vekn.net/event-calendar/event/${eid}">Event #${eid}</a>`
                        )
                    } else {
                        const sync_vekn = base.create_append(temp_div, "button",
                            ["me-2", "mb-2", "text-nowrap", "btn", "btn-secondary"]
                        )
                        sync_vekn.innerText = "Send to VEKN"
                        const tooltip = base.add_tooltip(sync_vekn, "Send Archon data to vekn.net")
                        sync_vekn.addEventListener("click", (ev) => { tooltip.hide(); this.vekn_sync(tournament) })
                    }
                }
            }
        }
        // ------------------------------------------------------------------------------------------------------ Badges
        const badges_div = base.create_append(this.root, "div", ["mt-2", "d-md-flex"])
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
            rank_badge.innerText = tournament.rank
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
        // ------------------------------------------------------------------------------------------------------ League
        if (tournament.league) {
            const league_div = base.create_append(this.root, "div", ["alert", "mb-2", "fw-bold", "alert-warning"],
                { role: "alert" })
            const link = base.create_append(league_div, "a", ["me-1"])
            link.innerText = tournament.league.name
            link.href = `/league/${tournament.league.uid}/display.html`
            base.create_append(league_div, "span").innerText = "tournament"
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
        // ------------------------------------------------------------------------------------------------- Contenders
        if (!this.display_callback) {
            const accordion = base.create_append(this.root, "div", ["accordion"], { id: "contendersAccordion" })

            const item = base.create_append(accordion, "div", ["accordion-item"])
            const header = base.create_append(item, "h2", ["accordion-header"], { id: "contendersAccordionHeader" })
            const button = base.create_append(header, "button", ["accordion-button", "collapsed"], {
                type: "button",
                "data-bs-toggle": "collapse",
                "data-bs-target": "#contendersCollapse",
                "aria-expanded": "false",
                "aria-controls": "contendersCollapse",
            })
            button.innerText = `${Object.getOwnPropertyNames(tournament.players).length} contenders`
            const collapse = base.create_append(item, "div", ["accordion-collapse", "collapse"], {
                "aria-labelledby": "contendersAccordionHeader", "data-bs-parent": "#pastRoundsAccordion"
            })
            collapse.id = "contendersCollapse"
            const body = base.create_append(collapse, "div", ["accordion-body"])
            if (this.user) {
                const ul = base.create_append(body, "ul")
                for (const player of Object.values(tournament.players).sort(
                    (a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" })
                )) {
                    const list_item = base.create_append(ul, "li")
                    if (player.vekn) {
                        list_item.innerText = `${player.name} (#${player.vekn})`
                    } else {
                        list_item.innerText = player.name
                    }
                }
            } else {
                const message = base.create_append(body, "div", ["alert", "alert-info"])
                message.innerHTML = (
                    "Only members can see other members names. Please " +
                    '<a href="/login.html">login</a>'
                )
            }
        }
        // ----------------------------------------------------------------------------------------------- User Commands
        if (!this.display_callback) {
            this.display_user_info(tournament)
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
        // ------------------------------------------------------------------------------------------------------ Judges
        if (this.user && this.judges.length > 0) {
            const table = base.create_append(this.root, "table", ["table", "table-striped", "my-2"])
            const head = base.create_append(table, "thead")
            const row = base.create_append(head, "tr", ["align-middle"])
            base.create_append(row, "th", [], { scope: "col", colspan: "3" }).innerText = "Judges & Organizers"
            const body = base.create_append(table, "tbody")
            for (const judge of this.judges.values()) {
                body.append(this.create_judge_row(judge, false))
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
        // --------------------------------------------------------------------------------------------------- Standings
        if (this.user && (
            tournament.standings_mode == d.StandingsMode.PUBLIC ||
            tournament.standings_mode == d.StandingsMode.TOP_10 ||
            tournament.state == d.TournamentState.FINALS ||
            tournament.state == d.TournamentState.FINISHED
        )) {
            const table = base.create_append(this.root, "table", ["table", "table-striped"])
            const thead = base.create_append(table, "thead")
            const tr = base.create_append(thead, "tr", ["align-middle"])
            for (const header of ["Rank", "VEKN #", "Name", "City", "Country", "Score"]) {
                base.create_append(tr, "th", [], { scope: "col" }).innerText = header
            }
            const tbody = base.create_append(table, "tbody")
            for (const [rank, player] of utils.standings(tournament)) {
                const tr = base.create_append(tbody, "tr", ["align-middle"])
                const classes = ["text-nowrap"]
                if (rank == 1 && tournament.state == d.TournamentState.FINISHED) {
                    classes.push("bg-warning-subtle")
                } else if (player.uid == this.user.uid) {
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
                base.create_append(tr, "td", classes).innerText = player.vekn
                base.create_append(tr, "td", classes).innerText = player.name
                base.create_append(tr, "td", classes).innerText = player.city
                base.create_append(tr, "td", classes).innerText = `${player.country} ${player.country_flag}`
                base.create_append(tr, "td", classes).innerHTML = utils.score_string(player.result)
            }
        }
    }
    display_user_info(tournament: d.Tournament) {
        if (!this.user) {
            if (tournament.state != d.TournamentState.FINISHED) {
                this.set_alert('You need to <a href="/login.html">login</a> to participate.', d.AlertLevel.INFO)
                return
            }
        }
        const current_round = tournament.rounds.length
        const started = current_round > 0
        const first_round_checkin = (tournament.state == d.TournamentState.WAITING && !started)
        const buttons_div = base.create_append(this.root, "div", ["align-items-center", "my-2"])
        if (member.can_admin_tournament(this.user, tournament)) {
            base.create_append(buttons_div, "a", ["btn", "btn-warning", "text-nowrap", "me-2", "mb-2"],
                { href: `/tournament/${tournament.uid}/console.html` }
            ).innerText = "Tournament Manager"
        }
        // _________________________________________________________________________________________ User not registered
        if (!Object.hasOwn(tournament.players, this.user.uid)) {
            if (tournament.state == d.TournamentState.FINISHED) {
                return
            }
            if (tournament.state == d.TournamentState.FINALS) {
                this.set_alert("Finals in progress: you are not participating", d.AlertLevel.INFO)
                return
            }
            if (!this.user.vekn || this.user.vekn.length < 1) {
                this.set_alert(
                    "A VEKN ID# is required to register to this event: " +
                    "claim your VEKN ID#, if you have one, in your " +
                    `<a class="alert-link" href="/member/${this.user.uid}/display.html">Profile</a><br>` +
                    "<em>If you hav no VEKN ID#, ask a Judge or an organizer to register you</em>"
                    , d.AlertLevel.WARNING
                )
                return
            }
            if (tournament.state == d.TournamentState.REGISTRATION || first_round_checkin) {
                this.set_alert("You can register to this tournament", d.AlertLevel.INFO)
                this.display_user_register(tournament, buttons_div)
                return
            }
            this.set_alert(
                "Tournament in progress: you are not participating <br>" +
                "<em>Either ask a Judge to check you in, or register for next round</em>",
                d.AlertLevel.WARNING
            )
            this.display_user_register(tournament, buttons_div)
            return
        }
        // _______________________________________________________________________________________________ ADD: Decklist
        // in all cases, even after the tournament's finished, allow players to upload their decklist
        const player = tournament.players[this.user.uid]
        if (!tournament.multideck || tournament.rounds.length > 0) {
            this.display_user_set_deck(tournament, buttons_div)
        }
        // display past rounds seating and results
        if (tournament.rounds.length > 0) {
            var max_round = tournament.rounds.length
            if (tournament.state == d.TournamentState.PLAYING) {
                max_round -= 1
            }
            if (tournament.state == d.TournamentState.FINALS || tournament.state == d.TournamentState.FINISHED) {
                max_round -= 1
            }
            if (max_round > 0) {
                const accordion = base.create_append(this.root, "div", ["accordion"], { id: "pastRoundsAccordion" })
                for (var idx = 0; idx < max_round; idx++) {
                    const round = tournament.rounds[idx]
                    var player_table: d.Table = undefined
                    var player_seat: d.TableSeat = undefined
                    for (const table of round.tables) {
                        for (const seat of table.seating) {
                            if (seat.player_uid == player.uid) {
                                player_table = table
                                player_seat = seat
                                break
                            }
                        }
                        if (player_seat) {
                            break
                        }
                    }
                    if (!player_seat) { continue }
                    const id = `prev-round-col-item-${idx}`
                    const head_id = `prev-round-col-head-${idx}`
                    const item = base.create_append(accordion, "div", ["accordion-item"])
                    const header = base.create_append(item, "h2", ["accordion-header"], { id: head_id })
                    const button = base.create_append(header, "button", ["accordion-button", "collapsed"], {
                        type: "button",
                        "data-bs-toggle": "collapse",
                        "data-bs-target": `#${id}`,
                        "aria-expanded": "false",
                        "aria-controls": id,
                    })
                    button.innerText = `Round ${idx + 1}`
                    if (player_seat) {
                        const badge = base.create_append(button, "div", ["badge", "ms-2", "text-bg-secondary"])
                        badge.innerText = utils.score_string(player_seat.result)
                    } else {
                        const badge = base.create_append(button, "div", ["badge", "ms-2", "text-bg-danger"])
                        badge.innerText = "No play"
                    }
                    const collapse = base.create_append(item, "div", ["accordion-collapse", "collapse"], {
                        "aria-labelledby": head_id, "data-bs-parent": "#pastRoundsAccordion"
                    })
                    collapse.id = id
                    const body = base.create_append(collapse, "div", ["accordion-body"])
                    this.display_user_table(tournament, player, body, player_table)
                }
                [].slice.call(accordion.querySelectorAll(".collapse")).map(
                    (el: HTMLDivElement) => new bootstrap.Collapse(el, { toggle: false, parent: accordion })
                )
            }
        }
        // _________________________________________________________________________________________ Tournament Finished
        if (tournament.state == d.TournamentState.FINISHED) {
            if (tournament.winner == player.uid) {
                this.set_alert(
                    "Tournament finished: you won, congratulations!",
                    d.AlertLevel.WARNING
                )
            }
            // no message otherwise. Participation appears in standings.
            return
        }
        // _________________________________________________________________________________________________ ADD: Status
        var status: string
        switch (tournament.state) {
            case d.TournamentState.REGISTRATION:
                if (current_round > 0) {
                    status = `Round ${current_round} finished`
                } else {
                    status = "Registrations open"
                }
                break;
            case d.TournamentState.WAITING:
                status = `Round ${current_round + 1} begins soon — Check-in open`
                break;
            case d.TournamentState.PLAYING:
                status = `Round ${current_round} in progress`
                if (player.state == d.PlayerState.PLAYING) {
                    status += ` — Your table: Table ${player.table}`
                }
                break;
            case d.TournamentState.FINALS:
                status = `Finals in progress`
                if (player.state == d.PlayerState.PLAYING) {
                    status += ` — You play ${ordinal(player.seed)} seed`
                }
                break;
        }
        const status_title = base.create_append(this.root, "h2", ["my-2"])
        status_title.innerHTML = status
        // ______________________________________________________________________________________________________ Finals
        if (tournament.state == d.TournamentState.FINALS) {
            if (player.state == d.PlayerState.PLAYING) {
                this.set_alert("You play the finals", d.AlertLevel.SUCCESS)
                this.display_current_user_table(tournament, player)
            } else {
                this.set_alert("Finals in progress: you are not participating", d.AlertLevel.INFO)
                // TODO: it would be nice to be able to link live streams here
            }
            return
        }

        // ______________________________________________________________________________________ Finished before finals
        if (player.state == d.PlayerState.FINISHED) {
            if (player.barriers.includes(d.Barrier.BANNED)) {
                this.set_alert(
                    "You are banned from tournament play by the VEKN <br>" +
                    `<em>Check your <a class="alert-link" href="/member/${this.user.uid}/display.html">Profile</a> ` +
                    "for more information</em>",
                    d.AlertLevel.DANGER
                )
                return
            }
            if (player.barriers.includes(d.Barrier.DISQUALIFIED)) {
                this.set_alert(
                    "You have been disqualified <br>" +
                    `<em>Check your <a class="alert-link" href="/member/${this.user.uid}/display.html">Profile</a> ` +
                    "for more information</em>",
                    d.AlertLevel.DANGER
                )
                return
            }
            this.set_alert(
                "You have dropped out of this tournament <br>" +
                "<em>You can register back</em>",
                d.AlertLevel.WARNING
            )
            const register_button = base.create_append(buttons_div, "button",
                ["btn", "btn-success", "me-2", "mb-2"]
            )
            register_button.innerText = "Register back"
            register_button.addEventListener("click", (ev) => this.register(tournament))
            return
        }
        // ____________________________________________________________________________________________ ADD: Drop button
        {
            const drop_button = base.create_append(buttons_div, "button",
                ["btn", "btn-danger", "text-nowrap", "me-2", "mb-2"]
            )
            drop_button.innerHTML = '<i class="bi bi-x-circle-fill"></i> Drop from the tournament'
            const tooltip = base.add_tooltip(drop_button, "Let the organizers know you are leaving")
            drop_button.addEventListener("click", (ev) => {
                tooltip.hide()
                this.confirmation_modal.show(
                    "You will not participate in future rounds.",
                    () => this.drop(tournament, player)
                )
            })
        }
        // _____________________________________________________________________________________ Cutoff (standings mode)
        if (tournament.standings_mode == d.StandingsMode.CUTOFF) {
            const cutoff: d.Score = JSON.parse(this.root.parentElement.dataset.cutoff ?? '{"gw": 0, "vp": 0, "tp": 0}')
            if (cutoff) {
                const cutoff_div = base.create_append(this.root, "div", ["my-2", "text-bg-info", "rounded", "p-2"])
                cutoff_div.innerHTML = `<strong>Cutoff for top 5:</strong> ${utils.score_string(cutoff)}`
            }
        }
        // _________________________________________________________________________________________ Open (registration)
        if (tournament.state == d.TournamentState.REGISTRATION) {
            this.set_alert(
                "You are registered <br>" +
                "<em>You can upload (and re-upload) you deck list at any time until the first round starts — " +
                "not even judges can see your deck list until it starts.</em>",
                d.AlertLevel.SUCCESS
            )
            return
        }
        // _____________________________________________________________________________________________________ Playing
        if (tournament.state == d.TournamentState.PLAYING) {
            if (player.state != d.PlayerState.PLAYING) {
                this.set_alert(
                    "You are not playing <br> " +
                    "<em>Contact a judge urgently if you should be</em>",
                    d.AlertLevel.DANGER
                )
                return
            }
            this.set_alert(`You are playing on table ${player.table}, seat ${player.seat}`, d.AlertLevel.SUCCESS)
            this.display_current_user_table(tournament, player)
            return
        }
        // ____________________________________________________________________________________________________ Check-In
        if (tournament.state == d.TournamentState.WAITING) {
            if (player.state == d.PlayerState.CHECKED_IN) {
                this.set_alert(`You are checked in and ready to play`, d.AlertLevel.SUCCESS)
                return
            }
            const tooltip_span = base.create_append(buttons_div, "span", [], { tabindex: "0" })
            const checkin_button = base.create_append(tooltip_span, "button",
                ["btn", "btn-primary", "text-nowrap", "me-2", "mb-2"]
            )
            checkin_button.innerHTML = '<i class="bi bi-qr-code-scan"> Check In</i>'
            if (player.barriers.length == 0) {
                checkin_button.disabled = false
                checkin_button.addEventListener("click", (ev) => this.checkin_modal.show(tournament, player))
                this.set_alert(
                    "You need to check in to play the next round <br>" +
                    "<em>If you do not check in, you will not play<em>",
                    d.AlertLevel.WARNING
                )
                return
            }
            checkin_button.disabled = true
            if (player.barriers.includes(d.Barrier.BANNED)) {
                const msg = "You are banned from tournament play by the VEKN"
                this.set_alert(msg, d.AlertLevel.DANGER)
                base.add_tooltip(tooltip_span, msg)
                return
            }
            if (player.barriers.includes(d.Barrier.DISQUALIFIED)) {
                const msg = "You have been disqualified"
                this.set_alert(msg, d.AlertLevel.DANGER)
                base.add_tooltip(tooltip_span, msg)
                return
            }
            if (player.barriers.includes(d.Barrier.MAX_ROUNDS)) {
                const msg = "You have played the maximum number of rounds"
                this.set_alert(msg, d.AlertLevel.INFO)
                base.add_tooltip(tooltip_span, msg)
                return
            }
            if (player.barriers.includes(d.Barrier.MISSING_DECK)) {
                const msg = "You must upload your deck list"
                this.set_alert(msg, d.AlertLevel.WARNING)
                base.add_tooltip(tooltip_span, msg)
                return
            }
        }
        return
    }
    display_user_register(tournament: d.Tournament, buttons_div: HTMLDivElement) {
        const register_button = base.create_append(buttons_div, "button",
            ["btn", "btn-success", "text-nowrap", "me-2", "mb-2"]
        )
        register_button.innerText = "Register"
        register_button.addEventListener("click", (ev) => this.register(tournament))
    }
    display_user_set_deck(tournament: d.Tournament, buttons_div: HTMLDivElement) {
        const current_round = tournament.rounds.length
        const player = tournament.players[this.user.uid]
        const tooltip_span = base.create_append(buttons_div, "span", [], { tabindex: "0" })
        const upload_deck_button = base.create_append(tooltip_span, "button",
            ["btn", "btn-primary", "text-nowrap", "me-2", "mb-2"]
        )
        upload_deck_button.innerText = "Decklist"
        var tooltip
        if (tournament.decklist_required && current_round > 0) {
            if (player.deck) {
                tooltip = base.add_tooltip(tooltip_span, "Only a judge can modify your deck list")
            } else {
                const alert = base.create_prepend(this.root, "div",
                    ["alert", "alert-danger", "alert-dismissible", "fade", "show"],
                    { role: "alert" }
                )
                alert.innerText = `You must upload your deck list`
                base.create_append(alert, "button", ["btn-close"],
                    { type: "button", "data-bs-dismiss": "alert", "arial-label": "Close" }
                )
                bootstrap.Alert.getOrCreateInstance(alert)
                tooltip = base.add_tooltip(tooltip_span,
                    "Once uploaded, you will not be able to modify your decklist"
                )
            }
        } else {
            tooltip = base.add_tooltip(tooltip_span,
                "You can re-upload a new version anytime before the tournament begins"
            )
        }
        var submit_disabled = false
        if (player.deck && tournament.decklist_required && current_round > 0) {
            submit_disabled = true
            upload_deck_button.classList.remove("btn-primary")
            upload_deck_button.classList.add("btn-secondary")
        }
        upload_deck_button.addEventListener("click", (ev) => {
            tooltip.hide()
            this.deck_modal.show(tournament, player, submit_disabled)
        })
    }
    display_current_user_table(tournament: d.Tournament, player: d.Player) {
        const current_round = tournament.rounds.length
        const player_table = tournament.rounds[current_round - 1].tables[player.table - 1]
        this.display_user_table(tournament, player, this.root, player_table, true)
    }
    display_user_table(
        tournament: d.Tournament,
        player: d.Player,
        el: HTMLElement,
        player_table: d.Table,
        current: boolean = false
    ) {
        const table_div = base.create_append(el, "div")
        const table = base.create_append(table_div, "table", ["table", "table-sm", "table-responsive"])
        const head = base.create_append(table, "thead")
        const tr = base.create_append(head, "tr", ["align-middle", "smaller-font"])
        var headers: Array<string>
        if (current && tournament.state != d.TournamentState.FINALS) {
            headers = ["Seat", "VEKN#", "Name", "Score", ""]
        } else {
            headers = ["Seat", "VEKN#", "Name", "Score"]
        }
        for (const label of headers) {
            const th = base.create_append(tr, "th", [], { scope: "col" })
            th.innerText = label
        }
        const body = base.create_append(table, "tbody")
        for (const [idx, seat] of player_table.seating.entries()) {
            const seat_player = tournament.players[seat.player_uid]
            const row = base.create_append(body, "tr", ["align-middle"])
            var cell_cls = ["text-nowrap"]
            var name_cls = ["w-100", "smaller-font"]
            if (player.uid == seat_player.uid) {
                cell_cls.push("bg-primary-subtle")
                name_cls.push("bg-primary-subtle")
            }
            if (tournament.state == d.TournamentState.FINALS) {
                base.create_append(row, "td", cell_cls).innerHTML = utils.full_score_string(seat_player)
                base.create_append(row, "td", cell_cls).innerText = seat_player.vekn
            } else {
                base.create_append(row, "th", cell_cls, { scope: "row" }).innerText = (idx + 1).toString()
                base.create_append(row, "td", cell_cls).innerText = seat_player.vekn
            }
            base.create_append(row, "td", name_cls).innerText = seat_player.name
            base.create_append(row, "td", cell_cls).innerText = utils.score_string(seat.result)
            if (current && tournament.state != d.TournamentState.FINALS) {
                const actions = base.create_append(row, "td", cell_cls)
                const changeButton = base.create_append(actions, "button",
                    ["me-2", "mb-2", "btn", "btn-sm", "btn-primary"]
                )
                changeButton.innerHTML = '<i class="bi bi-pencil"></i>'
                changeButton.addEventListener("click", (ev) => {
                    this.score_modal.show(
                        tournament,
                        seat_player,
                        tournament.rounds.length,
                        player_table.seating.length,
                        seat.result.vp
                    )
                })
            }
        }
    }
    async handle_tournament_event(tid: string, tev: events.TournamentEvent) {
        console.log("handle event", tev)
        // TODO: implement offline mode
        const res = await base.do_fetch_with_token(
            `/api/tournaments/${tid}/event`,
            this.token,
            {
                method: "post",
                body: JSON.stringify(tev)
            }
        )
        if (!res) { return }
        const response = await res.json()
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
    async set_deck(tournament: d.Tournament, player_uid: string, deck: string, round: number | undefined = undefined) {
        const tev = {
            uid: uuid.v4(),
            type: events.EventType.SET_DECK,
            player_uid: player_uid,
            deck: deck,
            round: round ?? null,
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
    async register(tournament: d.Tournament) {
        const tev = {
            uid: uuid.v4(),
            type: events.EventType.REGISTER,
            name: this.user.name,
            vekn: this.user.vekn,
            player_uid: this.user.uid,
            country: this.user.country,
            city: this.user.city,
        } as events.Register
        await this.handle_tournament_event(tournament.uid, tev)
    }
    async delete_tournament(tournament: d.Tournament) {
        const res = await base.do_fetch_with_token(
            `/api/tournaments/${tournament.uid}`,
            this.token,
            { method: "delete" }
        )
        if (!res) { return }
        window.location.href = "/tournament/list.html"
    }
    async set_vekn(vekn_id: string, tournament: d.Tournament) {
        const res = await base.do_fetch_with_token(
            `/api/tournaments/${tournament.uid}/set-vekn/${vekn_id}`,
            this.token, { method: "post" }
        )
        if (res) {
            const response = await res.json()
            await this.display(response)
        }
    }
    async vekn_sync(tournament: d.Tournament, rounds: number | undefined = undefined) {
        if (!rounds) {
            rounds = Math.max(1, tournament.rounds.length)
        }
        const res = await base.do_fetch_with_token(
            `/api/tournaments/${tournament.uid}/vekn-sync/${rounds}`,
            this.token,
            { method: "post" }
        )
        if (res) {
            const response = await res.json()
            await this.display(response)
        }
    }
    async display_form(tournament: d.Tournament | undefined) {
        base.remove_children(this.root)
        const form = base.create_append(this.root, "form", ["row", "g-3", "mt-3", "needs-validation"])
        form.noValidate = true
        form.addEventListener("submit", (ev) => this.submit_tournament(ev, tournament))
        // ------------------------------------------------------------------------------------------------------ line 1
        { // name
            const div = base.create_append(form, "div", ["col-md-6"])
            const group = base.create_append(div, "div", ["input-group", "form-floating", "has-validation"])
            this.name = base.create_append(group, "input", ["form-control", "z-1"], {
                id: "tournamentName",
                type: "text",
                name: "name",
                placeholder: "Tournament Name",
                autocomplete: "new-name",
                spellcheck: "false",
            })
            if (tournament?.name && tournament.name.length > 0) {
                this.name.value = tournament.name
            }
            this.name.ariaAutoComplete = "none"
            this.name.required = true
            this.name.addEventListener("change", (ev) => { this.name.form.classList.add("was-validated") })
            base.create_append(group, "div", ["invalid-feedback"]).innerText = "Choose a name for your tournament"
            base.create_append(group, "label", ["form-label"], { for: "tournamentName" }).innerText = "Tournament name"
        }
        { // format
            const div = base.create_append(form, "div", ["col-md-3"])
            const group = base.create_append(div, "div", ["input-group", "form-floating", "has-validation"])
            this.format = base.create_append(group, "select", ["form-select", "z-1"], { name: "format", id: "format" })
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
            base.create_append(group, "label", ["form-label"], { for: "format" }).innerText = "Format"
        }
        { // rank
            const div = base.create_append(form, "div", ["col-md-3"])
            const group = base.create_append(div, "div", ["input-group", "form-floating", "has-validation"])
            this.rank = base.create_append(group, "select", ["form-select", "z-1"], { name: "rank", id: "rank" })
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
            base.create_append(group, "label", ["form-label"], { for: "rank" }).innerText = "Rank"
        }
        // ------------------------------------------------------------------------------------------------------ line 2
        { // proxies
            const div = base.create_append(form, "div", ["col-md-2", "d-flex", "align-items-center"])
            const field_div = base.create_append(div, "div", ["form-check", "form-switch"])
            this.proxies = base.create_append(field_div, "input", ["form-check-input"],
                { type: "checkbox", name: "proxies", id: "switchProxy" }
            )
            this.proxies_label = base.create_append(field_div, "label", ["form-check-label"], { for: "switchProxy" })
            this.proxies_label.innerText = "Proxies allowed"
            if (tournament?.proxies) {
                this.proxies.checked = true
            } else {
                this.proxies.checked = false
            }
            if (this.rank.value != d.TournamentRank.BASIC || tournament?.online) {
                this.proxies.checked = false
                this.proxies.disabled = true
            }
        }
        { // multideck
            const div = base.create_append(form, "div", ["col-md-2", "d-flex", "align-items-center"])
            const field_div = base.create_append(div, "div", ["form-check", "form-switch"])
            this.multideck = base.create_append(field_div, "input", ["form-check-input"],
                { type: "checkbox", name: "multideck", id: "switchMultideck" }
            )
            this.multideck_label = base.create_append(field_div, "label", ["form-check-label"],
                { for: "switchMultideck" }
            )
            this.multideck_label.innerText = "Multideck"
            if (tournament?.multideck) {
                this.multideck.checked = true
            } else {
                this.multideck.checked = false
            }
            if (this.rank.value != d.TournamentRank.BASIC) {
                this.multideck.checked = false
                this.multideck.disabled = true
            }
            this.multideck.addEventListener("change", (ev) => this.switch_multideck())
        }
        { // decklist
            const div = base.create_append(form, "div", ["col-md-2", "d-flex", "align-items-center"])
            const field_div = base.create_append(div, "div", ["form-check", "form-switch"])
            this.decklist_required = base.create_append(field_div, "input", ["form-check-input"],
                { type: "checkbox", name: "decklist_required", id: "switchDecklistRequired" }
            )
            this.decklist_required_label = base.create_append(field_div, "label", ["form-check-label"],
                { for: "switchDecklistRequired" }
            )
            this.decklist_required_label.innerText = "Decklist required"
            if (!tournament || tournament.decklist_required) {
                this.decklist_required.checked = true
            } else {
                this.decklist_required.checked = false
            }
            if (this.multideck.checked) {
                this.decklist_required.checked = false
                this.decklist_required.disabled = true
            }
        }
        { // league
            const div = base.create_append(form, "div", ["col-md-6", "d-flex", "align-items-center"])
            const group = base.create_append(div, "div", ["input-group", "form-floating", "has-validation"])
            this.league = base.create_append(group, "select", ["form-select", "z-1"],
                { name: "league", id: "selectLeague" }
            )
            const option = base.create_append(this.league, "option")
            option.value = ""
            option.label = ""
            base.create_append(group, "label", ["form-label"], { for: "format" }).innerText = "League"
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
        { // country
            const div = base.create_append(form, "div", ["col-md-4"])
            this.country = base.create_append(div, "select", ["form-select"], { name: "country" })
            this.country.ariaLabel = "Country"
            this.country.options.add(base.create_element("option", [], { value: "", label: "Country" }))
            for (const country of this.countries.values()) {
                const option = document.createElement("option")
                option.value = country.country
                option.label = `${country.country} ${country.flag}`
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
            base.create_append(div, "div", ["invalid-feedback"]).innerText = "If not online, a country is required"
            this.country.addEventListener("change", (ev) => this.change_country())
        }
        { // venue
            const div = base.create_append(form, "div", ["col-md-6"])
            this.venue = base.create_append(div, "input", ["form-control"],
                { type: "text", name: "venue", placeholder: "Venue", autocomplete: "section-venue organization", spellcheck: "false" }
            )
            this.venue.ariaLabel = "Venue"
            this.venue.ariaAutoComplete = "list"
            if (tournament?.venue && tournament.venue.length > 0) {
                this.venue.value = tournament.venue
            } else if (!tournament?.online && !tournament?.country) {
                this.venue.disabled = true
            }
            this.venue.addEventListener("change", (ev) => this.change_venue())
            this.venue_dropdown = base.create_append(div, "ul", ["dropdown-menu"])
            base.create_append(this.venue_dropdown, "li", ["dropdown-item", "disabled"], { type: "button" }
            ).innerText = "Start typing..."
            this.venue.addEventListener("input", base.debounce((ev) => this.complete_venue()))
            this.dropdown = bootstrap.Dropdown.getOrCreateInstance(this.venue)
            div.addEventListener("keydown", (ev) => this.keydown(ev));
        }
        // ------------------------------------------------------------------------------------------------------ line 4
        { // venue_url
            const div = base.create_append(form, "div", ["col-md-4"])
            const group = base.create_append(div, "div", ["input-group"])
            base.create_append(group, "i", ["input-group-text", "bi", "bi-link-45deg"])
            this.venue_url = base.create_append(group, "input", ["form-control"],
                { type: "text", name: "venue_url", placeholder: "Venue URL", autocomplete: "section-venue url", spellcheck: "false" }
            )
            this.venue_url.ariaLabel = "Venue URL"
            this.venue_url.ariaAutoComplete = "list"
            if (tournament?.venue_url && tournament.venue_url.length > 0) {
                this.venue_url.value = tournament.venue_url
            } else if (this.venue.disabled) {
                this.venue_url.disabled = true
            }
        }
        { // address
            const div = base.create_append(form, "div", ["col-md-4"])
            this.address = base.create_append(div, "input", ["form-control"],
                { type: "text", name: "address", placeholder: "Address", autocomplete: "section-venue street-address", spellcheck: "false" }
            )
            this.address.ariaLabel = "Address"
            this.address.ariaAutoComplete = "list"
            if (tournament?.address && tournament.address.length > 0) {
                this.address.value = tournament.address
            } else if (this.venue.disabled || tournament?.online) {
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
            } else if (this.venue.disabled || tournament?.online) {
                this.map_url.disabled = true
            }
        }
        // ------------------------------------------------------------------------------------------------------ line 5
        var start_week: number = 1  // Monday
        if (["en-US", "pt-BR"].includes(
            (navigator.languages && navigator.languages.length) ? navigator.languages[0] : ""
        )) {
            start_week = 7
        }
        { // start
            const div = base.create_append(form, "div", ["col-md-4"])
            const group = base.create_append(div, "div",
                ["input-group", "form-floating", "has-validation"],
                { id: "pickerStart" }
            )
            group.dataset.tdTargetInput = "nearest"
            group.dataset.tdTargetToggle = "nearest"
            this.start = base.create_append(group, "input", ["form-control", "z-1"], {
                id: "tournamentStart",
                type: "text",
                name: "start",
                autocomplete: "off",
                spellcheck: "false"
            })
            this.start.ariaLabel = "Start"
            this.start.ariaAutoComplete = "none"
            this.start.dataset.tdTarget = "#pickerStart"
            this.start.required = true
            this.start.pattern = /\d{4}\-\d{2}\-\d{2}\s\d{2}:\d{2}/.source
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
                localization: { format: "yyyy-MM-dd HH:mm", hourCycle: "h23", startOfTheWeek: start_week },
                stepping: 15,
                promptTimeOnDateChange: true
            })
            base.create_append(group, "div", ["invalid-feedback"]).innerText = "A start date is required"
        }
        { // finish
            const div = base.create_append(form, "div", ["col-md-4"])
            const group = base.create_append(div, "div",
                ["input-group", "form-floating", "has-validation"],
                { id: "pickerFinish" }
            )
            group.dataset.tdTargetInput = "nearest"
            group.dataset.tdTargetToggle = "nearest"
            this.finish = base.create_append(group, "input", ["form-control", "z-1"], {
                id: "tournamentFinish",
                type: "text",
                name: "finish",
                autocomplete: "off",
                spellcheck: "false"
            })
            this.finish.ariaLabel = "Finish"
            this.finish.ariaAutoComplete = "none"
            this.finish.dataset.tdTarget = "#pickerFinish"
            this.finish.pattern = /\d{4}\-\d{2}\-\d{2}\s\d{2}:\d{2}/.source
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
                localization: { format: "yyyy-MM-dd HH:mm", hourCycle: "h23", startOfTheWeek: start_week },
                stepping: 15,
                promptTimeOnDateChange: true
            })
            base.create_append(group, "div", ["valid-feedback"]).innerText = "Optional finish date/time"
        }
        { // timezone
            const div = base.create_append(form, "div", ["col-md-4"])
            const group = base.create_append(div, "div", ["input-group", "form-floating"])
            this.timezone = base.create_append(group, "select", ["form-select"],
                { id: "timezoneSelect", name: "timezone" }
            )
            this.timezone.ariaLabel = "Timezone"
            this.timezone.required = true
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
                this.description.value = tournament.description
            }
        }
        // ------------------------------------------------------------------------------------------------------ Judges
        {
            const table = base.create_append(form, "table", ["table", "table-striped", "my-2"])
            const head = base.create_append(table, "thead")
            const row = base.create_append(head, "tr", ["align-middle"])
            base.create_append(row, "th", [], { scope: "col", colspan: "3" }).innerText = "Judges & Organizers"
            const body = base.create_append(table, "tbody")
            for (const judge of this.judges.values()) {
                body.append(this.create_judge_row(judge, true))
            }
            const lookup_row = base.create_append(body, "tr", ["align-middle"])
            const lookup_cell = base.create_append(body, "td", [], { colspan: "3" })
            const lookup = new member.PersonLookup(this.members_map, lookup_cell, "Add Judge", true)
            lookup.form.addEventListener("submit", (ev) => {
                ev.preventDefault()
                const person = lookup.person
                lookup.reset()
                if (this.judges.some(j => j.uid == person.uid)) { return }
                this.judges.push(person)
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
        await this.filter_leagues_options(tournament)
    }

    create_judge_row(member: d.Person, edit: boolean) {
        const row = base.create_element("tr")
        base.create_append(row, "th", [], { scope: "row" }).innerText = member.vekn
        base.create_append(row, "td", ["w-100"]).innerText = member.name
        const actions = base.create_append(row, "td")
        if (edit && this.user.uid != member.uid) {
            const button = base.create_append(actions, "button", ["btn", "btn-sm", "btn-danger", "me-2"])
            button.innerHTML = '<i class="bi bi-x-circle-fill"></i>'
            const tip = base.add_tooltip(button, "Remove")
            button.addEventListener("click", (ev) => {
                tip.dispose()
                this.judges = [...this.judges.filter(j => j.uid != member.uid)]
                row.remove()
            })
        }
        return row
    }
    async filter_leagues_options(tournament: d.TournamentConfig | undefined = undefined) {
        const url = new URL("/api/leagues/", window.location.origin)
        if (this.country.value != "") {
            url.searchParams.append("country", this.country.value)
        }
        if (!this.online.checked) {
            url.searchParams.append("online", "false")
        }
        const res = await base.do_fetch(url.href, {})
        this.leagues = (await res.json())[1]
        var leagues = this.leagues
        if (this.format.selectedOptions[0].value != "") {
            leagues = leagues.filter(l => l.format === this.format.value)
        }
        var previous
        if (this.league.selectedIndex > 0) {
            previous = this.league.selectedOptions[0].value
        } else if (tournament?.league) {
            previous = tournament.league.uid
        }
        base.remove_but_one_children(this.league)
        for (const league of leagues) {
            const option = base.create_append(this.league, "option")
            var name = league.name
            if (name.length > 30) {
                name = name.slice(0, 29) + "…"
            }
            option.innerText = league.name
            option.value = league.uid
            if (option.value === previous) {
                option.selected = true
            } else {
                option.selected = false
            }
        }
    }
    async select_format() {
        // Ranks are only available for Standard constructed
        if (this.format.value == d.TournamentFormat.Standard) {
            this.rank.disabled = false
        } else {
            this.rank.value = d.TournamentRank.BASIC
            this.rank.disabled = true
            this.rank.dispatchEvent(new Event('change', { bubbles: true }))
        }
        await this.filter_leagues_options()
    }
    select_rank() {
        // No proxy and no multideck for national tournaments and above
        if (this.rank.value != d.TournamentRank.BASIC) {
            this.proxies.checked = false
            this.proxies.disabled = true
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
    switch_multideck() {
        // Label change between "Multideck" / "Single deck"
        if (this.multideck.checked) {
            this.decklist_required.checked = false
            this.decklist_required.disabled = true
            this.decklist_required.dispatchEvent(new Event('change', { bubbles: true }))
        }
        else {
            this.decklist_required.disabled = false
        }
    }
    async switch_online() {
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
        await this.filter_leagues_options()
    }
    async change_country() {
        this.venue.disabled = false
        if (this.country.selectedIndex == 0) {
            if (!this.venue.value || this.venue.value.length < 1) {
                this.venue.disabled = true
            }
        }
        this.change_venue()
        await this.filter_leagues_options()
    }
    change_venue() {
        this.address.disabled = false
        this.venue_url.disabled = false
        this.map_url.disabled = false
        if (!this.venue.value || this.venue.value.length < 1) {
            if (!this.address.value || this.address.value.length < 1) {
                this.address.disabled = true
            }
            if (!this.venue_url.value || this.venue_url.value.length < 1) {
                this.venue_url.disabled = true
            }
            if (!this.map_url.value || this.map_url.value.length < 1) {
                this.map_url.disabled = true
            }
        }
    }
    async complete_venue() {
        base.remove_children(this.venue_dropdown)
        this.reset_venue_focus()
        if (this.venue.value.length < 1) {
            base.create_append(this.venue_dropdown, "li", ["dropdown-item", "disabled"],
                { type: "button" }).innerText = "Start typing..."
            return
        }
        if (this.venue.value.length < 3) {
            base.create_append(this.venue_dropdown, "li", ["dropdown-item", "disabled"],
                { type: "button" }).innerText = "Type some more..."
            return
        }
        var country = this.country.value
        if (!country || country.length < 1) {
            country = "online"
        }
        const res = await base.do_fetch_with_token(
            "/api/tournaments/venue-completion/"
            + encodeURIComponent(country)
            + "/"
            + encodeURIComponent(this.venue.value),
            this.token, {}
        )
        var venues_list: d.VenueCompletion[]
        if (res) {
            venues_list = await res.json()
        }
        if (!venues_list || venues_list.length < 1) {
            base.create_append(this.venue_dropdown, "li", ["dropdown-item", "disabled"],
                { type: "button" }).innerText = "No result"
            return
        }
        for (const venue of venues_list.slice(0, 10)) {
            const li = base.create_append(this.venue_dropdown, "li")
            const button = base.create_append(li, "button", ["dropdown-item"],
                { type: "button", "data-venue": JSON.stringify(venue) }
            )
            button.innerText = venue.venue
            button.addEventListener("click", (ev) => this.select_venue(ev))
        }
        this.dropdown.show()
    }
    reset_venue_focus(new_focus: HTMLLIElement | undefined = undefined) {
        if (this.venue_focus && this.venue_focus.firstElementChild) {
            this.venue_focus.firstElementChild.classList.remove("active")
        }
        this.venue_focus = new_focus
        if (this.venue_focus && this.venue_focus.firstElementChild) {
            this.venue_focus.firstElementChild.classList.add("active")
        }
    }
    select_venue(ev: Event) {
        const button = ev.currentTarget as HTMLButtonElement
        const venue_completion = JSON.parse(button.dataset.venue) as d.VenueCompletion
        this.venue.value = venue_completion.venue
        if (venue_completion.address) {
            this.address.value = venue_completion.address
        } else {
            this.address.value = ""
        }
        if (venue_completion.venue_url) {
            this.venue_url.value = venue_completion.venue_url
        } else {
            this.venue_url.value = ""
        }
        if (venue_completion.map_url) {
            this.map_url.value = venue_completion.map_url
        } else {
            this.map_url.value = ""
        }
        this.change_venue()
        this.reset_venue_focus()
        this.dropdown.hide()
    }
    keydown(ev: KeyboardEvent) {
        var next_focus: HTMLLIElement | undefined = undefined
        switch (ev.key) {
            case "ArrowDown": {
                if (this.venue_focus) {
                    next_focus = this.venue_focus.nextElementSibling as HTMLLIElement
                } else {
                    next_focus = this.venue_dropdown.firstElementChild as HTMLLIElement
                }
                if (next_focus === null) {
                    next_focus = this.venue_focus
                }
                break
            }
            case "ArrowUp": {
                if (this.venue_focus) {
                    next_focus = this.venue_focus.previousElementSibling as HTMLLIElement
                } else {
                    next_focus = this.venue_dropdown.lastElementChild as HTMLLIElement
                }
                if (next_focus === null) {
                    next_focus = this.venue_focus
                }
                break
            }
            case "Escape": {
                break
            }
            case "Enter": {
                if (this.venue_focus) {
                    this.venue_focus.firstElementChild.dispatchEvent(new Event("click"))
                } else {
                    return
                }
                break
            }
            default: return
        }
        ev.stopPropagation()
        ev.preventDefault()
        if (next_focus === this.venue_focus) { return }
        this.reset_venue_focus(next_focus)
    }
    async submit_tournament(ev: Event, tournament: d.Tournament | undefined) {
        // create or update tournament
        ev.preventDefault()
        const form = ev.currentTarget as HTMLFormElement
        if (!form.checkValidity()) {
            ev.preventDefault()
            ev.stopPropagation()
            form.classList.add('was-validated')
            return
        }
        form.classList.add('was-validated')
        const tournamentForm = ev.currentTarget as HTMLFormElement
        const data = new FormData(tournamentForm)
        var league = null
        if (data.get("league") != "") {
            league = {
                uid: this.league.selectedOptions[0].value,
                name: this.league.selectedOptions[0].label,
            }
        }
        var json_data = Object.fromEntries(data.entries()) as unknown as d.TournamentConfig
        // fix fields that need some fixing
        json_data.league = league
        if (json_data.finish.length < 1) { json_data.finish = undefined }
        json_data.judges = [...this.judges.values()]
        // checkboxes are "on" if checked, non-listed otherwise - do it by hand
        json_data.multideck = this.multideck.checked
        json_data.proxies = this.proxies.checked
        json_data.online = this.online.checked
        json_data.decklist_required = this.decklist_required.checked
        console.log("posting", json_data)
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
        if (tournament) {
            if (this.display_callback) {
                // TODO: what about offline mode? Probably just deactivate the edit button
                await this.display_callback()
            } else {
                Object.assign(tournament, json_data)
                await this.display(tournament)
            }
        } else {
            window.location.href = response.url
        }
    }
}
