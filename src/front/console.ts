import * as d from "./d"
import * as base from "./base"
import * as events from "./events"
import * as member from "./member"
import * as seating from "./seating"
import * as utils from "./utils"
import { TournamentDisplay, DeckSubmit } from "./tournament"
import * as bootstrap from 'bootstrap'
import * as uuid from 'uuid'


class PlayerSelectModal extends base.Modal {
    select: HTMLSelectElement
    round_tab: RoundTab | undefined
    empty_row: HTMLTableRowElement | undefined
    players: Map<string, d.Player>
    constructor(el: HTMLElement, title: string = "Add player") {
        super(el)
        this.modal_title.innerText = title
        const form = base.create_append(this.modal_body, "form")
        this.select = base.create_append(form, "select", ["form-select"], { name: "select-player" })
        base.create_append(this.select, "option", [], { value: "", label: "" })
        this.select.addEventListener("change", (ev) => this.select_player())
        this.players = new Map()
    }

    init(round_tab: RoundTab, players: d.Player[]) {
        this.round_tab = round_tab
        this.players.clear()
        for (const player of players) {
            this.players.set(player.uid, player)
        }
    }

    show(empty_row: HTMLTableRowElement) {
        this.empty_row = empty_row
        while (this.select.options.length > 1) {
            this.select.options.remove(1)
        }
        const players = [...this.players.values()].sort((a, b) => a.name.localeCompare(b.name))
        for (const player of players) {
            base.create_append(this.select, "option", [], {
                value: player.uid,
                label: `${player.name} (#${player.vekn})`
            })
        }
        this.modal.show()
    }

    select_player() {
        const player = this.players.get(this.select.selectedOptions[0].value)
        if (!player) { return }
        this.round_tab.add_player(this.empty_row, player)
        this.modal.hide()
    }

    add(player: d.Player) {
        this.players.set(player.uid, player)
    }

    remove(player: d.Player) {
        this.players.delete(player.uid)
    }
}

class SanctionPlayerModal extends base.Modal {
    deck_link: HTMLAnchorElement
    deck_submit: DeckSubmit
    sanctions_accordion: HTMLDivElement
    sanction_idx: number
    form: HTMLFormElement
    comment: HTMLTextAreaElement
    level: HTMLSelectElement
    category: HTMLSelectElement
    submit_button: HTMLButtonElement
    cancel_button: HTMLButtonElement
    console: TournamentConsole
    member: d.Person | null
    round: number | undefined
    seat: d.TableSeat | undefined
    constructor(el: HTMLElement, console: TournamentConsole) {
        super(el)
        this.console = console
        this.member = null
        this.modal_title.innerText = "Sanction Member"  // Update to player name in display()
        const nav = base.create_append(this.modal_body, "nav", ["nav", "nav-tabs", "w-100", "mb-2"], { role: "tablist" })
        const tabs_div = base.create_append(this.modal_body, "div", ["tab-content", "w-100"])
        const sanctions_button = base.create_append(nav, "button", ["nav-link"], {
            id: `nav-modal-sanctions`,
            "data-bs-toggle": "tab",
            "data-bs-target": `#tab-modal-sanctions`,
            type: "button",
            role: "tab",
            "aria-controls": "nav-home",
            "aria-selected": "true",
        })
        sanctions_button.innerText = "Sanctions"
        const sanctions_tab = base.create_append(tabs_div, "div", ["tab-pane", "fade"], {
            id: `tab-modal-sanctions`,
            role: "tabpanel",
            "aria-labelledby": `nav-modal-sanctions`
        })
        const sanctions_tab_trigger = new bootstrap.Tab(sanctions_button)
        sanctions_button.addEventListener('click', function (event) {
            event.preventDefault()
            sanctions_tab_trigger.show()
        })
        const decks_button = base.create_append(nav, "button", ["nav-link"], {
            id: `nav-modal-decks`,
            "data-bs-toggle": "tab",
            "data-bs-target": `#tab-modal-decks`,
            type: "button",
            role: "tab",
            "aria-controls": "nav-home",
            "aria-selected": "true",
        })
        decks_button.innerText = "Deck list"
        const decks_tab = base.create_append(tabs_div, "div", ["tab-pane", "fade"], {
            id: `tab-modal-decks`,
            role: "tabpanel",
            "aria-labelledby": `nav-modal-decks`
        })
        const decks_tab_trigger = new bootstrap.Tab(decks_button)
        decks_button.addEventListener('click', function (event) {
            event.preventDefault()
            decks_tab_trigger.show()
        })
        sanctions_tab_trigger.show()
        this.deck_submit = new DeckSubmit(decks_tab, (a, b, c) => this.submit_deck(a, b, c), this.modal_div)
        this.sanctions_accordion = base.create_append(sanctions_tab, "div", ["accordion"],
            { id: "sanctionAccordion" }
        )
        // Add existing sanctions in show()
        this.form = base.create_append(sanctions_tab, "form")
        this.comment = base.create_append(this.form, "textarea", ["form-control", "my-2"],
            { type: "text", autocomplete: "new-comment", rows: 3, maxlength: 500, name: "new-comment" }
        )
        this.comment.ariaAutoComplete = "none"
        this.comment.spellcheck = false
        this.comment.placeholder = "Comment"
        const select_div = base.create_append(this.form, "div", ["d-flex", "gap-1"])
        const level_div = base.create_append(select_div, "div", ["form-floating"])
        this.level = base.create_append(level_div, "select", ["form-select", "my-2"], { id: "sanctionFormLevel" })
        this.level.ariaLabel = "Level"
        base.create_append(level_div, "label", [], { for: "sanctionFormLevel" }).innerText = "Level"
        for (const level of Object.values(events.SanctionLevel)) {
            this.level.options.add(base.create_element("option", [], { value: level, label: level }))
        }
        this.level.required = true
        const category_div = base.create_append(select_div, "div", ["form-floating"])
        this.category = base.create_append(category_div, "select", ["form-select", "my-2"],
            { id: "sanctionFormCategory" }
        )
        this.category.ariaLabel = "Category"
        base.create_append(category_div, "label", [], { for: "sanctionFormCategory" }).innerText = "Category"
        this.category.options.add(base.create_element("option", [], { value: "", label: "N/A" }))
        for (const category of Object.values(events.SanctionCategory)) {
            this.category.options.add(base.create_element("option", [], { value: category, label: category }))
        }
        this.category.required = false
        const buttons_div = base.create_append(this.form, "div", ["d-flex", "my-2"])
        this.submit_button = base.create_append(buttons_div, "button", ["btn", "btn-primary", "me-2"],
            { type: "submit" }
        )
        this.submit_button.innerText = "Submit"
        this.form.addEventListener("submit", (ev) => this.submit(ev))
        this.cancel_button = base.create_append(buttons_div, "button", ["btn", "btn-secondary", "me-2"],
            { type: "button" }
        )
        this.cancel_button.innerText = "Cancel"
        this.cancel_button.addEventListener("click", (ev) => { this.member = null; this.modal.hide() })
    }
    async show(member_uid: string, round: number | undefined, seat: d.TableSeat | undefined) {
        this.member = await this.console.members_map.get_by_uid(member_uid)
        this.round = round
        this.seat = seat
        this.modal_title.innerText = this.member.name
        this.comment.value = ""
        this.level.selectedIndex = 0
        this.category.selectedIndex = 0
        base.remove_children(this.sanctions_accordion)
        this.sanction_idx = 0
        for (const sanction of this.member.sanctions ?? []) {
            if (sanction.tournament?.uid == this.console.tournament.uid) {
                continue
            }
            this.add_sanction_display(sanction)
        }
        for (const sanction of this.console.tournament.sanctions[member_uid] ?? []) {
            this.add_sanction_display(sanction)
        }
        const collapsibles: HTMLDivElement[] = [].slice.call(this.sanctions_accordion.querySelectorAll(".collapse"))
        const bs_col = collapsibles.map(
            el => new bootstrap.Collapse(el, { toggle: false, parent: this.sanctions_accordion })
        )
        if (bs_col.length > 0) {
            bs_col[bs_col.length - 1].show()
        }
        this.display()
        this.modal.show()
    }
    display() {
        this.deck_submit.init(this.member.uid, this.console.tournament, this.round)
    }
    async submit_deck(player_uid: string, deck: string, round: number | undefined) {
        await this.console.set_deck(player_uid, deck, round)
        this.display()
    }
    add_sanction_display(sanction: d.Sanction) {
        this.sanction_idx += 1
        const id = `prev-sanction-col-item-${this.sanction_idx}`
        const head_id = `prev-sanction-col-head-${this.sanction_idx}`
        const item = base.create_append(this.sanctions_accordion, "div", ["accordion-item"])
        item.dataset.uid = sanction.uid
        const header = base.create_append(item, "h2", ["accordion-header"], { id: head_id })
        const button = base.create_append(header, "button", ["accordion-button", "collapsed"], {
            type: "button",
            "data-bs-toggle": "collapse",
            "data-bs-target": `#${id}`,
            "aria-expanded": "false",
            "aria-controls": id,
        })
        // additional display for RegisteredSanction from previous tournaments
        if (Object.hasOwn(sanction, "tournament")) {
            const rsanction = sanction as d.RegisteredSanction
            if (rsanction.tournament) {
                const timestamp = utils.date_string(rsanction.tournament)
                button.innerText = `(${timestamp}: ${rsanction.tournament?.name})`
            }
        }
        const level_badge = base.create_append(button, "div", ["badge", "mx-1"])
        level_badge.innerText = sanction.level
        switch (sanction.level) {
            case events.SanctionLevel.CAUTION:
                level_badge.classList.add("text-bg-secondary")
                break;
            case events.SanctionLevel.WARNING:
                level_badge.classList.add("text-bg-warning")
                break;
            case events.SanctionLevel.DISQUALIFICATION:
                level_badge.classList.add("text-bg-danger")
                break;
        }
        if (sanction.category != events.SanctionCategory.NONE) {
            const category_badge = base.create_append(button, "div", ["badge", "mx-1", "text-bg-secondary"])
            category_badge.innerText = sanction.category
        }
        const collapse = base.create_append(item, "div", ["accordion-collapse", "collapse"], {
            "aria-labelledby": head_id, "data-bs-parent": "#sanctionAccordion"
        })
        collapse.id = id
        const body = base.create_append(collapse, "div", ["accordion-body"])
        body.innerText = sanction.comment
        const prefix = base.create_prepend(body, "div",
            ["border-top", "border-bottom", "border-info", "bg-info", "bg-opacity-10", "d-flex", "p-1", "mb-2"]
        )
        if (sanction.judge) {
            const author = base.create_append(prefix, "div", ["me-2"])
            author.innerText = `Issued by ${sanction.judge.name}`
        }
        // Remove button only for current tournament sanctions
        if (!Object.hasOwn(sanction, "tournament_name")) {
            const remove_button = base.create_append(prefix, "div", ["btn", "badge", "btn-danger"])
            remove_button.innerHTML = '<i class="bi bi-trash"></i>'
            remove_button.addEventListener("click", (ev) => this.remove_sanction(sanction.uid))
        }
    }

    async submit(ev: SubmitEvent) {
        ev.preventDefault()
        const sanction_uid: string = uuid.v4()
        var tev = {
            uid: uuid.v4(),
            type: events.EventType.SANCTION,
            sanction_uid: sanction_uid,
            player_uid: this.member.uid,
            level: this.level.value,
            category: this.category.value,
            comment: this.comment.value,
        } as events.Sanction
        const tournament = await this.console.handle_tournament_event(tev)
        if (!tournament) { return }
        this.comment.value = ""
        const sanctions = tournament.sanctions[this.member.uid]
        for (const sanction of sanctions ?? []) {
            if (sanction.uid == sanction_uid) {
                this.add_sanction_display(sanction)
            }
        }
    }

    async remove_sanction(sanction_uid: string) {
        var tev = {
            uid: uuid.v4(),
            type: events.EventType.UNSANCTION,
            sanction_uid: sanction_uid,
            player_uid: this.member.uid,
        } as events.Unsanction
        const tournament = await this.console.handle_tournament_event(tev)
        if (!tournament) { return }
        for (const item of this.sanctions_accordion.querySelectorAll(".accordion-item") as NodeListOf<HTMLDivElement>) {
            if (item.dataset.uid == sanction_uid) {
                item.remove()
            }
        }
    }
}


class SeedFinalsModal extends base.Modal {
    alert: HTMLDivElement
    form: HTMLDivElement
    players_table: HTMLTableElement
    players_table_body: HTMLTableSectionElement
    players: d.Player[]
    to_toss: d.Player[][]
    submit_button: HTMLButtonElement
    toss_button: HTMLButtonElement
    console: TournamentConsole
    constructor(el: HTMLElement, console: TournamentConsole) {
        super(el)
        this.console = console
        this.modal_title.innerText = "Finals seeding"
        const alert = base.create_append(this.modal_body, "div", ["alert", "alert-info"], { role: "alert" })
        alert.innerText = (
            "Make sure those players are available for the finals. " +
            "Close and drop or check-in players to adjust."
        )
        // WARNING: don't use a form here, even if we have the toss number as inputs.
        // It breaks on Firefox in a strange way: failing to parse the form data itself
        // makes it raise a Network error on the fetch sending the event there...
        this.players_table = base.create_append(this.modal_body, "table", ["table", "table-sm"])
        const head = base.create_append(this.players_table, "thead")
        const row = base.create_append(head, "tr", ["align-middle"])
        for (const label of ["Rank", "Toss", "Player"]) {
            const cel = base.create_append(row, "th", [], { scope: "col" })
            cel.innerText = label
        }
        this.players_table_body = base.create_append(this.players_table, "tbody")
        const buttons_div = base.create_append(this.modal_body, "div", ["d-flex", "my-2"])
        this.submit_button = base.create_append(buttons_div, "button", ["btn", "btn-primary", "me-2"],
            { type: "submit" }
        )
        this.submit_button.innerText = "Submit"
        this.submit_button.addEventListener("click", async (ev) => await this.submit())
        this.toss_button = base.create_append(buttons_div, "button", ["btn", "btn-warning", "me-2"],
            { type: "button" }
        )
        this.toss_button.innerHTML = `<i class="bi bi-coin"></i> Toss`
        const tooltip = base.add_tooltip(this.toss_button, "Toss to break ties")
        this.toss_button.addEventListener("click", (ev) => { ev.preventDefault(); tooltip.hide(); this.do_toss() })
        this.to_toss = []
    }

    show() {
        this.players = []
        for (const [rank, player] of utils.standings(this.console.tournament, undefined, true)) {
            if (rank > 5) {
                break
            }
            this.players.push(player)
        }
        this.modal.show()
        this.display()
    }

    display() {
        base.remove_children(this.players_table_body)
        var last_rank: number = 0
        var last_row: HTMLTableRowElement
        var last_player: d.Player
        var toss_basket: d.Player[]
        for (const [rank, player] of utils.standings(this.console.tournament, this.players)) {
            const row = base.create_append(this.players_table_body, "tr", ["align-middle"])
            const score_cell = base.create_append(row, "td", ["text-nowrap"])
            score_cell.innerHTML = utils.full_score_string(player, rank)
            const toss_cel = base.create_append(row, "td", ["text-nowrap"])
            const toss = base.create_append(toss_cel, "input", ["border", "form-control-sm"],
                { type: "number", min: "0", max: "5", placeholder: "0", name: `toss-${player.uid}` }
            )
            toss.value = player.toss.toString()
            toss.addEventListener("change", (ev) => this.change_toss(parseInt(toss.value), player))
            const name = base.create_append(row, "td", ["w-100"])
            name.innerText = `#${player.vekn} ${player.name}`
            if (rank == last_rank) {
                if (toss_basket) {
                    toss_basket.push(player)
                }
                else {
                    toss_basket = [last_player, player]
                    for (const cel of last_row.children) {
                        cel.classList.add("bg-warning-subtle")
                    }
                }
                for (const cel of row.children) {
                    cel.classList.add("bg-warning-subtle")
                }
            } else {
                if (toss_basket) {
                    this.to_toss.push(toss_basket)
                    toss_basket = undefined
                }
            }
            last_rank = rank
            last_row = row
            last_player = player
        }
        if (toss_basket) {
            this.to_toss.push(toss_basket)
            toss_basket = undefined
        }
        if (this.to_toss.length > 0) {
            this.submit_button.disabled = true
            this.toss_button.disabled = false
            this.toss_button.classList.remove("invisible")
            this.toss_button.classList.add("visible")
        } else {
            this.submit_button.disabled = false
            this.toss_button.disabled = true
            this.toss_button.classList.remove("visible")
            this.toss_button.classList.add("invisible")
        }
    }

    async submit() {
        const toss = {}
        const seeds = []
        for (const player of this.players) {
            toss[player.uid] = player.toss
        }
        for (const [rank, player] of utils.standings(this.console.tournament, this.players)) {
            if (rank > 5) { break }
            seeds.push(player.uid)
        }
        await this.console.seed_finals(seeds, toss)
        this.modal.hide()
    }

    do_toss() {
        for (const player of this.players) {
            player.toss = 0
        }
        for (const basket of this.to_toss) {
            seating.shuffle_array(basket)
            var idx: number = 1
            for (const player of basket) {
                player.toss = idx++
            }
        }
        this.to_toss = []
        this.display()
    }

    change_toss(value: number, player: d.Player) {
        player.toss = value
        this.display()
    }
}

class OverrideModal extends base.Modal {
    alert: HTMLDivElement
    form: HTMLFormElement
    comment: HTMLTextAreaElement
    submit_button: HTMLButtonElement
    remove_button: HTMLButtonElement
    cancel_button: HTMLButtonElement
    console: TournamentConsole
    round: number | undefined
    table_number: number | undefined
    constructor(el: HTMLElement, console: TournamentConsole) {
        super(el)
        this.console = console
        this.modal_title.innerText = "Override Table"
        this.alert = base.create_append(this.modal_body, "div", ["alert", "alert-info"], { role: "alert" })
        this.form = base.create_append(this.modal_body, "form", ["w-100"])
        this.comment = base.create_append(this.form, "textarea", ["form-control", "my-2"],
            { type: "text", autocomplete: "new-comment", rows: 3, maxlength: 500, name: "new-comment" }
        )
        this.comment.ariaAutoComplete = "none"
        this.comment.spellcheck = false
        this.comment.placeholder = "Comment"
        const buttons_div = base.create_append(this.form, "div", ["d-flex", "my-2"])
        this.submit_button = base.create_append(buttons_div, "button", ["btn", "btn-primary", "me-2"],
            { type: "submit" }
        )
        this.submit_button.innerText = "Submit"
        this.form.addEventListener("submit", (ev) => this.submit(ev))
        this.remove_button = base.create_append(buttons_div, "button", ["btn", "btn-danger", "me-2"],
            { type: "button" }
        )
        this.remove_button.innerHTML = '<i class="bi bi-trash"></i> Remove'
        this.remove_button.addEventListener("click", (ev) => this.unoverride())
        // remove_button hidden/shown in this.show()
        this.cancel_button = base.create_append(buttons_div, "button", ["btn", "btn-secondary", "me-2"],
            { type: "button" }
        )
        this.cancel_button.innerText = "Cancel"
        this.cancel_button.addEventListener("click", (ev) => { this.table_number = undefined; this.modal.hide() })
    }

    show(round: number, table: d.Table, table_number: number) {
        this.round = round
        this.table_number = table_number
        if (table.override) {
            this.comment.value = table.override.comment
            this.remove_button.hidden = false
            this.remove_button.disabled = false
            this.alert.hidden = false
            this.alert.innerText = `Overriden by ${table.override.judge?.name}`
        } else {
            this.comment.value = ""
            this.remove_button.hidden = true
            this.remove_button.disabled = true
            this.alert.hidden = true
            this.alert.innerText = ""
        }
        this.modal.show()
    }

    submit(ev: SubmitEvent) {
        ev.preventDefault()
        const res = this.console.override_table(this.round, this.table_number, this.comment.value)
        if (res) {
            this.modal.hide()
        }
    }

    unoverride() {
        const res = this.console.unoverride_table(this.round, this.table_number)
        if (res) {
            this.modal.hide()
        }
    }
}

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

class Registration {
    console: TournamentConsole
    panel: HTMLDivElement
    toast_container: HTMLDivElement
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
    constructor(console_: TournamentConsole) {
        this.console = console_
        this.filter = PlayerFilter.ALL
        if (this.console.tournament.rounds.length > 0) {
            this.order = PlayerOrder.SCORE
        } else {
            this.order = PlayerOrder.NAME
        }
        this.panel = this.console.add_nav("Registration")
        const toast_div = base.create_append(this.panel, "div", ["position-relative"],
            { ariaAtomic: true, ariaLive: "polite" }
        )
        this.toast_container = base.create_append(toast_div, "div", ["toast-container", "top-0", "end-0", "p-2"])
        this.action_row = base.create_append(this.panel, "div", ["d-md-flex", "my-4"])
        const registration_controls = base.create_append(this.panel, "div", ["d-md-flex", "my-2"])
        this.register_element = new member.PersonLookup(
            this.console.members_map, registration_controls, "Register", true
        )
        this.register_element.form.addEventListener("submit", (ev) => { this.add_player(ev) })
        const add_member_button = base.create_append(
            registration_controls, "button", ["btn", "btn-primary", "me-2", "mb-2"], { type: "button" }
        )
        add_member_button.innerText = "New member"
        const tooltip = base.add_tooltip(add_member_button, "Add a new VEKN member: check they do not exist first")
        add_member_button.addEventListener("click", (ev) => { tooltip.hide(); this.console.add_member_modal.show() })
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
        base.add_tooltip(this.filter_switch, "Filter out checked-in players")
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
        var players = utils.standings(this.console.tournament)
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
                    p1.vekn == p2.vekn ? p1.name.localeCompare(p2.name) : p1.vekn.localeCompare(p2.vekn)
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
        base.remove_children(this.players_table_body)
        const players = this.sorted_players()
        base.remove_children(this.players_count)
        const checked_in_count = (
            Object.values(this.console.tournament.players)
                .filter(p => p.state == d.PlayerState.CHECKED_IN)
                .map(p => p.uid).length
        )
        const finished_count = (
            Object.values(this.console.tournament.players)
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
            head.innerText = player.vekn
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
            const tip = base.add_tooltip(button, "Decklist & sanctions")
            button.addEventListener("click", (ev) => {
                tip.hide()
                this.console.sanction_player_modal.show(player.uid, undefined, undefined)
            })
            if (this.console.warn_about_player(player.uid)) {
                button.classList.add("btn-warning")
            } else {
                button.classList.add("btn-primary")
            }
            if (this.console.tournament.state == d.TournamentState.WAITING) {
                if (player.state == d.PlayerState.REGISTERED || player.state == d.PlayerState.FINISHED) {
                    if (player.barriers.length > 0) {
                        const span = base.create_append(actions, "span", [], { tabindex: "0" })
                        const button = base.create_append(span, "button", ["btn", "btn-sm", "btn-success", "me-2"])
                        button.innerHTML = '<i class="bi bi-box-arrow-in-right"></i>'
                        button.disabled = true
                        base.add_tooltip(span, player.barriers[0])
                        state.innerHTML += ` (${player.barriers[0]})`
                    } else {
                        const button = base.create_append(actions, "button", ["btn", "btn-sm", "btn-success", "me-2"])
                        button.innerHTML = '<i class="bi bi-box-arrow-in-right"></i>'
                        const tip = base.add_tooltip(button, "Check in")
                        button.addEventListener("click", (ev) => { tip.hide(); this.check_in(player) })
                    }
                } else if (player.state == d.PlayerState.CHECKED_IN) {
                    const button = base.create_append(actions, "button", ["btn", "btn-sm", "btn-warning", "me-2"])
                    button.innerHTML = '<i class="bi bi-box-arrow-left"></i>'
                    const tip = base.add_tooltip(button, "Check out")
                    button.addEventListener("click", (ev) => { tip.hide(); this.check_out(player) })
                }
            }
            if (this.console.tournament.state == d.TournamentState.REGISTRATION
                || this.console.tournament.state == d.TournamentState.FINISHED
                || this.console.tournament.state == d.TournamentState.WAITING
            ) {
                if (player.state == d.PlayerState.REGISTERED || player.state == d.PlayerState.CHECKED_IN) {
                    const button = base.create_append(actions, "button", ["btn", "btn-sm", "btn-danger", "me-2"])
                    button.innerHTML = '<i class="bi bi-x-circle-fill"></i>'
                    const tip = base.add_tooltip(button, "Drop")
                    button.addEventListener("click", (ev) => { tip.hide(); this.drop(player) })
                }
            }
        }
        base.remove_children(this.action_row)
        if (this.console.tournament.state == d.TournamentState.REGISTRATION ||
            this.console.tournament.state == d.TournamentState.WAITING
        ) {
            const standings_select = base.create_append(this.action_row, "select", ["form-select", "me-2", "mb-2", "w-auto"])
            for (const o of Object.values(d.StandingsMode)) {
                const option = base.create_append(standings_select, "option", [],
                    { value: o, label: `Standings: ${o}` }
                )
                if (o == this.console.tournament.standings_mode) {
                    option.selected = true
                }
            }
            const tooltip = base.add_tooltip(standings_select, "What standings information players see")
            standings_select.addEventListener("change", async (ev) => {
                tooltip.hide()
                await this.console.update_config(
                    { standings_mode: standings_select.value }
                )
            })
        }
        if (this.console.tournament.state == d.TournamentState.REGISTRATION) {
            const button = base.create_append(this.action_row, "button",
                ["me-2", "mb-2", "text-nowrap", "btn", "btn-success"]
            )
            button.innerText = "Open Check-In"
            const tooltip = base.add_tooltip(button, "Start listing present players")
            button.addEventListener("click", (ev) => { tooltip.hide(); this.console.open_checkin() })
        }
        if ((this.console.tournament.state == d.TournamentState.REGISTRATION ||
            this.console.tournament.state == d.TournamentState.WAITING ||
            this.console.tournament.state == d.TournamentState.FINISHED)
            && this.console.tournament.rounds.length > 0
        ) {
            const print_standings = base.create_append(this.action_row, "a",
                ["me-2", "mb-2", "text-nowrap", "btn", "btn-secondary"],
                { target: "_blank" },
            )
            print_standings.innerHTML = '<i class="bi bi-printer-fill"></i> Standings'
            print_standings.href = `/tournament/${this.console.tournament.uid}/print-standings.html`
        }
        if (this.console.tournament.state == d.TournamentState.REGISTRATION ||
            this.console.tournament.state == d.TournamentState.WAITING
        ) {
            const checkin_code = base.create_append(this.action_row, "a",
                ["me-2", "mb-2", "text-nowrap", "btn", "btn-primary"]
            )
            checkin_code.innerHTML = '<i class="bi bi-qr-code"></i> Display Check-in code'
            checkin_code.href = `/tournament/${this.console.tournament.uid}/checkin.html`
            checkin_code.target = "_blank"
            base.add_tooltip(checkin_code, "Display the QR code players can scan to check in")
        }
        if (this.console.tournament.state == d.TournamentState.WAITING) {
            const cancel_checkin_button = base.create_append(this.action_row, "button",
                ["me-2", "mb-2", "text-nowrap", "btn", "btn-secondary"]
            )
            cancel_checkin_button.innerText = "Cancel Check-in"
            const tooltip = base.add_tooltip(cancel_checkin_button, "Back to registration - checks everyone out.")
            cancel_checkin_button.addEventListener("click", (ev) => {
                tooltip.hide();
                this.console.confirmation.show(
                    "<strong>All player will be checked out</strong> <br>" +
                    `<em>Close the check-in stage and go back to the previous step.</em>`,
                    () => this.console.cancel_checkin()
                )
            })
        }
        if (this.console.tournament.state == d.TournamentState.WAITING) {
            const checkin_button = base.create_append(this.action_row, "button",
                ["me-2", "mb-2", "text-nowrap", "btn", "btn-primary"]
            )
            checkin_button.innerText = "Check everyone in"
            const tooltip = base.add_tooltip(checkin_button, "Check all Registered players in. Drop absentees first.")
            checkin_button.addEventListener("click", (ev) => { tooltip.hide(); this.check_everyone_in() })
        }
        if (this.console.tournament.state == d.TournamentState.WAITING) {
            const seat_span = base.create_append(this.action_row, "span", [], { tabindex: "0" })
            var seat_button_text = `Seat Round ${this.console.tournament.rounds.length + 1}`
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
            seat_button.innerText = `Seat Round ${this.console.tournament.rounds.length + 1}`
            seat_button.disabled = seat_button_disabled
            seat_button.innerText = seat_button_text
            const tooltip2 = base.add_tooltip(seat_span, tooltip_message)
            seat_button.addEventListener("click", (ev) => { tooltip2.hide(); this.console.start_round() })
        }
        if (this.console.tournament.state == d.TournamentState.REGISTRATION ||
            this.console.tournament.state == d.TournamentState.WAITING
        ) {
            if (this.console.tournament.rounds.length > 1) {
                const finals_button = base.create_append(this.action_row, "button",
                    ["me-2", "mb-2", "text-nowrap", "btn", "btn-success"]
                )
                finals_button.innerText = "Seed Finals"
                const tooltip = base.add_tooltip(finals_button, "Start the finals when you are done with the rounds")
                finals_button.addEventListener("click", (ev) => {
                    tooltip.hide()
                    this.console.seed_finals_modal.show()
                })
            }
        }
    }

    add_player(ev: SubmitEvent) {
        ev.preventDefault()
        this.console.register_player(this.register_element.person)
        this.alert(`Registered ${this.register_element.person.name}`)
        this.register_element.reset()
    }
    async check_everyone_in() {
        const candidates = Object.values(this.console.tournament.players).filter(
            p => p.state == d.PlayerState.REGISTERED && p.barriers.length == 0
        )
        if (candidates.length < 1) {
            this.alert("Nobody was checked in. Check the Info tab: If you require decklists, " +
                "players cannot be checked in without one.", d.AlertLevel.WARNING)
        }
        this.console.check_everyone_in()
    }
    async check_in(player: d.Player) {
        await this.console.check_in(player.uid)
    }

    async check_out(player: d.Player) {
        await this.console.check_out(player.uid)
        this.alert(`Checked ${player.name} out`)
    }

    async drop(player: d.Player) {
        await this.console.drop(player.uid)
        this.alert(`Dropped ${player.name}`)
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

class PlayerDrag {
    // this drag & drop thing is tricky enough to deserve its own class
    dragging: HTMLTableRowElement | null
    origin_parent: HTMLTableSectionElement | null
    origin_next: HTMLTableRowElement | null
    previous_switch: HTMLTableRowElement | null
    constructor() {
        this.dragging = null
        this.origin_parent = null
        this.origin_next = null
        this.previous_switch = null
    }
    start(dragging: HTMLTableRowElement) {
        this.dragging = dragging
        this.dragging.classList.add("dragged")
        this.origin_parent = this.dragging.parentElement as HTMLTableSectionElement
        this.origin_next = this.dragging.nextElementSibling as HTMLTableRowElement | null
    }
    end() {
        if (this.dragging) {
            this.dragging.classList.remove("dragged")
        }
        this.dragging = null
        if (this.previous_switch) {
            this.previous_switch.classList.remove("dragged")
        }
        this.previous_switch = null
        this.origin_parent = null
        this.origin_next = null
    }
    is_empty(target: HTMLTableRowElement): boolean {
        return target.dataset.player_uid == null
    }
    same_table(target: HTMLTableRowElement): boolean {
        return this.origin_parent == target.parentElement as HTMLTableSectionElement
    }
    is_sibling(target: HTMLTableRowElement): boolean {
        return this.dragging.nextElementSibling == target || this.dragging.previousElementSibling == target
    }
    update(target: HTMLTableRowElement) {
        // this is where the drag & drop (d&d) magic happens
        // we switch rows as we go while dragging for instant comfortable UX update
        if (!this.dragging) { return }
        if (this.dragging == target) { return }
        // in all other cases, we switch cells so dragging is in place of target in the end
        // first, if there was a previous switch, reset back
        if (this.previous_switch) {
            // if it was an empty row, it goes to the last seat
            if (this.is_empty(this.previous_switch)) {
                // do not swap for an empty slot if we already swapped for an empty slot on the same table
                if (this.is_empty(target) && target.parentElement == this.previous_switch.parentElement) { return }
                this.dragging.parentElement.append(this.previous_switch)
            }
            // otherwise, put it back where we are
            else {
                this.dragging.parentElement.insertBefore(this.previous_switch, this.dragging)
            }
            // put the dragged item back to its original position
            this.origin_parent.insertBefore(this.dragging, this.origin_next)
            this.previous_switch.classList.remove("dragged")
            this.previous_switch = null
        }
        // on the same table (local d&d), we swap continuously, so as to keep the players order set
        if (this.same_table(target)) {
            // do not swap to an empty seat in the same table
            if (this.is_empty(target)) { return }
            // only swap with siblings
            if (!this.is_sibling(target)) { return }
            // use our _current_ position, not our original position: this is what continuous swap means
            const current_next = this.dragging.nextElementSibling
            target.parentElement.insertBefore(this.dragging, target.nextElementSibling)
            target.parentElement.insertBefore(target, current_next)
        }
        // on another table (cross d&d), we do a "simple" swap: the end state of the whole dragging operation
        // including hovering many other rows, must as if we just swap the origin and the target
        // so we record our target to swap it back (first part of this method) if we change target later in the drag
        else {
            // if landing on an empty cell, target the first empty cell in the table
            while (
                this.is_empty(target) &&
                target.previousElementSibling &&
                target.previousElementSibling.tagName == "TR" &&
                this.is_empty(target.previousElementSibling as HTMLTableRowElement)
            ) {
                target = target.previousElementSibling as HTMLTableRowElement
            }
            this.previous_switch = target
            this.previous_switch.classList.add("dragged")
            target.parentElement.insertBefore(this.dragging, target)
            if (this.is_empty(target)) {
                this.origin_parent.append(target)
            } else {
                this.origin_parent.insertBefore(target, this.origin_next)
            }
        }
    }
}

class RoundTab {
    console: TournamentConsole
    index: number
    next_table_index: number
    table_div: HTMLDivElement | undefined
    panel: HTMLDivElement
    action_row: HTMLDivElement
    reseat_button: HTMLButtonElement
    override_modal: OverrideModal
    finals: boolean
    player_drag: PlayerDrag
    constructor(con: TournamentConsole, index: number, finals: boolean = false) {
        this.console = con
        this.index = index
        this.override_modal = new OverrideModal(con.root, con)
        this.finals = finals
        if (this.finals) {
            this.panel = this.console.add_nav(`Finals`, (ev) => this.setup_player_lookup_modal())
        } else {
            this.panel = this.console.add_nav(`Round ${this.index}`, (ev) => this.setup_player_lookup_modal())
        }
        this.player_drag = new PlayerDrag()
    }

    display() {
        base.remove_children(this.panel)
        this.action_row = base.create_append(this.panel, "div", ["d-md-flex", "my-4"])
        {
            const print_button = base.create_append(this.action_row, "a", ["me-2", "mb-2", "btn", "btn-secondary"],
                { target: "_blank" }
            )
            print_button.innerHTML = '<i class="bi bi-printer-fill"></i>'
            base.add_tooltip(print_button, "Printable version")
            print_button.href = `/tournament/${this.console.tournament.uid}/print-seating.html?round=${this.index}`
        }
        {
            this.reseat_button = base.create_append(this.action_row, "button", ["me-2", "mb-2", "text-nowrap", "btn"])
            if (this.finals) {
                this.reseat_button.classList.add("btn-primary")
                const tooltip = base.add_tooltip(this.reseat_button,
                    "Use after seating procedure to record the finals seating"
                )
                this.reseat_button.addEventListener("click", (ev) => tooltip.dispose())
            } else {
                this.reseat_button.classList.add("btn-warning")
            }
            this.reseat_button.innerHTML = '<i class="bi bi-pentagon-fill"></i> Alter seating'
            this.reseat_button.addEventListener("click", (ev) => {
                this.start_reseat()
            })
        }
        const round = this.console.tournament.rounds[this.index - 1]
        this.next_table_index = 1
        for (const table of round.tables) {
            this.display_table(table)
        }
        if (
            this.index == this.console.tournament.rounds.length
            && round.tables.every(t => t.seating.every(s => s.result.vp == 0))
        ) {
            const button = base.create_append(this.action_row, "button",
                ["me-2", "mb-2", "text-nowrap", "btn", "btn-danger"]
            )
            var message: string
            if (this.console.tournament.state == d.TournamentState.FINALS) {
                button.innerHTML = '<i class="bi bi-x-circle-fill"></i> Cancel Seeding'
                message = "This will not reset the toss (tie-breakers)"
            } else {
                button.innerHTML = '<i class="bi bi-x-circle-fill"></i> Cancel Round'
                message = "Do not use if players have started to play"
            }
            const tooltip = base.add_tooltip(button, message)
            button.addEventListener("click", (ev) => {
                tooltip.hide()
                if (round.tables.length > 0) {
                    this.console.confirmation.show(
                        "<strong>This seating will be lost</strong> <br>" +
                        `<em>${message}</em>`,
                        () => this.console.cancel_round()
                    )
                } else {
                    this.console.cancel_round()
                }
            })
        }
        if (this.console.tournament.state == d.TournamentState.PLAYING
            && this.index == this.console.tournament.rounds.length
            && round.tables.length > 0
            && round.tables.every(t => t.state == d.TableState.FINISHED)
        ) {
            const button = base.create_append(this.action_row, "button",
                ["me-2", "mb-2", "text-nowrap", "btn", "btn-success"]
            )
            button.innerText = "Finish round"
            button.addEventListener("click", (ev) => { this.console.finish_round() })
        }
        if (this.console.tournament.state == d.TournamentState.FINALS
            && this.index == this.console.tournament.rounds.length
            && round.tables.every(t => t.state == d.TableState.FINISHED)
        ) {
            const button = base.create_append(this.action_row, "button",
                ["me-2", "mb-2", "text-nowrap", "btn", "btn-success"]
            )
            button.innerText = "Finish tournament"
            button.addEventListener("click", (ev) => { this.console.finish_tournament() })
        }
    }

    display_table(data: d.Table | undefined): HTMLTableSectionElement {
        if (this.next_table_index % 2 === 1) {
            this.table_div = base.create_append(this.panel, "div", ["row", "g-5", "my-0"])
        }
        const table_index = this.next_table_index++
        const div = base.create_append(this.table_div, "div", ["col-lg-6"])
        const title_div = base.create_append(div, "div", ["d-inline-flex", "flex-row", "mb-2", "align-items-center"])
        const title = base.create_append(title_div, "h2", ["m-0", "me-2"])
        if (this.finals) {
            title.innerText = `Finals table`
        } else {
            title.innerText = `Table ${table_index}`
        }
        const table = base.create_append(div, "table", ["table", "table-sm"])
        const head = base.create_append(table, "thead")
        const tr = base.create_append(head, "tr", ["align-middle", "smaller-font"])
        var headers = ["VEKN#", "Name", "Score", ""]
        if (this.finals) {
            headers = ["Seed", "VEKN#", "Name", "Score", ""]
        }
        for (const label of headers) {
            const th = base.create_append(tr, "th", [], { scope: "col" })
            th.innerText = label
        }
        const body = base.create_append(table, "tbody")
        // Empty table creation stops here
        if (!data) { return body }
        const badge = base.create_append(title_div, "span", ["badge", "me-2"])
        badge.innerText = data.state
        switch (data.state) {
            case d.TableState.FINISHED:
                badge.classList.add("text-bg-success")
                break
            case d.TableState.INVALID:
                badge.classList.add("text-bg-danger")
                break
            case d.TableState.IN_PROGRESS:
                badge.classList.add("text-bg-secondary")
                break
        }
        if (data.state != d.TableState.FINISHED) {
            const overrideButton = base.create_append(title_div, "button", ["me-2", "btn", "btn-warning"])
            overrideButton.innerText = "Override"
            const tooltip = base.add_tooltip(overrideButton, "Validate an odd score")
            overrideButton.addEventListener("click", ev => {
                tooltip.hide()
                this.override_modal.show(this.index, data, table_index)
            })
        }
        if (data.override) {
            const overrideButton = base.create_append(title_div, "button", ["me-2", "btn", "btn-info"])
            overrideButton.innerText = "Overriden"
            const tooltip = base.add_tooltip(overrideButton, "Check or remove the override")
            overrideButton.addEventListener("click", ev => {
                tooltip.hide()
                this.override_modal.show(this.index, data, table_index)
            })
        }
        for (const seat of data.seating) {
            const player = this.console.tournament.players[seat.player_uid]
            const row = base.create_append(body, "tr", ["align-middle"])
            const actions = this.display_player(row, player, seat)
            const changeButton = base.create_append(actions, "button", ["me-2", "btn", "btn-sm", "btn-primary"])
            changeButton.innerHTML = '<i class="bi bi-pencil"></i>'
            const tooltip = base.add_tooltip(changeButton, "Set score")
            changeButton.addEventListener("click", (ev) => {
                tooltip.hide()
                this.console.score_modal.show(player, this.index, data.seating.length, seat.result.vp)
            })
            const sanctionButton = base.create_append(actions, "button", ["me-2", "btn", "btn-sm"])
            sanctionButton.innerHTML = '<i class="bi bi-info-circle-fill"></i>'
            const tooltip2 = base.add_tooltip(sanctionButton, "Decklist & sanctions")
            sanctionButton.addEventListener("click", (ev) => {
                tooltip2.hide()
                this.console.sanction_player_modal.show(player.uid, this.index, seat)
            })
            if (this.console.warn_about_player(player.uid)) {
                sanctionButton.classList.add("btn-warning")
            } else {
                sanctionButton.classList.add("btn-primary")
            }
        }
        return body
    }

    display_player(
        row: HTMLTableRowElement,
        player: d.Player,
        seat: d.TableSeat | undefined = undefined
    ): HTMLTableCellElement {
        row.dataset.player_uid = player.uid
        if (this.finals) {
            const score_cell = base.create_append(row, "td", ["text-nowrap"])
            score_cell.innerHTML = utils.full_score_string(player)
        }
        base.create_append(row, "th", ["text-nowrap", "smaller-font"], { scope: "row" }).innerText = player.vekn
        base.create_append(row, "td", ["w-100", "smaller-font"]).innerText = player.name
        if (seat) {
            base.create_append(row, "td", ["text-nowrap"]).innerText = utils.score_string(seat.result)
        } else {
            // not seated *yet*: we're in alter seating mode
            base.create_append(row, "td", ["text-nowrap"]).innerText = "0VP"
        }
        return base.create_append(row, "td", ["action-row", "text-nowrap"])
    }

    iter_tables(): ArrayIterator<HTMLTableSectionElement> {
        const tables = this.panel.querySelectorAll("tbody") as NodeListOf<HTMLTableSectionElement>
        return tables.values()
    }

    iter_rows(table: HTMLTableSectionElement | undefined = undefined): ArrayIterator<HTMLTableRowElement> {
        const rows = (table ?? this.panel).querySelectorAll("tr") as NodeListOf<HTMLTableRowElement>
        return rows.values()
    }

    *iter_player_uids(table: HTMLTableSectionElement | undefined = undefined): Generator<string> {
        for (const row of this.iter_rows(table)) {
            const player_uid = row.dataset.player_uid
            if (player_uid) { yield player_uid }
        }
    }

    setup_reseat_table_body(table: HTMLTableSectionElement) {
        var rows = table.querySelectorAll("tr") as NodeListOf<HTMLTableRowElement>
        for (const row of rows) {
            const action_row = row.querySelector(".action-row") as HTMLTableCellElement
            base.remove_children(action_row)
            this.display_reseat_actions(row, action_row)
        }
        while (rows.length < 5) {
            this.add_empty_row(table)
            rows = table.querySelectorAll("tr") as NodeListOf<HTMLTableRowElement>
        }
    }
    start_reseat() {
        base.remove_children(this.action_row)
        this.reseat_button = base.create_append(this.action_row, "button", ["me-2", "btn", "btn-success"])
        this.reseat_button.innerHTML = '<i class="bi bi-check"></i> Save seating'
        this.reseat_button.addEventListener("click", (ev) => { this.reseat() })
        if (!this.finals) {
            const add_table_button = base.create_append(this.action_row, "button",
                ["me-2", "btn", "btn-primary"]
            )
            add_table_button.innerHTML = '<i class="bi bi-plus"></i> Add Table'
            add_table_button.addEventListener("click",
                (ev) => { this.setup_reseat_table_body(this.display_table(undefined)) }
            )
        }
        const cancel_button = base.create_append(this.action_row, "button", ["me-2", "btn", "btn-secondary"])
        cancel_button.innerHTML = '<i class="bi bi-x"></i> Cancel'
        cancel_button.addEventListener("click", (ev) => { this.display() })

        for (const table of this.iter_tables()) {
            this.setup_reseat_table_body(table)
        }
        this.display_seating_issues()
    }

    display_reseat_actions(row: HTMLTableRowElement, actions_row: HTMLTableCellElement) {
        const remove_button = base.create_append(actions_row, "button", ["me-2", "btn", "btn-sm", "btn-danger"])
        remove_button.innerHTML = '<i class="bi bi-trash"></i>'
        remove_button.addEventListener("click", (ev) => { this.remove_row(row) })
        row.draggable = true
        row.addEventListener("dragstart", (ev) => this.dragstart_row(ev))
        row.addEventListener("dragenter", (ev) => this.dragenter_row(ev))
        row.addEventListener("dragover", (ev) => ev.preventDefault())
        row.addEventListener("dragend", (ev) => this.dragend_row(ev))
    }

    display_seating_issues() {
        if (this.finals) { return }
        const issues = this.console.compute_seating_issues()
        const warnings = new Map<string, [number, string]>()
        for (const [idx, instances] of issues.entries()) {
            var message: string = undefined
            switch (idx) {
                case seating.RULE.R1_PREDATOR_PREY:
                    message = "R1. Repeated Predator-Prey relationship"
                    break;
                case seating.RULE.R2_OPPONENT_ALWAYS:
                    message = "R2. Repeated Opponents"
                    break;
                case seating.RULE.R3_AVAILABLE_VPS:
                    message = "R3. Non-average available VPs"
                    break;
                case seating.RULE.R4_OPPONENT_TWICE:
                    message = "R4. Opponents twice"
                    break;
                case seating.RULE.R5_FIFTH_SEAT:
                    message = "R5. Fifth seat twice"
                    break;
                case seating.RULE.R6_SAME_POSITION:
                    message = "R6. Repeated opponent position"
                    break;
                case seating.RULE.R7_SAME_SEAT:
                    message = "R7. Repeated seat"
                    break;
                case seating.RULE.R8_STARTING_TRANSFERS:
                    message = "R8. Non-average starting transfers"
                    break;
                case seating.RULE.R9_SAME_POSITION_GROUP:
                    message = "R9. Repeated opponent position group"
                    break;
                default:
                    console.log("Unknown issue index!!")
                    break;
            }
            for (const instance of instances) {
                for (const player_uid of instance) {
                    if (warnings.has(player_uid) && warnings.get(player_uid)[0] < idx + 1) {
                        continue
                    }
                    warnings.set(player_uid, [idx + 1, message])
                }
            }
        }
        for (const row of this.iter_rows()) {
            const player_uid = row.dataset.player_uid
            const cell = row.querySelector("th") as HTMLTableCellElement
            const previous_icons = cell.querySelectorAll("i") as NodeListOf<HTMLElement>
            for (const icon of previous_icons) {
                icon.remove()
            }
            if (player_uid && warnings.has(player_uid)) {
                const [level, message] = warnings.get(player_uid)
                const classes = ["bi", "bi-exclamation-triangle-fill", "me-1"]
                if (level < 2) {
                    // Rule 1 is forbidden by the rules (repeated predator-prey)
                    classes.push("text-danger")
                } else if (level < 8) {
                    // Rules 2->7 are mostly avoidable, except on very small tournaments
                    // Rule 4 (opponents twice) is ignored in tournaments with <5 tables 
                    classes.push("text-warning")
                } else {
                    // Rule 8 is unavoidable in small tournaments
                    // Rule 9 can be hard to satisfy
                    classes.push("text-info")
                }
                const icon = base.create_prepend(cell, "i", classes)
                base.add_tooltip(icon, message)
            }
        }
    }

    dragstart_row(ev: DragEvent) {
        this.player_drag.start(ev.currentTarget as HTMLTableRowElement)
    }

    dragenter_row(ev: DragEvent) {
        ev.preventDefault()
        const target = ev.currentTarget as HTMLElement
        this.player_drag.update(target.closest("tr"))
    }

    dragend_row(ev: DragEvent) {
        console.log("dragend", ev)
        this.player_drag.end()
        this.display_seating_issues()
    }

    remove_row(row: HTMLTableRowElement) {
        const parent = row.parentElement as HTMLTableSectionElement
        if (Object.hasOwn(this.console.tournament.players, row.dataset.player_uid)) {
            this.console.player_select.add(this.console.tournament.players[row.dataset.player_uid])
        } else {
            console.log("Removing unregistered player", row)
        }
        row.remove()
        this.add_empty_row(parent)
    }

    add_empty_row(body: HTMLTableSectionElement) {
        const empty_row = base.create_append(body, "tr", ["align-middle"])
        base.create_append(empty_row, "th")
        base.create_append(empty_row, "td")
        base.create_append(empty_row, "td")
        const action_row = base.create_append(empty_row, "td", ["action-row"])
        const plus_button = base.create_append(action_row, "button", ["me-2", "btn", "btn-sm", "btn-primary"])
        plus_button.innerHTML = '<i class="bi bi-plus"></i>'
        plus_button.addEventListener("click", (ev) => { this.display_player_lookup_modal(empty_row) })
        // no dragstart for empty rows
        empty_row.addEventListener("dragenter", (ev) => this.dragenter_row(ev))
        empty_row.addEventListener("dragover", (ev) => ev.preventDefault())
        empty_row.addEventListener("dragend", (ev) => this.dragend_row(ev))
    }

    async reseat() {
        const round_seating: string[][] = []
        for (const table of this.iter_tables()) {
            const table_seating: string[] = []
            for (const player_uid of this.iter_player_uids(table)) {
                table_seating.push(player_uid)
            }
            if (table_seating.length > 0) {
                round_seating.push(table_seating)
            }
        }
        if (this.finals) {
            await this.console.seat_finals(round_seating[0])
        } else {
            await this.console.alter_seating(this.index, round_seating)
        }
    }

    setup_player_lookup_modal() {
        const players = []
        // check the DOM (in case we're altering seating)
        const player_in_round = new Set<string>(this.iter_player_uids())
        for (const player of Object.values(this.console.tournament.players)) {
            if (player_in_round.has(player.uid)) { continue }
            players.push(player)
        }
        this.console.player_select.init(this, players)
    }

    display_player_lookup_modal(empty_row: HTMLTableRowElement) {
        this.console.player_select.show(empty_row)
    }

    add_player(empty_row, player: d.Player) {
        base.remove_children(empty_row)
        const actions = this.display_player(empty_row, player)
        this.display_reseat_actions(empty_row, actions)
        this.console.player_select.remove(player)
    }
}

class ScoreModal {
    console: TournamentConsole
    player_uid: string
    round_number: number
    modal_div: HTMLDivElement
    modal: bootstrap.Modal
    title: HTMLHeadingElement
    btn_35: HTMLButtonElement
    btn_35_tooltip: bootstrap.Tooltip
    btn_50: HTMLButtonElement
    btn_50_tooltip: bootstrap.Tooltip
    constructor(el: HTMLDivElement, console: TournamentConsole) {
        this.console = console
        this.modal_div = base.create_append(el, "div", ["modal", "fade"],
            { tabindex: "-1", "aria-hidden": "true", "aria-labelledby": "scoreModalLabel" }
        )
        const dialog = base.create_append(this.modal_div, "div", ["modal-dialog"])
        const content = base.create_append(dialog, "div", ["modal-content"])
        const header = base.create_append(content, "div", ["modal-header"])
        this.title = base.create_append(header, "h1", ["modal-title", "fs-5"], { id: "scoreModalLabel" })
        base.create_append(header, "button", ["btn-close"], { "data-bs-dismiss": "modal", "aria-label": "Close" })
        const body = base.create_append(content, "div", ["modal-body", "d-flex", "flex-column", "align-items-center"])
        const row_1 = base.create_append(body, "div", ["d-flex", "flex-row", "align-items-center"])
        const btn_00 = base.create_append(row_1, "button", ["btn", "btn-primary", "me-1", "mb-1"], { type: "button" })
        const btn_10 = base.create_append(row_1, "button", ["btn", "btn-primary", "me-1", "mb-1"], { type: "button" })
        const btn_20 = base.create_append(row_1, "button", ["btn", "btn-primary", "me-1", "mb-1"], { type: "button" })
        const btn_30 = base.create_append(row_1, "button", ["btn", "btn-primary", "me-1", "mb-1"], { type: "button" })
        const btn_40 = base.create_append(row_1, "button", ["btn", "btn-primary", "me-1", "mb-1"], { type: "button" })
        this.btn_50 = base.create_append(row_1, "button", ["btn", "btn-primary", "me-1", "mb-1"], { type: "button" })
        this.btn_50_tooltip = base.add_tooltip(this.btn_50, "Normally not on a 5p table")
        const row_2 = base.create_append(body, "div", ["d-flex", "flex-row", "align-items-center"])
        const btn_05 = base.create_append(row_2, "button", ["btn", "btn-primary", "me-1", "mb-1"], { type: "button" })
        const btn_15 = base.create_append(row_2, "button", ["btn", "btn-primary", "me-1", "mb-1"], { type: "button" })
        const btn_25 = base.create_append(row_2, "button", ["btn", "btn-primary", "me-1", "mb-1"], { type: "button" })
        this.btn_35 = base.create_append(row_2, "button", ["btn", "btn-primary", "me-1", "mb-1"], { type: "button" })
        this.btn_35_tooltip = base.add_tooltip(this.btn_35, "Normally not on a 5p table")
        const btn_45 = base.create_append(row_2, "button", ["btn", "btn-secondary", "me-1", "mb-1"], { type: "button" })
        const tooltip = base.add_tooltip(btn_45, "Normally invalid")
        btn_00.innerText = "0"
        btn_05.innerText = "0.5"
        btn_10.innerText = "1"
        btn_15.innerText = "1.5"
        btn_20.innerText = "2"
        btn_25.innerText = "2.5"
        btn_30.innerText = "3"
        this.btn_35.innerText = "3.5"
        btn_40.innerText = "4"
        btn_45.innerText = "4.5"
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
        btn_45.addEventListener("click", (ev) => { tooltip.hide(); this.set_score(4.5) })
        this.btn_50.addEventListener("click", (ev) => { this.btn_50_tooltip.hide(); this.set_score(5) })
        this.modal = new bootstrap.Modal(this.modal_div)
    }

    async set_score(score: number) {
        await this.console.set_score(this.player_uid, this.round_number, score)
        this.modal.hide()
    }

    show(player: d.Player, round_number: number, table_size: number, vps: number = 0) {
        this.title.innerText = `${player.name} result: round ${round_number}`
        this.player_uid = player.uid
        this.round_number = round_number
        if (table_size < 5) {
            this.btn_35.classList.remove("btn-primary")
            this.btn_35.classList.add("btn-secondary")
            this.btn_35_tooltip.enable()
            this.btn_50.classList.remove("btn-primary")
            this.btn_50.classList.add("btn-secondary")
            this.btn_50_tooltip.enable()
        } else {
            this.btn_35.classList.remove("btn-secondary")
            this.btn_35.classList.add("btn-primary")
            this.btn_35_tooltip.disable()
            this.btn_50.classList.remove("btn-secondary")
            this.btn_50.classList.add("btn-primary")
            this.btn_50_tooltip.disable()
        }
        this.modal.show()
    }
}

class TournamentConsole {
    root: HTMLDivElement
    token: base.Token
    members_map: member.MembersDB | undefined
    tournament: d.Tournament | undefined
    message_div: HTMLDivElement
    nav: HTMLElement
    tabs_div: HTMLDivElement
    score_modal: ScoreModal
    tabs: Map<string, bootstrap.Tab>
    confirmation: base.ConfirmationModal
    player_select: PlayerSelectModal
    add_member_modal: member.AddMemberModal
    sanction_player_modal: SanctionPlayerModal
    seed_finals_modal: SeedFinalsModal
    info: TournamentDisplay
    registration: Registration
    rounds: RoundTab[]

    constructor(el: HTMLDivElement, token: base.Token) {
        this.root = el
        this.token = token
        this.members_map = new member.MembersDB(token)
        this.confirmation = new base.ConfirmationModal(el)
        this.score_modal = new ScoreModal(el, this)
        this.player_select = new PlayerSelectModal(el)
        this.add_member_modal = new member.AddMemberModal(el, this.members_map, (m) => this.register_player(m))
        this.sanction_player_modal = new SanctionPlayerModal(el, this)
        this.seed_finals_modal = new SeedFinalsModal(el, this)
        this.message_div = base.create_append(el, "div", ["alert"], { role: "status" })
        this.nav = base.create_append(el, "nav", ["nav", "nav-tabs"], { role: "tablist" })
        this.tabs_div = base.create_append(el, "div", ["tab-content"])
    }

    help_message(message: string, level: d.AlertLevel) {
        this.message_div.innerHTML = message
        this.message_div.classList.remove("alert-info", "alert-success", "alert-warning", "alert-danger")
        switch (level) {
            case d.AlertLevel.INFO:
                this.message_div.classList.add("alert-info")
                break;
            case d.AlertLevel.SUCCESS:
                this.message_div.classList.add("alert-success")
                break;
            case d.AlertLevel.WARNING:
                this.message_div.classList.add("alert-warning")
                break;
            case d.AlertLevel.DANGER:
                this.message_div.classList.add("alert-sanger")
                break;
            default:
                break;
        }
    }

    async init(tournament_uid: string) {
        const res = await base.do_fetch(`/api/tournaments/${tournament_uid}`, {
            method: "get",
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.token.access_token}`
            }
        })
        this.tournament = await res.json()
        this.tabs = new Map()
        base.remove_children(this.message_div)
        base.remove_children(this.nav)
        base.remove_children(this.tabs_div)
        const display_tab = this.add_nav("Info")
        this.info = new TournamentDisplay(display_tab, () => this.init(this.tournament.uid))
        this.registration = new Registration(this)
        this.rounds = []
        for (var i = 0; i < this.tournament.rounds.length; i++) {
            var finals: boolean = false
            if ((this.tournament.state == d.TournamentState.FINALS
                || this.tournament.state == d.TournamentState.FINISHED)
                && this.tournament.rounds.length - this.rounds.length == 1
            ) {
                finals = true
            }
            const round_tab = new RoundTab(this, i + 1, finals)
            this.rounds.push(round_tab)
        }
        await this.members_map.init()
        { // init countries in components using them
            const res = await base.do_fetch("/api/vekn/country", {})
            const countries = await res.json() as d.Country[]
            await this.add_member_modal.init(this.token, countries, true)
            await this.info.init(this.token, this.members_map, countries)
        }
        await this.display()
        this.open_relevant_tab()
    }
    open_relevant_tab() {
        if (this.tournament.state == d.TournamentState.FINALS) {
            this.tabs.get(`Finals`).show()
        } else if (this.tournament.state == d.TournamentState.PLAYING) {
            this.tabs.get(`Round ${this.rounds.length}`).show()
        } else if (this.tournament.state == d.TournamentState.WAITING) {
            this.tabs.get("Registration").show()
        } else if (this.tournament.state != d.TournamentState.FINISHED && this.tournament.rounds.length > 0) {
            this.tabs.get("Registration").show()
        }
        else {
            this.tabs.get("Info").show()
        }
    }
    async display() {
        await this.info.display(this.tournament)
        if (this.tournament.state == d.TournamentState.REGISTRATION) {
            if (this.tournament.rounds.length < 1) {
                this.help_message(
                    "Register players in advance — Players can register themselves on the " +
                    `<a href="/tournament/${this.tournament.uid}/display.html" target="_blank">tournament page</a>` +
                    "<br><em>On tournament day, " +
                    '"Open Check-in" in the "Registration" tab to list the present players among those registered</em>'
                    , d.AlertLevel.INFO
                )
            } else {
                this.help_message(
                    '"Open Check-in" again to enlist the present players for next round'
                    , d.AlertLevel.INFO
                )
            }
        } else if (this.tournament.state == d.TournamentState.WAITING) {
            if (this.tournament.rounds.length == 0) {
                this.help_message(
                    "Check players in " +
                    '<i class="bi bi-box-arrow-in-right"></i>' +
                    " before seating the next round — Only " +
                    '<span class="badge text-bg-success">Checked-in</span>' +
                    " players will be seated <br>" +
                    "<em>Players can check themselves in on the " +
                    `<a href="/tournament/${this.tournament.uid}/display.html" target="_blank">tournament page</a>` +
                    " by scanning the " +
                    '<i class="bi bi-qr-code"></i>' +
                    " Check-in code you can present to them from the Registration tab</em>"
                    , d.AlertLevel.WARNING
                )
            } else if (this.tournament.rounds.length < 2) {
                this.help_message(
                    "Check players in " +
                    '<i class="bi bi-box-arrow-in-right"></i>' +
                    " individually or " +
                    '"Check everyone in" and drop ' +
                    '<i class="bi bi-x-circle-fill"></i>' +
                    " absentees <br>" +
                    "<em>Player can drop themselves on the " +
                    `<a href="/tournament/${this.tournament.uid}/display.html" target="_blank">tournament page</a></em>`
                    , d.AlertLevel.WARNING
                )
            } else {
                this.help_message(
                    "Either start a new round (do not forget to check players in) or seed the finals.",
                    d.AlertLevel.INFO
                )
            }
        } else if (this.tournament.state == d.TournamentState.PLAYING) {
            if (this.tournament.rounds.slice(-1)[0].tables.length < 1) {
                this.help_message(
                    "This round is empty because no player was checked in <br>" +
                    "<em>Either add tables manually with " +
                    '<i class="bi bi-pentagon-fill"></i>' +
                    " Alter Seating, or " +
                    '<i class="bi bi-x-circle-fill"></i>' +
                    " Cancel and proceed with the check-in",
                    d.AlertLevel.WARNING
                )
            } else {
                this.help_message(
                    "Round in progress — " +
                    '<i class="bi bi-pentagon-fill"></i>' +
                    " Alter seating and " +
                    '<i class="bi bi-pencil"></i>' +
                    " record players results " +
                    " in the round tab <br>" +
                    "<em>All tables need to be " +
                    '<span class="badge text-bg-success">Finished</span>' +
                    " before you can end the round — You can " +
                    '"Override"' +
                    " the table score verification if needed</em>"
                    ,
                    d.AlertLevel.INFO
                )
            }
        } else if (this.tournament.state == d.TournamentState.FINALS) {
            this.help_message(
                "Finals have been seeded — Perform the " +
                '<a href="/document/tournament-rules.html#H3-1-3-final-round-seating" target="_blank">' +
                'seating procedure' +
                '</a>' +
                " and use " +
                '"<i class="bi bi-pentagon-fill"></i> Alter seating"' +
                " in the Finals tab to record it <br>" +
                "<em>Once the finals are finished, record the results " +
                '<i class="bi bi-pencil"></i> ' +
                "to finish the tournament</em>",
                d.AlertLevel.INFO
            )
        } else if (this.tournament.state == d.TournamentState.FINISHED) {
            if (this.tournament.winner) {
                const winner = this.tournament.players[this.tournament.winner]
                this.help_message(
                    "This tournament is finished —" + ` Congratulations ${winner.name} (${winner.vekn})!`,
                    d.AlertLevel.SUCCESS
                )
            } else {
                this.help_message("This tournament is finished", d.AlertLevel.SUCCESS)
            }
        }
        while (this.tournament.rounds.length > this.rounds.length) {
            var finals: boolean = false
            if ((this.tournament.state == d.TournamentState.FINALS
                || this.tournament.state == d.TournamentState.FINISHED)
                && this.tournament.rounds.length - this.rounds.length == 1
            ) {
                finals = true
            }
            const round_tab = new RoundTab(this, this.rounds.length + 1, finals)
            this.rounds.push(round_tab)
        }
        while (this.tournament.rounds.length < this.rounds.length) {
            const round = this.rounds.pop()
            round.panel.remove()
            const tab = this.tabs.get(`Round ${round.index}`)
            if (tab) {
                tab.dispose()
            }
            this.tabs.delete(`Round ${round.index}`)
            this.nav.removeChild(this.nav.lastElementChild)
        }
        this.registration.display()
        for (const round of this.rounds) {
            round.display()
        }
    }

    add_nav(label: string, show_callback: EventListenerOrEventListenerObject | undefined = undefined): HTMLDivElement {
        const label_id = label.replace(/\s/g, "");
        const button = base.create_append(this.nav, "button", ["nav-link"], {
            id: `nav${label_id}`,
            "data-bs-toggle": "tab",
            "data-bs-target": `#tab${label_id}`,
            type: "button",
            role: "tab",
            "aria-controls": "nav-home",
            "aria-selected": "true",
        })
        button.innerText = label
        const tab = base.create_append(this.tabs_div, "div", ["tab-pane", "fade"], {
            id: `tab${label_id}`,
            role: "tabpanel",
            "aria-labelledby": `nav${label_id}`
        })
        const tabTrigger = new bootstrap.Tab(button)
        button.addEventListener('click', function (event) {
            event.preventDefault()
            tabTrigger.show()
        })
        if (show_callback) {
            button.addEventListener('show.bs.tab', show_callback)
        }
        this.tabs.set(label, tabTrigger)
        return tab
    }

    compute_seating_issues(): string[][][] {
        const rounds: string[][][] = []
        for (const tab of this.rounds) {
            const tables = []
            for (const table of tab.iter_tables()) {
                const seating = [...tab.iter_player_uids(table)]
                if (seating) {
                    tables.push(seating)
                }
            }
            if (tables && !tab.finals) {
                rounds.push(tables)
            }
        }
        return seating.compute_issues(rounds)
    }

    async warn_about_player(player_uid: string): Promise<boolean> {
        const previous_sanctions = (await this.members_map.get_by_uid(player_uid))?.sanctions
        if (previous_sanctions) {
            for (const sanction of previous_sanctions) {
                if (sanction.tournament?.uid && sanction.tournament?.uid != this.tournament.uid) {
                    return true
                }
            }
        }
        const local_sanctions = this.tournament.sanctions[player_uid]
        if (local_sanctions) {
            for (const sanction of local_sanctions) {
                if (sanction.level != events.SanctionLevel.CAUTION) {
                    return true
                }
            }
        }
        return false
    }

    async update_config(modification: Object) {
        const config = {
            name: this.tournament.name,
            format: this.tournament.format,
            start: this.tournament.start,
            timezone: this.tournament.timezone,
            uid: this.tournament.uid,
            rank: this.tournament.rank,
            country: this.tournament.country,
            venue: this.tournament.venue,
            venue_url: this.tournament.venue_url,
            address: this.tournament.address,
            map_url: this.tournament.map_url,
            online: this.tournament.online,
            proxies: this.tournament.proxies,
            multideck: this.tournament.multideck,
            decklist_required: this.tournament.decklist_required,
            finish: this.tournament.finish,
            description: this.tournament.description,
            judges: this.tournament.judges,
        } as d.TournamentConfig
        Object.assign(config, modification)
        const res = await base.do_fetch_with_token(
            `/api/tournaments/${this.tournament.uid}`,
            this.token,
            { method: "put", body: JSON.stringify(config) }
        )
        if (!res) { return }
        const res2 = await base.do_fetch_with_token(
            `/api/tournaments/${this.tournament.uid}`,
            this.token,
            { method: "get" }
        )
        if (!res2) { return }
        const response: d.Tournament = await res2.json()
        console.log(response)
        this.tournament = response
        await this.display()
        return response
    }

    async handle_tournament_event(tev: events.TournamentEvent): Promise<d.Tournament | undefined> {
        console.log("handle event", tev)
        // TODO: implement offline mode
        const res = await base.do_fetch(
            `/api/tournaments/${this.tournament.uid}/event`, {
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
        const response: d.Tournament = await res.json()
        console.log(response)
        this.tournament = response
        await this.display()
        return response
    }

    async register_player(member: d.Person) {
        const event: events.Register = {
            type: events.EventType.REGISTER,
            uid: uuid.v4(),
            name: member.name,
            vekn: member.vekn,
            player_uid: member.uid,
            country: member.country ?? "",
            city: member.city ?? "",
        }
        await this.handle_tournament_event(event)
    }
    async check_in(player_uid: string) {
        const event: events.CheckIn = {
            type: events.EventType.CHECK_IN,
            uid: uuid.v4(),
            player_uid: player_uid,
            code: undefined,
        }
        await this.handle_tournament_event(event)
    }
    async check_everyone_in() {
        const event: events.CheckEveryoneIn = {
            type: events.EventType.CHECK_EVERYONE_IN,
            uid: uuid.v4(),
        }
        await this.handle_tournament_event(event)
    }
    async check_out(player_uid: string) {
        const event: events.CheckOut = {
            type: events.EventType.CHECK_OUT,
            uid: uuid.v4(),
            player_uid: player_uid,
        }
        await this.handle_tournament_event(event)
    }
    async drop(player_uid: string) {
        const event: events.Drop = {
            type: events.EventType.DROP,
            uid: uuid.v4(),
            player_uid: player_uid,
        }
        await this.handle_tournament_event(event)
    }
    async open_checkin() {
        const event: events.OpenCheckin = {
            type: events.EventType.OPEN_CHECKIN,
            uid: uuid.v4(),
        }
        await this.handle_tournament_event(event)
    }
    async cancel_checkin() {
        const event: events.CancelCheckin = {
            type: events.EventType.CANCEL_CHECKIN,
            uid: uuid.v4(),
        }
        await this.handle_tournament_event(event)
    }
    async start_round() {
        const contenders = Object.values(this.tournament.players)
            .filter(p => p.state === d.PlayerState.CHECKED_IN)
            .map(p => p.uid)
        const s = seating.initial_seating(
            this.tournament.rounds
                .map(r => r.tables
                    .map(t => t.seating
                        .map(s => s.player_uid)
                    )
                ),
            contenders
        )
        const event: events.RoundStart = {
            type: events.EventType.ROUND_START,
            uid: uuid.v4(),
            seating: s
        }
        await this.handle_tournament_event(event)
        this.open_relevant_tab()
    }
    async override_table(round_number: number, table_number: number, comment: string) {
        const event: events.Override = {
            type: events.EventType.OVERRIDE,
            uid: uuid.v4(),
            round: round_number,
            table: table_number,
            comment: comment,
        }
        await this.handle_tournament_event(event)
    }
    async unoverride_table(round_number: number, table_number: number) {
        const event: events.Unoverride = {
            type: events.EventType.UNOVERRIDE,
            uid: uuid.v4(),
            round: round_number,
            table: table_number,
        }
        await this.handle_tournament_event(event)
    }
    async set_score(player_uid: string, round_number: number, vps: number) {
        const event: events.SetResult = {
            type: events.EventType.SET_RESULT,
            uid: uuid.v4(),
            player_uid: player_uid,
            round: round_number,
            vps: vps,
        }
        await this.handle_tournament_event(event)
    }
    async set_deck(player_uid: string, deck: string, round: number | undefined = undefined) {
        const tev = {
            uid: uuid.v4(),
            type: events.EventType.SET_DECK,
            player_uid: player_uid,
            deck: deck,
            round: round ?? null,
        } as events.SetDeck
        await this.handle_tournament_event(tev)
    }
    async finish_round() {
        const event: events.RoundFinish = {
            type: events.EventType.ROUND_FINISH,
            uid: uuid.v4(),
        }
        await this.handle_tournament_event(event)
        this.open_relevant_tab()
    }
    async cancel_round() {
        const event: events.RoundCancel = {
            type: events.EventType.ROUND_CANCEL,
            uid: uuid.v4(),
        }
        await this.handle_tournament_event(event)
        this.open_relevant_tab()
    }
    async seed_finals(seeds: string[], toss: Record<string, number>) {
        const event: events.SeedFinals = {
            type: events.EventType.SEED_FINALS,
            uid: uuid.v4(),
            seeds: seeds,
            toss: toss,
        }
        await this.handle_tournament_event(event)
        this.open_relevant_tab()
    }
    async alter_seating(round: number, seating: string[][]) {
        const event: events.RoundAlter = {
            type: events.EventType.ROUND_ALTER,
            uid: uuid.v4(),
            round: round,
            seating: seating,
        }
        await this.handle_tournament_event(event)
    }
    async seat_finals(seating: string[]) {
        const event: events.SeatFinals = {
            type: events.EventType.SEAT_FINALS,
            uid: uuid.v4(),
            seating: seating,
        }
        await this.handle_tournament_event(event)
    }
    async finish_tournament() {
        const event: events.FinishTournament = {
            type: events.EventType.FINISH_TOURNAMENT,
            uid: uuid.v4()
        }
        await this.handle_tournament_event(event)
        this.open_relevant_tab()
    }
}

async function load() {
    const consoleDiv = document.getElementById("consoleDiv") as HTMLDivElement
    const token = await base.fetchToken()
    const tournament = new TournamentConsole(consoleDiv, token)
    await tournament.init(consoleDiv.dataset.tournamentUid)
}

window.addEventListener("load", (ev) => { load() })
