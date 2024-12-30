import * as d from "./d"
import * as base from "./base"
import * as events from "./events"
import * as member from "./member"
import * as seating from "./seating"
import { score_string, standings, TournamentDisplay } from "./tournament_display"
import * as bootstrap from 'bootstrap'
import * as uuid from 'uuid'


class PlayerSelectModal {
    modal_div: HTMLDivElement
    header: HTMLHeadingElement
    body: HTMLDivElement
    select: HTMLSelectElement
    modal: bootstrap.Modal
    round_tab: RoundTab | undefined
    empty_row: HTMLTableRowElement | undefined
    players: Map<string, d.Player>
    constructor(el: HTMLElement, title: string = "Add player") {
        this.modal_div = base.create_append(el, "div", ["modal", "fade"],
            { tabindex: "-1", "aria-hidden": "true", "aria-labelledby": "LookupModalLabel" }
        )
        const dialog = base.create_append(this.modal_div, "div", ["modal-dialog"])
        const content = base.create_append(dialog, "div", ["modal-content"])
        const header_div = base.create_append(content, "div", ["modal-header"])
        this.header = base.create_append(header_div, "h1", ["modal-title", "fs-5"])
        this.header.innerText = title
        base.create_append(header_div, "button", ["btn-close"], { "data-bs-dismiss": "modal", "aria-label": "Close" })
        this.body = base.create_append(content, "div", ["modal-body"])
        this.select = base.create_append(this.body, "select", ["form-select"], { size: "10" })
        this.players = new Map()
        this.modal = new bootstrap.Modal(this.modal_div)
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
        base.remove_children(this.select)
        const players = [...this.players.values()].sort((a, b) => a.name.localeCompare(b.name))
        for (const player of players) {
            const option = base.create_append(this.select, "option", ["mb-2"], {
                value: player.uid,
                label: `${player.name} (#${player.vekn})`
            })
            option.addEventListener("click", (ev) => this.select_player(player))
        }
        this.modal.show()
    }

    select_player(player: d.Player) {
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


class AddMemberModal {
    countries: d.Country[] | undefined
    modal_div: HTMLDivElement
    header: HTMLHeadingElement
    body: HTMLDivElement
    form: HTMLFormElement
    name: HTMLInputElement
    country: HTMLSelectElement
    city: HTMLSelectElement
    email: HTMLInputElement
    submit_button: HTMLButtonElement
    modal: bootstrap.Modal
    console: TournamentConsole
    constructor(el: HTMLElement, console: TournamentConsole, title: string = "Add member") {
        this.console = console
        this.modal_div = base.create_append(el, "div", ["modal", "fade"],
            { tabindex: "-1", "aria-hidden": "true", "aria-labelledby": "LookupModalLabel" }
        )
        const dialog = base.create_append(this.modal_div, "div", ["modal-dialog"])
        const content = base.create_append(dialog, "div", ["modal-content"])
        const header_div = base.create_append(content, "div", ["modal-header"])
        this.header = base.create_append(header_div, "h1", ["modal-title", "fs-5"])
        this.header.innerText = title
        base.create_append(header_div, "button", ["btn-close"], { "data-bs-dismiss": "modal", "aria-label": "Close" })
        this.body = base.create_append(content, "div", ["modal-body"])
        this.form = base.create_append(this.body, "form")
        this.name = base.create_append(this.form, "input", ["form-control", "my-2"],
            { type: "text", autocomplete: "new-name" }
        )
        this.name.ariaAutoComplete = "none"
        this.name.spellcheck = false
        this.name.placeholder = "Name"
        this.country = base.create_append(this.form, "select", ["form-select", "my-2"])
        this.city = base.create_append(this.form, "select", ["form-select", "my-2"])
        this.email = base.create_append(this.form, "input", ["form-control", "my-2"],
            { type: "text", autocomplete: "new-email" }
        )
        this.email.placeholder = "E-mail"
        this.email.ariaAutoComplete = "none"
        this.email.spellcheck = false
        this.submit_button = base.create_append(this.form, "button", ["btn", "btn-primary", "my-2"], { type: "submit" })
        this.submit_button.innerText = "Submit"
        this.country.ariaLabel = "Country"
        this.country.options.add(base.create_element("option", [], { value: "", label: "Country" }))
        this.country.required = true
        this.city.options.add(base.create_element("option", [], { value: "", label: "City" }))
        this.city.required = false
        this.country.addEventListener("change", (ev) => this.change_country())
        this.form.addEventListener("submit", (ev) => this.submit(ev))
        this.modal = new bootstrap.Modal(this.modal_div)
    }

    async init(countries: d.Country[] | undefined = undefined) {
        if (countries) {
            this.countries = countries
        } else {
            const res = await base.do_fetch("/api/vekn/country", {})
            this.countries = await res.json() as d.Country[]
        }
        for (const country of this.countries) {
            const option = document.createElement("option")
            option.value = country.country
            option.label = country.country
            this.country.options.add(option)
        }
    }

    show() {
        this.name.value = ""
        this.email.value = ""
        this.country.selectedIndex = 0
        this.city.selectedIndex = 0
        this.city.disabled = true
        this.modal.show()
    }

    async change_country() {
        while (this.city.options.length > 1) {
            this.city.options.remove(1)
        }
        if (this.country.selectedIndex < 1) {
            this.city.disabled = true
        } else {
            // TODO deactivate this or something for offline mode
            const res = await base.do_fetch(`/api/vekn/country/${this.country.value}/city`, {})
            const cities = await res.json() as d.City[]
            // find duplicate city names, add administrative divisions for distinction
            const names_count = {}
            for (const city of cities) {
                var name = city.name
                names_count[name] = (names_count[name] || 0) + 1
                name += `, ${city.admin1}`
                names_count[name] = (names_count[name] || 0) + 1
            }
            for (const city of cities) {
                var name = city.name
                if (names_count[name] > 1) {
                    name += `, ${city.admin1}`
                }
                if (names_count[name] > 1) {
                    name += `, ${city.admin2}`
                }
                const option = document.createElement("option")
                option.value = name
                option.label = name
                this.city.options.add(option)
            }
            this.city.disabled = false
        }
    }

    async submit(ev: SubmitEvent) {
        ev.preventDefault()
        var member = {
            uid: uuid.v4(),
            name: this.name.value,
            vekn: "",
            country: this.country.value,
            city: this.city.value,
            email: this.email.value
        } as d.Member
        await this.console.add_member(member)
        this.modal.hide()
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
    register_element: member.PersonLookup<d.Member>
    filter_switch: HTMLInputElement
    filter_label: HTMLLabelElement
    players_table: HTMLTableElement
    players_table_body: HTMLTableSectionElement
    filter: PlayerFilter
    order: PlayerOrder
    constructor(console_: TournamentConsole) {
        console.log("build registration")
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
        this.action_row = base.create_append(this.panel, "div", ["d-flex", "my-4"])
        const registration_controls = base.create_append(this.panel, "div", ["d-flex", "my-2"])
        this.register_element = new member.PersonLookup<d.Member>(
            this.console.members_map, registration_controls, "Register", true
        )
        this.register_element.form.addEventListener("submit", (ev) => { this.add_player(ev) })
        console.log("adding member button")
        const add_member_button = base.create_append(
            registration_controls, "button", ["btn", "btn-primary", "me-2", "mb-2"], { type: "button" }
        )
        add_member_button.innerText = "New member"
        add_member_button.addEventListener("click", (ev) => this.console.add_member_modal.show())
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
        const filter_switch_div = base.create_append(table_controls, "div", ["form-check", "form-switch"])
        this.filter_switch = base.create_append(filter_switch_div, "input", ["form-check-input"],
            { type: "checkbox", role: "switch", id: "filterSwitch" }
        )
        this.filter_label = base.create_append(filter_switch_div, "label", ["form-check-label"],
            { for: "filterSwitch" }
        )
        if (this.console.tournament.state == d.TournamentState.WAITING) {
            this.filter = PlayerFilter.UNCHECKED
            this.filter_switch.checked = true
            this.filter_label.innerText = "Filter checked-in players out"
        } else {
            this.filter = PlayerFilter.ALL
            this.filter_switch.checked = false
            this.filter_label.innerText = "All players"
        }
        this.filter_switch.addEventListener("change", (ev) => this.toggle_filter())
        this.players_table = base.create_append(table_div, "table", ["table"])
        const head = base.create_append(this.players_table, "thead")
        const row = base.create_append(head, "tr")
        for (const label of ["VEKN #", "Name", "Score", "Status", ""]) {
            const cel = base.create_append(row, "th", [], { scope: "col" })
            cel.innerText = label
        }
        this.players_table_body = base.create_append(this.players_table, "tbody")
    }
    sorted_players() {
        var players = standings(this.console.tournament)
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
            this.filter_label.innerText = "Filter checked-in players out"
        } else {
            this.filter = PlayerFilter.ALL
            this.filter_label.innerText = "All players"
        }
        this.display()
    }
    display() {
        base.remove_children(this.players_table_body)
        const players = this.sorted_players()
        for (const [rank, player] of players) {
            const row = base.create_append(this.players_table_body, "tr")
            const head = base.create_append(row, "th", ["text-nowrap"], { scope: "row" })
            head.innerText = player.vekn
            const name = base.create_append(row, "td", ["w-100"])
            name.innerText = player.name
            const score = base.create_append(row, "td", ["text-nowrap"])
            score.innerText = score_string(player.result, rank)
            const state = base.create_append(row, "td", ["text-nowrap"])
            state.innerText = player.state
            const actions = base.create_append(row, "td", ["text-nowrap"])
            if (this.console.tournament.state == d.TournamentState.WAITING) {
                if (player.state == d.PlayerState.REGISTERED || player.state == d.PlayerState.FINISHED) {
                    const button = base.create_append(actions, "button", ["btn", "btn-sm", "btn-success", "me-2"])
                    button.innerHTML = '<i class="bi bi-box-arrow-in-right"></i>'
                    const tip = base.add_tooltip(button, "Check in")
                    button.addEventListener("click", (ev) => { tip.dispose(); this.check_in(player) })
                } else if (player.state == d.PlayerState.CHECKED_IN) {
                    const button = base.create_append(actions, "button", ["btn", "btn-sm", "btn-warning", "me-2"])
                    button.innerHTML = '<i class="bi bi-box-arrow-left"></i>'
                    const tip = base.add_tooltip(button, "Check out")
                    button.addEventListener("click", (ev) => { tip.dispose(); this.check_out(player) })
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
                    button.addEventListener("click", (ev) => { tip.dispose(); this.drop(player) })
                }
            }
        }
        base.remove_children(this.action_row)
        if (this.console.tournament.state == d.TournamentState.REGISTRATION) {
            const button = base.create_append(this.action_row, "button", ["me-2", "btn", "btn-success"])
            button.innerText = "Open Check-In"
            button.addEventListener("click", (ev) => { this.console.open_checkin() })
        }
        else if (this.console.tournament.state == d.TournamentState.WAITING) {
            const button = base.create_append(this.action_row, "button", ["me-2", "btn", "btn-success"])
            button.innerText = `Seat Round ${this.console.tournament.rounds.length + 1}`
            button.addEventListener("click", (ev) => { this.console.start_round() })
        }
        if (this.console.tournament.state == d.TournamentState.REGISTRATION ||
            this.console.tournament.state == d.TournamentState.WAITING) {
            if (this.console.tournament.rounds.length > 0) {
                const finals_button = base.create_append(this.action_row, "button",
                    ["me-2", "btn", "btn-success"]
                )
                finals_button.innerText = "Seed Finals"
                finals_button.addEventListener("click", (ev) => {
                    this.console.seed_finals(...this.console.toss_for_finals())
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

    async check_in(player: d.Player) {
        await this.console.check_in(player.uid)
        // this.alert(`Checked ${player.name} in`)
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
                background = "bg-primary-subtle"
                icon = '<i class="bi bi-info-circle-fill"></i>'
                break;
            case d.AlertLevel.WARNING:
                background = "bg-warning-subtle"
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
    finals: boolean
    player_drag: PlayerDrag
    constructor(con: TournamentConsole, index: number, finals: boolean = false) {
        this.console = con
        this.index = index
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
        this.action_row = base.create_append(this.panel, "div", ["d-flex", "my-4"])
        this.reseat_button = base.create_append(this.action_row, "button", ["me-2", "btn", "btn-warning"])
        this.reseat_button.innerHTML = '<i class="bi bi-pentagon-fill"></i> Alter seating'
        this.reseat_button.addEventListener("click", (ev) => { this.start_reseat() })
        const round = this.console.tournament.rounds[this.index - 1]
        this.next_table_index = 1
        for (const table of round.tables) {
            this.display_table(table)
        }
        if (this.console.tournament.state == d.TournamentState.PLAYING
            && this.index == this.console.tournament.rounds.length
            && round.tables.every(t => t.state == d.TableState.FINISHED)
        ) {
            const button = base.create_append(this.action_row, "button", ["me-2", "btn", "btn-success"])
            button.innerText = "Finish round"
            button.addEventListener("click", (ev) => { this.console.finish_round() })
        }
        if (this.console.tournament.state == d.TournamentState.FINALS
            && this.index == this.console.tournament.rounds.length
            && round.tables.every(t => t.state == d.TableState.FINISHED)
        ) {
            const button = base.create_append(this.action_row, "button", ["me-2", "btn", "btn-success"])
            button.innerText = "Finish tournament"
            button.addEventListener("click", (ev) => { this.console.finish_tournament() })
        }
    }

    display_table(data: d.Table | undefined): HTMLTableSectionElement {
        if (this.next_table_index % 2 === 1) {
            this.table_div = base.create_append(this.panel, "div", ["row", "g-5", "my-4"])
        }
        const table_index = this.next_table_index++
        const div = base.create_append(this.table_div, "div", ["col-md-6"])
        const title_div = base.create_append(div, "div", ["d-inline-flex", "flex-row", "mb-2", "align-items-center"])
        const title = base.create_append(title_div, "h2", ["m-0", "me-2"])
        if (this.finals) {
            title.innerText = `Finals table`
        } else {
            title.innerText = `Table ${table_index}`
        }
        const table = base.create_append(div, "table", ["table"])
        const head = base.create_append(table, "thead")
        const tr = base.create_append(head, "tr")
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
            overrideButton.addEventListener("click", ev => this.console.override_table(this.index, table_index))
        }
        if (data.override) {
            const override_badge = base.create_append(title_div, "span", ["badge", "me-2", "text-bg-info"])
            override_badge.innerText = "Overriden"
            // TODO: add comment as tooltip?
        }
        for (const seat of data.seating) {
            const player = this.console.tournament.players[seat.player_uid]
            const row = base.create_append(body, "tr")
            const actions = this.display_player(row, player, seat)
            const changeButton = base.create_append(actions, "button", ["me-2", "btn", "btn-sm", "btn-primary"])
            changeButton.innerHTML = '<i class="bi bi-pencil"></i>'
            changeButton.addEventListener("click", (ev) => {
                this.console.score_modal.show(player, this.index, seat.result.vp)
            })
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
            const seed_score = `${player.seed.toString()} (${score_string(player.result)})`
            base.create_append(row, "th", ["text-nowrap"], { scope: "row" }).innerText = seed_score
            base.create_append(row, "td", ["text-nowrap"], { scope: "row" }).innerText = player.vekn
        } else {
            base.create_append(row, "th", ["text-nowrap"], { scope: "row" }).innerText = player.vekn
        }
        base.create_append(row, "td", ["w-100"]).innerText = player.name
        if (seat) {
            base.create_append(row, "td", ["text-nowrap"]).innerText = score_string(seat.result)
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
                ["col-2", "me-2", "btn", "btn-primary"]
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
        const empty_row = base.create_append(body, "tr")
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
    constructor(el: HTMLDivElement, console: TournamentConsole) {
        this.console = console
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
        const button_00 = base.create_append(row_1, "button", ["btn", "btn-primary", "me-1", "mb-1"], { type: "button" })
        const button_10 = base.create_append(row_1, "button", ["btn", "btn-primary", "me-1", "mb-1"], { type: "button" })
        const button_20 = base.create_append(row_1, "button", ["btn", "btn-primary", "me-1", "mb-1"], { type: "button" })
        const button_30 = base.create_append(row_1, "button", ["btn", "btn-primary", "me-1", "mb-1"], { type: "button" })
        const button_40 = base.create_append(row_1, "button", ["btn", "btn-primary", "me-1", "mb-1"], { type: "button" })
        const button_50 = base.create_append(row_1, "button", ["btn", "btn-primary", "me-1", "mb-1"], { type: "button" })
        const row_2 = base.create_append(body, "div", ["d-flex", "flex-row", "align-items-center"])
        const button_05 = base.create_append(row_2, "button", ["btn", "btn-primary", "me-1", "mb-1"], { type: "button" })
        const button_15 = base.create_append(row_2, "button", ["btn", "btn-primary", "me-1", "mb-1"], { type: "button" })
        const button_25 = base.create_append(row_2, "button", ["btn", "btn-primary", "me-1", "mb-1"], { type: "button" })
        const button_35 = base.create_append(row_2, "button", ["btn", "btn-primary", "me-1", "mb-1"], { type: "button" })
        const button_45 = base.create_append(row_2, "button", ["btn", "btn-primary", "me-1", "mb-1"], { type: "button" })
        button_00.innerText = "0"
        button_05.innerText = "0.5"
        button_10.innerText = "1"
        button_15.innerText = "1.5"
        button_20.innerText = "2"
        button_25.innerText = "2.5"
        button_30.innerText = "3"
        button_35.innerText = "3.5"
        button_40.innerText = "4"
        button_45.innerText = "4.5"
        button_50.innerText = "5"
        button_00.addEventListener("click", (ev) => this.set_score(0))
        button_05.addEventListener("click", (ev) => this.set_score(0.5))
        button_10.addEventListener("click", (ev) => this.set_score(1))
        button_15.addEventListener("click", (ev) => this.set_score(1.5))
        button_20.addEventListener("click", (ev) => this.set_score(2))
        button_25.addEventListener("click", (ev) => this.set_score(2.5))
        button_30.addEventListener("click", (ev) => this.set_score(3))
        button_35.addEventListener("click", (ev) => this.set_score(3.5))
        button_40.addEventListener("click", (ev) => this.set_score(4))
        button_45.addEventListener("click", (ev) => this.set_score(4.5))
        button_50.addEventListener("click", (ev) => this.set_score(5))
        this.modal = new bootstrap.Modal(this.modal_div)
    }

    async set_score(score: number) {
        await this.console.set_score(this.player_uid, this.round_number, score)
        this.modal.hide()
    }

    show(player: d.Player, round_number: number, vps: number = 0) {
        this.title.innerText = `${player.name} result: round ${round_number}`
        this.player_uid = player.uid
        this.round_number = round_number
        this.modal.show()
    }
}

class TournamentConsole {
    root: HTMLDivElement
    token: base.Token
    members_map: member.MemberMap | undefined
    tournament: d.Tournament | undefined
    nav: HTMLElement
    tabs_div: HTMLDivElement
    score_modal: ScoreModal
    tabs: Map<string, bootstrap.Tab>
    player_select: PlayerSelectModal
    add_member_modal: AddMemberModal
    info: TournamentDisplay
    registration: Registration
    rounds: RoundTab[]
    constructor(el: HTMLDivElement, token: base.Token) {
        console.log("build conole")
        this.root = el
        this.token = token
        this.members_map = new member.MemberMap()
        this.score_modal = new ScoreModal(el, this)
        this.player_select = new PlayerSelectModal(el)
        this.add_member_modal = new AddMemberModal(el, this)
        this.nav = base.create_append(el, "nav", ["nav", "nav-tabs"], { role: "tablist" })
        this.tabs_div = base.create_append(el, "div", ["tab-content"])
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
        const display_tab = this.add_nav("Info")
        this.info = new TournamentDisplay(display_tab)
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
        this.tabs.get("Info").show()
        await this.members_map.init(this.token)
        { // init countries in components using them
            const res = await base.do_fetch("/api/vekn/country", {})
            const countries = await res.json() as d.Country[]
            await this.add_member_modal.init(countries)
            await this.info.init(this.token, this.members_map, countries)
        }
    }

    async display() {
        while (this.nav.parentElement.firstElementChild != this.nav) {
            this.nav.parentElement.firstElementChild.remove()
        }
        await this.info.display(this.tournament, true)
        if (this.tournament.state == d.TournamentState.FINISHED) {
            const alert = base.create_element("div", ["alert", "alert-success"], { role: "alert" })
            var alert_text = "This tournament is Finished."
            if (this.tournament.winner) {
                const winner = this.tournament.players[this.tournament.winner]
                alert_text += ` Congratulation ${winner.name} (${winner.vekn})!`
            }
            alert.innerText = alert_text
            this.nav.parentElement.insertBefore(alert, this.nav)
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
            if (tables) {
                rounds.push(tables)
            }
        }
        return seating.compute_issues(rounds)
    }

    toss_for_finals(): [string[], Record<string, number>] {
        var last_rank = 0
        var to_toss: d.Player[] = []
        const toss = {}
        for (const [rank, player] of standings(this.tournament)) {
            if (rank > 5) {
                break
            }
            if (rank > last_rank) {
                last_rank = rank
                seating.shuffle_array(to_toss)
                var idx = 0
                for (const player of to_toss) {
                    idx++
                    player.toss = idx
                    toss[player.uid] = idx
                }
                to_toss = []
            }
            to_toss.push(player)
        }
        return [standings(this.tournament).splice(0, 5).map(p => p[1].uid), toss]
    }

    async handle_tournament_event(tev: events.TournamentEvent) {
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
        const response = await res.json()
        console.log(response)
        this.tournament = response
        this.display()
    }

    async add_member(member: d.Member) {
        // TODO figure out what to do in offline mode
        const res = await base.do_fetch("/api/vekn/members", {
            method: "post",
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.token.access_token}`
            },
            body: JSON.stringify(member)
        })
        if (res) {
            member = await res.json()
            this.register_player(member)
        }
        return
    }

    async register_player(member: d.Member) {
        const event: events.Register = {
            type: events.EventType.REGISTER,
            uid: uuid.v4(),
            name: member.name,
            vekn: member.vekn,
            player_uid: member.uid,
            country: member.country,
            city: member.city,
        }
        await this.handle_tournament_event(event)
    }
    async check_in(player_uid: string) {
        const event: events.CheckIn = {
            type: events.EventType.CHECK_IN,
            uid: uuid.v4(),
            player_uid: player_uid,
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
    }
    async override_table(round_number: number, table_number: number) {
        const event: events.Override = {
            type: events.EventType.OVERRIDE,
            uid: uuid.v4(),
            round: round_number,
            table: table_number,
            comment: "",  // TODO: we'll need another modal I guess
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
    async finish_round() {
        const event: events.RoundFinish = {
            type: events.EventType.ROUND_FINISH,
            uid: uuid.v4(),
        }
        await this.handle_tournament_event(event)
        this.tabs.get("Registration").show()
    }
    async seed_finals(seeds: string[], toss: Record<string, number>) {
        const event: events.SeedFinals = {
            type: events.EventType.SEED_FINALS,
            uid: uuid.v4(),
            seeds: seeds,
            toss: toss,
        }
        await this.handle_tournament_event(event)
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
    }
}

async function load() {
    const consoleDiv = document.getElementById("consoleDiv") as HTMLDivElement
    const token = await base.fetchToken()
    const tournament = new TournamentConsole(consoleDiv, token)
    await tournament.init(consoleDiv.dataset.tournamentUid)
    await tournament.display()
}

window.addEventListener("load", (ev) => { load() })
