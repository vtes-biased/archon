import * as base from "../base"
import * as d from "../d"
import * as member from "../member"
import * as utils from "../utils"
import * as bootstrap from 'bootstrap'
import { Engine } from "./engine"
import { SanctionPlayerModal } from "../modals/sanction_player"
import { SeedFinalsModal } from "../modals/seed_finals"

enum PlayerFilter {
    ALL = "All",
    UNCHECKED = "Unchecked",
}

enum PlayerOrder {
    VEKN = "VEKN",
    NAME = "Name",
    SCORE = "Score",
    STATUS = "Status",
}

export interface RegistrationContainer {
    sanction_player_modal: SanctionPlayerModal
    seed_finals_modal: SeedFinalsModal
    confirmation: base.ConfirmationModal
    add_member_modal: member.AddMemberModal
    members_map: member.MembersDB
    warn_about_player: (player_uid: string) => Promise<boolean>
}

export class Registration {
    engine: Engine
    container: RegistrationContainer
    panel: HTMLDivElement
    toast_container: HTMLDivElement
    tooltips: base.TooltipManager
    action_row: HTMLDivElement
    self_checkin: HTMLInputElement
    register_element: member.PersonLookup
    filter_switch: HTMLInputElement
    filter_label: HTMLLabelElement
    players_count: HTMLDivElement
    players_table: HTMLTableElement
    players_table_body: HTMLTableSectionElement
    filter: PlayerFilter
    order: PlayerOrder
    constructor(engine: Engine, container: RegistrationContainer, panel: HTMLDivElement) {
        this.engine = engine
        this.container = container
        this.tooltips = new base.TooltipManager()
        this.filter = PlayerFilter.ALL
        if (this.engine?.tournament?.rounds?.length || 0 > 0) {
            this.order = PlayerOrder.SCORE
        } else {
            this.order = PlayerOrder.NAME
        }
        this.panel = panel
        const toast_div = base.create_append(this.panel, "div", ["position-relative"],
            { ariaAtomic: true, ariaLive: "polite" }
        )
        this.toast_container = base.create_append(toast_div, "div", ["toast-container", "top-0", "end-0", "p-2"])
        this.action_row = base.create_append(this.panel, "div", ["d-xl-flex", "my-4"])
        const registration_controls = base.create_append(this.panel, "div", ["d-md-flex", "my-2"])
        this.register_element = new member.PersonLookup(
            this.container.members_map, registration_controls, "Register", true
        )
        this.register_element.form.addEventListener("submit", (ev) => { this.add_player(ev) })
        const add_member_button = base.create_append(
            registration_controls, "button", ["btn", "btn-primary", "me-2", "mb-2"], { type: "button" }
        )
        add_member_button.innerText = "New member"
        this.tooltips.add(add_member_button, "Add a new VEKN member: check they do not exist first")
        add_member_button.addEventListener("click", (ev) => { this.container.add_member_modal.show() })
        const table_div = base.create_append(this.panel, "div", ["my-4"])
        const table_controls = base.create_append(table_div, "div", ["d-flex", "align-items-center"])
        const order_dropdown = base.create_append(table_controls, "div", ["dropdown", "me-4"])
        const order_button = base.create_append(order_dropdown, "button",
            ["btn", "btn-sm", "btn-secondary", "dropdown-toggle"], { type: "button" }
        )
        order_button.dataset.bsToggle = "dropdown"
        order_button.innerHTML = '<i class="bi bi-filter-circle-fill"></i>'
        const dropdown_menu = base.create_append(order_dropdown, "ul", ["dropdown-menu"])
        for (const sort_type of Object.values(PlayerOrder)) {
            const li = base.create_append(dropdown_menu, "li", [])
            const button = base.create_append(li, "button", ["dropdown-item"], { type: "button" })
            button.innerText = sort_type
            button.addEventListener("click", (ev) => { this.order = sort_type; this.display() })
        }
        bootstrap.Dropdown.getOrCreateInstance(order_dropdown)
        const filter_switch_div = base.create_append(table_controls, "div", ["form-check", "form-switch", "me-4"])
        this.filter_switch = base.create_append(filter_switch_div, "input", ["form-check-input"],
            { type: "checkbox", role: "switch", id: "filterSwitch" }
        )
        this.tooltips.add(this.filter_switch, "Filter out checked-in players")
        this.filter_label = base.create_append(filter_switch_div, "label", ["form-check-label", "text-nowrap"],
            { for: "filterSwitch" }
        )
        this.filter = PlayerFilter.ALL
        this.filter_switch.checked = false
        this.filter_label.innerText = "Filter checked-in"
        this.filter_switch.addEventListener("change", (ev) => this.toggle_filter())
        this.players_count = base.create_append(table_controls, "div")
        this.players_table = base.create_append(table_div, "table", ["table", "table-striped", "table-sm", "table-responsive"])
        const head = base.create_append(this.players_table, "thead")
        const row = base.create_append(head, "tr", ["align-middle", "smaller-font"])
        for (const label of ["VEKN #", "Name", "Rank", "Status", ""]) {
            const cel = base.create_append(row, "th", [], { scope: "col" })
            cel.innerText = label
        }
        this.players_table_body = base.create_append(this.players_table, "tbody")
    }
    sorted_players() {
        if (!this.engine.tournament) { return [] }
        var players = utils.ranked_players(this.engine.tournament)
        if (this.filter == PlayerFilter.UNCHECKED) {
            players = players.filter(([r, p]) => p.state != d.PlayerState.CHECKED_IN)
        }
        switch (this.order) {
            case PlayerOrder.NAME:
                players.sort(([r1, p1], [r2, p2]) => p1.name.localeCompare(p2.name))
                break;
            case PlayerOrder.SCORE:
                players.sort(([r1, p1], [r2, p2]) => r1 === r2 ? p1.name.localeCompare(p2.name) : (r1 < r2 ? -1 : 1))
                break
            case PlayerOrder.STATUS:
                const idx = {
                    "Playing": 0,
                    "Checked-in": 1,
                    "Registered": 2,
                    "Finished": 3,
                }
                players.sort(([r1, p1], [r2, p2]) =>
                    idx[p1.state.valueOf()] === idx[p2.state.valueOf()] ? p1.name.localeCompare(p2.name) : (
                        idx[p1.state.valueOf()] < idx[p2.state.valueOf()] ? -1 : 1
                    )
                )
                break
            case PlayerOrder.VEKN:
                players.sort(([r1, p1], [r2, p2]) =>
                    p1.vekn == p2.vekn ? p1.name.localeCompare(p2.name) : p1.vekn?.localeCompare(p2.vekn ?? "") ?? 0
                )
                break
        }
        return players
    }
    toggle_filter() {
        if (this.filter_switch.checked) {
            this.filter = PlayerFilter.UNCHECKED
        } else {
            this.filter = PlayerFilter.ALL
        }
        this.display()
    }
    display() {
        this.tooltips.dispose()
        this.register_element.reset()
        base.remove_children(this.players_table_body)
        const players = this.sorted_players()
        base.remove_children(this.players_count)
        if (!this.engine.tournament) { return }
        const checked_in_count = (
            Object.values(this.engine.tournament.players)
                .filter(p => p.state == d.PlayerState.CHECKED_IN)
                .map(p => p.uid).length
        )
        const finished_count = (
            Object.values(this.engine.tournament.players)
                .filter(p => p.state == d.PlayerState.FINISHED)
                .map(p => p.uid).length
        )
        base.create_append(this.players_count, "div", ["me-2", "mb-1", "badge", "text-bg-secondary"]
        ).innerText = `${players.length} players`
        base.create_append(this.players_count, "div", ["me-2", "mb-1", "badge", "text-bg-success"]
        ).innerText = `${checked_in_count} checked-in`
        base.create_append(this.players_count, "div", ["me-2", "mb-1", "badge", "text-bg-danger"]
        ).innerText = `${finished_count} finished`
        for (const [rank, player] of players) {
            const row = base.create_append(this.players_table_body, "tr", ["align-middle"])
            const head = base.create_append(row, "th", ["text-nowrap", "smaller-font"], { scope: "row" })
            head.innerText = player.vekn ?? ""
            const name = base.create_append(row, "td", ["w-100", "smaller-font"])
            name.innerText = player.name
            const score = base.create_append(row, "td", ["text-nowrap", "smaller-font"])
            score.innerHTML = utils.full_score_string(player, rank)
            const state = base.create_append(row, "td", ["text-nowrap", "smaller-font"])
            var color_cls: string
            switch (player.state) {
                case d.PlayerState.CHECKED_IN:
                    color_cls = "text-bg-success"
                    break;
                case d.PlayerState.REGISTERED:
                    color_cls = "text-bg-info"
                    break;
                case d.PlayerState.PLAYING:
                    color_cls = "text-bg-warning"
                    break;
                case d.PlayerState.FINISHED:
                    color_cls = "text-bg-danger"
                    break;
            }
            state.innerHTML = `<span class="badge ${color_cls} align-text-top">${player.state}</span>`
            const actions = base.create_append(row, "td", ["text-nowrap"])
            const button = base.create_append(actions, "button", ["btn", "btn-sm", "me-2"])
            button.innerHTML = '<i class="bi bi-info-circle-fill"></i>'
            this.tooltips.add(button, "Decklist & sanctions")
            button.addEventListener("click", (ev) => {
                this.container.sanction_player_modal.show(player.uid, undefined, undefined)
            })
            this.container.warn_about_player(player.uid).then((warn: boolean) => {
                if (warn) {
                    button.classList.add("btn-warning")
                } else {
                    button.classList.add("btn-primary")
                }
            })
            if (!this.engine.tournament) { return }
            if (this.engine.tournament.state == d.TournamentState.WAITING) {
                if (player.state == d.PlayerState.REGISTERED || player.state == d.PlayerState.FINISHED) {
                    if (player.barriers?.length && player.barriers.length > 0) {
                        const span = base.create_append(actions, "span", [], { tabindex: "0" })
                        const button = base.create_append(span, "button", ["btn", "btn-sm", "btn-success", "me-2"])
                        button.innerHTML = '<i class="bi bi-box-arrow-in-right"></i>'
                        button.disabled = true
                        this.tooltips.add(span, player.barriers[0])
                        state.innerHTML += ` (${player.barriers[0]})`
                    } else {
                        const button = base.create_append(actions, "button", ["btn", "btn-sm", "btn-success", "me-2"])
                        button.innerHTML = '<i class="bi bi-box-arrow-in-right"></i>'
                        this.tooltips.add(button, "Check in")
                        button.addEventListener("click", (ev) => { this.check_in(player) })
                    }
                } else if (player.state == d.PlayerState.CHECKED_IN) {
                    const button = base.create_append(actions, "button", ["btn", "btn-sm", "btn-warning", "me-2"])
                    button.innerHTML = '<i class="bi bi-box-arrow-left"></i>'
                    this.tooltips.add(button, "Check out")
                    button.addEventListener("click", (ev) => { this.check_out(player) })
                }
            }
            if (this.engine.tournament.state == d.TournamentState.PLANNED
                || this.engine.tournament.state == d.TournamentState.REGISTRATION
                || this.engine.tournament.state == d.TournamentState.FINISHED
                || this.engine.tournament.state == d.TournamentState.WAITING
            ) {
                if (player.state == d.PlayerState.REGISTERED || player.state == d.PlayerState.CHECKED_IN) {
                    const button = base.create_append(actions, "button", ["btn", "btn-sm", "btn-danger", "me-2"])
                    button.innerHTML = '<i class="bi bi-x-circle-fill"></i>'
                    this.tooltips.add(button, "Drop")
                    button.addEventListener("click", (ev) => { this.drop(player) })
                }
            }
        }
        base.remove_children(this.action_row)
        if (this.engine.tournament.state == d.TournamentState.PLANNED ||
            this.engine.tournament.state == d.TournamentState.REGISTRATION ||
            this.engine.tournament.state == d.TournamentState.WAITING
        ) {
            const standings_select = base.create_append(this.action_row, "select", ["form-select", "me-2", "mb-2", "w-auto"])
            for (const o of Object.values(d.StandingsMode)) {
                const option = base.create_append(standings_select, "option", [],
                    { value: o, label: `Standings: ${o}` }
                )
                if (o == this.engine.tournament?.standings_mode) {
                    option.selected = true
                }
            }
            this.tooltips.add(standings_select, "What standings information players see")
            standings_select.addEventListener("change", async (ev) => {
                await this.engine.update_config(
                    { standings_mode: standings_select.value }
                )
            })
        }
        if (this.engine.tournament.state == d.TournamentState.PLANNED) {
            const button = base.create_append(this.action_row, "button",
                ["me-2", "mb-2", "text-nowrap", "btn", "btn-success"]
            )
            button.innerText = "Open Registration"
            this.tooltips.add(button, "Open player registration")
            button.addEventListener("click", (ev) => { this.engine.open_registration() })
        }
        if (this.engine.tournament.state == d.TournamentState.REGISTRATION) {
            const close_button = base.create_append(this.action_row, "button",
                ["me-2", "mb-2", "text-nowrap", "btn", "btn-secondary"]
            )
            close_button.innerText = "Close Registration"
            this.tooltips.add(close_button, "Close player registration")
            close_button.addEventListener("click", (ev) => { this.engine.close_registration() })

            const button = base.create_append(this.action_row, "button",
                ["me-2", "mb-2", "text-nowrap", "btn", "btn-success"]
            )
            button.innerText = "Open Check-In"
            this.tooltips.add(button, "Start listing present players")
            button.addEventListener("click", (ev) => { this.engine.open_checkin() })
        }
        if ((this.engine.tournament.state == d.TournamentState.REGISTRATION ||
            this.engine.tournament.state == d.TournamentState.WAITING ||
            this.engine.tournament.state == d.TournamentState.FINISHED)
            && this.engine.tournament.rounds.length > 0
        ) {
            const print_standings = base.create_append(this.action_row, "a",
                ["me-2", "mb-2", "text-nowrap", "btn", "btn-secondary"],
                { target: "_blank" },
            )
            print_standings.innerHTML = '<i class="bi bi-printer-fill"></i> Standings'
            print_standings.href = `/tournament/${this.engine.tournament.uid}/print-standings.html`
        }
        if (this.engine.tournament.state == d.TournamentState.PLANNED ||
            this.engine.tournament.state == d.TournamentState.REGISTRATION ||
            this.engine.tournament.state == d.TournamentState.WAITING
        ) {
            const checkin_code = base.create_append(this.action_row, "a",
                ["me-2", "mb-2", "text-nowrap", "btn", "btn-primary"], { target: "_blank", purpose: "button" }
            )
            checkin_code.innerHTML = '<i class="bi bi-qr-code"></i> Display Check-in code'
            checkin_code.href = `/tournament/${this.engine.tournament.uid}/checkin.html`
            this.tooltips.add(checkin_code, "Display the QR code players can scan to check in")
        }
        if (this.engine.tournament.state == d.TournamentState.WAITING) {
            const cancel_checkin_button = base.create_append(this.action_row, "button",
                ["me-2", "mb-2", "text-nowrap", "btn", "btn-secondary"]
            )
            cancel_checkin_button.innerText = "Cancel Check-in"
            this.tooltips.add(cancel_checkin_button, "Back to registration - checks everyone out.")
            cancel_checkin_button.addEventListener("click", (ev) => {
                this.container.confirmation.show(
                    "<strong>All player will be checked out</strong> <br>" +
                    `<em>Close the check-in stage and go back to the previous step.</em>`,
                    () => this.engine.cancel_checkin()
                )
            })
        }
        if (this.engine.tournament.state == d.TournamentState.WAITING) {
            const checkin_button = base.create_append(this.action_row, "button",
                ["me-2", "mb-2", "text-nowrap", "btn", "btn-primary"]
            )
            checkin_button.innerText = "Check everyone in"
            this.tooltips.add(checkin_button, "Check all Registered players in. Drop absentees first.")
            checkin_button.addEventListener("click", (ev) => { this.check_everyone_in() })
        }
        if (this.engine.tournament.state == d.TournamentState.WAITING) {
            const seat_span = base.create_append(this.action_row, "span", [], { tabindex: "0" })
            var seat_button_text = `Seat Round ${this.engine.tournament.rounds.length + 1}`
            var seat_button_disabled = false
            var seat_button_color_class = "btn-success"
            var tooltip_message: string
            if (checked_in_count == 0) {
                seat_button_text += " (Empty)"
                seat_button_color_class = "btn-warning"
                tooltip_message = "Start empty round (no player checked in)"
            } else if (checked_in_count < 4 || [6, 7, 11].includes(checked_in_count)) {
                seat_button_disabled = true
                seat_button_color_class = "btn-danger"
                tooltip_message = `Invalid check-in (${checked_in_count})`
            } else {
                tooltip_message = "Start next round"
                seat_button_color_class = "btn-success"
            }
            const seat_button = base.create_append(seat_span, "button",
                ["me-2", "mb-2", "text-nowrap", "btn", seat_button_color_class]
            )
            seat_button.disabled = seat_button_disabled
            seat_button.innerText = seat_button_text
            const seat_tooltip = this.tooltips.add(seat_span, tooltip_message)
            seat_button.addEventListener("click", async (ev) => {
                seat_button.disabled = true
                seat_tooltip.hide()
                seat_button.innerHTML = (
                    '<span class="spinner-border spinner-border-sm me-2" '
                    + 'role="status" aria-hidden="true"></span>'
                    + 'Computing...'
                )
                // allow the UI to update before calling start_round
                await new Promise(resolve => setTimeout(resolve, 0))
                await this.engine.start_round()
                seat_button.innerText = seat_button_text
                seat_button.disabled = false
            })
        }
        if (this.engine.tournament.state == d.TournamentState.PLANNED ||
            this.engine.tournament.state == d.TournamentState.REGISTRATION ||
            this.engine.tournament.state == d.TournamentState.WAITING
        ) {
            if (this.engine.tournament.rounds.length > 1) {
                const finals_button = base.create_append(this.action_row, "button",
                    ["me-2", "mb-2", "text-nowrap", "btn", "btn-success"]
                )
                finals_button.innerText = "Seed Finals"
                this.tooltips.add(finals_button, "Start the finals when you are done with the rounds")
                finals_button.addEventListener("click", (ev) => {
                    this.container.seed_finals_modal.show()
                })
            }
        }
    }

    add_player(ev: SubmitEvent) {
        ev.preventDefault()
        if (!this.register_element.person) { return }
        this.engine.register_player(this.register_element.person)
        this.alert(`Registered ${this.register_element.person.name}`)
        this.register_element.input_name.focus()
    }
    async check_everyone_in() {
        if (!this.engine.tournament) { return }
        const candidates = Object.values(this.engine.tournament.players).filter(
            p => p.state == d.PlayerState.REGISTERED && p.barriers?.length || 0 == 0
        )
        if (candidates.length < 1) {
            this.alert("Nobody was checked in. Check the Info tab: If you require decklists, " +
                "players cannot be checked in without one.", d.AlertLevel.WARNING)
        }
        this.engine.check_everyone_in()
    }
    async check_in(player: d.Player) {
        await this.engine.check_in(player.uid)
    }

    async check_out(player: d.Player) {
        const res = await this.engine.check_out(player.uid)
        if (res) {
            this.alert(`Checked ${player.name} out`)
        }
    }

    async drop(player: d.Player) {
        const res = await this.engine.drop(player.uid)
        if (res) {
            this.alert(`Dropped ${player.name}`)
        }
    }

    alert(message: string, level: d.AlertLevel = d.AlertLevel.INFO) {
        var background: string
        var icon: string
        switch (level) {
            case d.AlertLevel.INFO:
                background = "bg-info-subtle"
                icon = '<i class="bi bi-info-circle-fill"></i>'
                break;
            case d.AlertLevel.SUCCESS:
                background = "bg-success-subtle"
                icon = '<i class="bi bi-info-circle-fill"></i>'
                break;
            case d.AlertLevel.WARNING:
                background = "bg-warning-subtle"
                icon = '<i class="bi bi-exclamation-circle-fill"></i>'
                break;
            case d.AlertLevel.DANGER:
                background = "bg-danger-subtle"
                icon = '<i class="bi bi-exclamation-circle-fill"></i>'
                break;
        }
        const toast = base.create_prepend(this.toast_container, "div",
            ["toast", "align-items-center", "border-0"],
            { ariaLive: "assertive", ariaAtomic: "true" }
        )
        const flex_div = base.create_append(toast, "div", ["d-flex", background])
        const body = base.create_append(flex_div, "div", ["toast-body"])
        body.innerHTML = `${icon} ${message}`
        const close_button = base.create_append(flex_div, "button",
            ["btn-close", "me-2", "m-auto"],
            { ariaLabel: "Close" }
        )
        close_button.dataset.bsDismiss = "toast"
        const bs_toast = bootstrap.Toast.getOrCreateInstance(toast, { delay: 2000 })
        bs_toast.show()
    }
}
