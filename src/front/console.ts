import * as base from "./base"
import * as events from "./events"
import * as seating from "./seating"
import * as bootstrap from 'bootstrap'
import unidecode from 'unidecode'
import * as uuid from 'uuid'


function remove_children(el: HTMLElement) {
    while (el.lastElementChild) {
        el.removeChild(el.lastElementChild)
    }
}

function swap_nodes(el1: HTMLElement, el2: HTMLElement) {
    console.log("swapping", el1, el2)
    if (el1 === el2) { return }
    const next1 = el1.nextSibling
    const next2 = el2.nextSibling
    const parent1 = el1.parentElement
    const parent2 = el2.parentElement
    if (next1 != el2) { parent1.insertBefore(el2, next1) }
    if (next2 != el1) { parent2.insertBefore(el1, next2) }
}

function swap_row_and_empty(el: HTMLTableRowElement, empty: HTMLTableRowElement) {
    console.log("swapping (empty)", el, empty)
    if (el === empty) { return }
    const parent = el.parentElement
    const parent_empty = empty.parentElement
    var next_non_empty = parent_empty.firstElementChild
    while (true) {
        const candidate = next_non_empty.nextElementSibling as HTMLTableRowElement | undefined
        if (!candidate?.dataset?.player_uid) { break }
        next_non_empty = candidate
    }
    parent_empty.insertBefore(el, next_non_empty.nextElementSibling)
    parent.append(empty)
}


function normalize_string(s: string) {
    var res = unidecode(s).toLowerCase()
    // remove non-letters non-numbers
    res.replace(/[^\p{L}\p{N}\s]/gu, "")
    // remove spurious spaces
    res.replace(/\s{2,}/g, " ");
    return res
}

function score_string(score: Score, rank: number = undefined): string {
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
        res = `1. ${res} (${score.tp}TPs)`
    }
    return res
}

function compare_scores(lhs: Score, rhs: Score) {
    const gw = lhs.gw - rhs.gw
    if (gw != 0) { return gw }
    const vp = lhs.vp - rhs.vp
    if (vp != 0) { return vp }
    const tp = lhs.tp - rhs.tp
    if (tp != 0) { return tp }
    return 0
}

function compare_arrays(lhs: any[], rhs: any[]) {
    const length = lhs.length < rhs.length ? lhs.length : rhs.length
    for (var i = 0; i < length; i++) {
        const val = lhs[i] - rhs[i]
        if (val != 0) { return val }
    }
    return 0
}

function standings_array(p: Player) {
    return [+(p.state == PlayerState.FINISHED), -p.result.gw, -p.result.vp, -p.result.tp, p.toss ?? 0]
}

function compare_standings(lhs: Player, rhs: Player) {
    return compare_arrays(standings_array(lhs), standings_array(rhs))
}

function standings(players: Player[]): [number, Player][] {
    const res = []
    const sorted = players.toSorted(compare_standings)
    var rank = 0
    var last_standings = [-1, 0, 0, 0, 0]
    for (const player of sorted) {
        const standings = standings_array(player)
        const cmp = compare_arrays(last_standings, standings)
        if (cmp > 0) {
            rank++
            last_standings = standings
        }
        res.push([rank, player])
    }
    return res
}

class PersonMap<Type extends Person> {
    by_vekn: Map<string, Type>
    by_uid: Map<string, Type>
    trie: Map<string, Array<Type>>
    constructor() {
        this.by_vekn = new Map()
        this.by_uid = new Map()
        this.trie = new Map()
    }

    add(persons: Type[]) {
        for (const person of persons) {
            if (person.vekn && person.vekn.length > 0) {
                this.by_vekn.set(person.vekn, person)
            }
            this.by_uid.set(person.uid, person)
            const parts = normalize_string(person.name).split(" ")
            for (const part of parts) {
                for (var i = 1; i < part.length + 1; i++) {
                    const piece = part.slice(0, i)
                    if (!this.trie.has(piece)) {
                        this.trie.set(piece, [])
                    }
                    this.trie.get(piece).push(person)
                }
            }
        }
    }

    remove(s: string) {
        if (!this.by_uid.has(s)) { return }
        const person = this.by_uid.get(s)
        this.by_uid.delete(person.uid)
        if (person.vekn && person.vekn.length > 0) {
            this.by_vekn.delete(person.vekn)
        }
        // we could through the name parts and pieces... not necessarily faster
        for (const pieces of this.trie.values()) {
            var idx = pieces.findIndex(p => p.uid == s)
            while (idx >= 0) {
                pieces.splice(idx, 1)
                idx = pieces.findIndex(p => p.uid == s)
            }
            // it is fine to let empty arrays be 
        }
    }

    complete_name(s: string): Type[] {
        var members_list: Type[] | undefined = undefined
        for (const part of normalize_string(s).toLowerCase().split(" ")) {
            const members = this.trie.get(part)
            if (members) {
                if (members_list) {
                    members_list = members_list.filter(m => members.includes(m))
                } else {
                    members_list = members
                }
            }
        }
        return members_list ? members_list : []
    }
}

class MemberMap extends PersonMap<Member> {
    async init(token: base.Token) {
        const res = await base.do_fetch("/api/vekn/members", {
            method: "get",
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token.access_token}`
            },
        })
        const members = await res.json() as Member[]
        this.add(members)
    }
}

class PersonLookup<Type extends Person> {
    form: HTMLFormElement
    input_vekn_id: HTMLInputElement
    input_name: HTMLInputElement
    dropdown_menu: HTMLUListElement
    button: HTMLButtonElement
    dropdown: bootstrap.Dropdown
    persons_map: PersonMap<Type>
    person: Type | undefined
    focus: HTMLLIElement | undefined
    constructor(persons_map: PersonMap<Type>, root: HTMLElement, label: string, inline: boolean = false) {
        this.persons_map = persons_map
        this.form = base.create_append(root, "form")
        const top_div = base.create_append(this.form, "div", ["d-flex"])
        if (inline) {
            top_div.classList.add("flex-row", "align-items-center")
        } else {
            top_div.classList.add("flex-column")
        }
        const vekn_div = base.create_append(top_div, "div", ["me-2", "mb-2"])
        this.input_vekn_id = base.create_append(vekn_div, "input", ["form-control"],
            { type: "text", placeholder: "VEKN ID number", autocomplete: "off", "aria-autocomplete": "off" }
        )
        this.input_vekn_id.spellcheck = false

        const dropdown_div = base.create_append(top_div, "div", ["me-2", "mb-2", "dropdown"])
        if (inline) {
            dropdown_div.classList.add("col-xl-4")
        }
        this.input_name = base.create_append(dropdown_div, "input", ["form-control", "dropdown-toggle"],
            { type: "text", placeholder: "Name", autocomplete: "off", "aria-autocomplete": "off" }
        )
        this.input_name.spellcheck = false
        this.dropdown_menu = base.create_append(dropdown_div, "ul", ["dropdown-menu"])
        const button_div = base.create_append(top_div, "div", ["me-2", "mb-2"])
        this.button = base.create_append(button_div, "button", ["btn", "btn-primary"], { type: "submit" })
        this.button.innerText = label
        this.button.disabled = true
        this.dropdown = new bootstrap.Dropdown(this.input_name)
        this.dropdown.hide()
        this.input_vekn_id.addEventListener("input", (ev) => this.select_member_by_vekn())
        this.input_name.addEventListener("input", base.debounce((ev) => this.complete_member_name()))
        dropdown_div.addEventListener("keydown", (ev) => this.keydown(ev));
    }

    reset_focus(new_focus: HTMLLIElement | undefined = undefined) {
        if (this.focus) {
            this.focus.firstElementChild.classList.remove("active")
        }
        this.focus = new_focus
        if (this.focus) {
            this.focus.firstElementChild.classList.add("active")
        }
    }

    reset() {
        this.person = undefined
        this.input_vekn_id.value = ""
        this.input_name.value = ""
        this.button.disabled = true
        this.reset_focus()
    }

    select_member_by_vekn() {
        this.person = this.persons_map.by_vekn.get(this.input_vekn_id.value)
        if (this.person) {
            this.input_name.value = this.person.name
            this.button.disabled = false
        }
        else {
            this.input_name.value = ""
            this.button.disabled = true
        }
    }

    select_member_name(ev: Event) {
        const button = ev.currentTarget as HTMLButtonElement
        this.person = this.persons_map.by_uid.get(button.dataset.memberUid)
        if (this.person) {
            this.input_vekn_id.value = this.person.vekn
            this.input_name.value = this.person.name
            this.button.disabled = false
        }
        else {
            this.input_vekn_id.value = ""
            this.input_name.value = ""
            this.button.disabled = true
        }
        this.reset_focus()
        this.dropdown.hide()
    }

    complete_member_name() {
        while (this.dropdown_menu.lastElementChild) {
            this.dropdown_menu.removeChild(this.dropdown_menu.lastElementChild)
        }
        this.reset_focus()
        this.input_vekn_id.value = ""
        this.button.disabled = true
        if (this.input_name.value.length < 3) {
            this.dropdown.hide()
            return
        }
        const persons_list = this.persons_map.complete_name(this.input_name.value)
        if (!persons_list) {
            this.dropdown.hide()
            return
        }
        for (const person of persons_list.slice(0, 10)) {
            const li = base.create_append(this.dropdown_menu, "li")
            const button = base.create_append(li, "button", ["dropdown-item"],
                { type: "button", "data-member-uid": person.uid }
            )
            var tail: string[] = []
            if (person.city) {
                tail.push(person.city)
            }
            if (person.country) {
                tail.push(person.country)
            }
            button.innerText = person.name
            if (tail.length > 0) {
                button.innerText += ` (${tail.join(", ")})`
            }
            button.addEventListener("click", (ev) => this.select_member_name(ev))
        }
        this.dropdown.show()
    }

    keydown(ev: KeyboardEvent) {
        var next_focus: HTMLLIElement | undefined = undefined
        switch (ev.key) {
            case "ArrowDown": {
                if (this.focus) {
                    next_focus = this.focus.nextElementSibling as HTMLLIElement
                } else {
                    next_focus = this.dropdown_menu.firstElementChild as HTMLLIElement
                }
                if (next_focus === null) {
                    next_focus = this.focus
                }
                break
            }
            case "ArrowUp": {
                if (this.focus) {
                    next_focus = this.focus.previousElementSibling as HTMLLIElement
                } else {
                    next_focus = this.dropdown_menu.lastElementChild as HTMLLIElement
                }
                if (next_focus === null) {
                    next_focus = this.focus
                }
                break
            }
            case "Escape": {
                break
            }
            case "Enter": {
                if (this.focus) {
                    this.focus.firstElementChild.dispatchEvent(new Event("click"))
                } else {
                    return
                }
                break
            }
            default: return
        }
        ev.stopPropagation()
        ev.preventDefault()
        if (next_focus === this.focus) { return }
        if (this.focus) {
            this.focus.firstElementChild.classList.remove("active")
        }
        this.focus = next_focus
        if (this.focus) {
            this.focus.firstElementChild.classList.add("active")
        }
    }
}

class PlayerLookupModal extends PersonLookup<Player> {
    modal_div: HTMLDivElement
    header: HTMLHeadingElement
    modal: bootstrap.Modal
    round_tab: RoundTab | undefined
    empty_row: HTMLTableRowElement | undefined
    constructor(el: HTMLElement, title: string = "Add player", label: string = "Add") {
        const modal_div = base.create_append(el, "div", ["modal", "fade"],
            { tabindex: "-1", "aria-hidden": "true", "aria-labelledby": "LookupModalLabel" }
        )
        const dialog = base.create_append(modal_div, "div", ["modal-dialog"])
        const content = base.create_append(dialog, "div", ["modal-content"])
        const header_div = base.create_append(content, "div", ["modal-header"])
        const header = base.create_append(header_div, "h1", ["modal-title", "fs-5"])
        header.innerText = title
        base.create_append(header_div, "button", ["btn-close"], { "data-bs-dismiss": "modal", "aria-label": "Close" })
        const body = base.create_append(content, "div", ["modal-body"])
        const players_map = new PersonMap<Player>()
        super(players_map, body, label, false)
        this.modal_div = modal_div
        this.header = header
        this.modal = new bootstrap.Modal(this.modal_div)
        this.form.addEventListener("submit", (ev) => this.add_player(ev))
    }

    init(round_tab: RoundTab, players: Player[]) {
        this.round_tab = round_tab
        this.persons_map.by_uid.clear()
        this.persons_map.by_vekn.clear()
        this.persons_map.trie.clear()
        this.persons_map.add(players)
    }

    show(empty_row: HTMLTableRowElement) {
        this.empty_row = empty_row
        this.modal.show()
    }

    add_player(ev: SubmitEvent) {
        ev.preventDefault()
        this.round_tab.add_player(this.empty_row, this.person)
        this.reset()
        this.modal.hide()
    }
}

class Registration {
    console: TournamentConsole
    panel: HTMLDivElement
    action_row: HTMLDivElement
    register_element: PersonLookup<Member>
    players_table: HTMLTableElement
    players_table_body: HTMLTableSectionElement
    constructor(console: TournamentConsole) {
        this.console = console
        this.panel = console.add_nav("Registration")
        this.action_row = base.create_append(this.panel, "div", ["row", "g-3", "my-4"])
        this.register_element = new PersonLookup<Member>(console.members_map, this.panel, "Register", true)
        this.register_element.form.addEventListener("submit", (ev) => { this.add_player(ev) })
        this.players_table = base.create_append(this.panel, "table", ["table", "my-4"])
        const head = base.create_append(this.players_table, "thead")
        const row = base.create_append(head, "tr")
        for (const label of ["VEKN #", "Name", "Score", "State", ""]) {
            const cel = base.create_append(row, "th", [], { scope: "col" })
            cel.innerText = label
        }
        this.players_table_body = base.create_append(this.players_table, "tbody")
    }

    display() {
        remove_children(this.players_table_body)
        const players = standings(Object.values(this.console.tournament.players))
        for (const [rank, player] of players) {
            const row = base.create_append(this.players_table_body, "tr")
            const head = base.create_append(row, "th", [], { scope: "row" })
            head.innerText = player.vekn
            const name = base.create_append(row, "td")
            name.innerText = player.name
            const score = base.create_append(row, "td")
            score.innerText = score_string(player.result, rank)
            const state = base.create_append(row, "td")
            state.innerText = player.state
            const actions = base.create_append(row, "td")
            if (this.console.tournament.state == TournamentState.WAITING) {
                if (player.state == PlayerState.REGISTERED) {
                    const button = base.create_append(actions, "button", ["btn", "btn-success"])
                    button.innerText = "Check In"
                    button.addEventListener("click", (ev) => { this.console.check_in(player.uid) })
                }
                if (player.state == PlayerState.REGISTERED || player.state == PlayerState.CHECKED_IN) {
                    const button = base.create_append(actions, "button", ["btn", "btn-warning"])
                    button.innerText = "Drop"
                    button.addEventListener("click", (ev) => { this.console.drop(player.uid) })
                }
            }
        }
        remove_children(this.action_row)
        if (this.console.tournament.state == TournamentState.REGISTRATION) {
            const button = base.create_append(this.action_row, "button", ["col-2", "me-2", "btn", "btn-success"])
            button.innerText = "Open Check-In"
            button.addEventListener("click", (ev) => { this.console.open_checkin() })
        }
        else if (this.console.tournament.state == TournamentState.WAITING) {
            const button = base.create_append(this.action_row, "button", ["col-2", "me-2", "btn", "btn-success"])
            button.innerText = `Seat Round ${this.console.tournament.rounds.length + 1}`
            button.addEventListener("click", (ev) => { this.console.start_round() })
        }
        if (this.console.tournament.state == TournamentState.REGISTRATION ||
            this.console.tournament.state == TournamentState.WAITING) {
            if (this.console.tournament.rounds.length > 0) {
                const finals_button = base.create_append(this.action_row, "button",
                    ["col-2", "me-2", "btn", "btn-success"]
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
        this.register_element.reset()
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
    dragging: HTMLTableRowElement | undefined
    dragging_origin: HTMLTableSectionElement | undefined
    cross_table_drag: HTMLTableRowElement | undefined
    constructor(con: TournamentConsole, index: number, finals: boolean = false) {
        this.console = con
        this.index = index
        this.finals = finals
        if (this.finals) {
            this.panel = this.console.add_nav(`Finals`, (ev) => this.setup_player_lookup_modal())
        } else {
            this.panel = this.console.add_nav(`Round ${this.index}`, (ev) => this.setup_player_lookup_modal())
        }
    }

    display() {
        remove_children(this.panel)
        this.action_row = base.create_append(this.panel, "div", ["row", "g-3", "my-4"])
        this.reseat_button = base.create_append(this.action_row, "button", ["col-2", "me-2", "btn", "btn-warning"])
        this.reseat_button.innerHTML = '<i class="bi bi-pentagon-fill"></i> Alter seating'
        this.reseat_button.addEventListener("click", (ev) => { this.start_reseat() })
        const round = this.console.tournament.rounds[this.index - 1]
        this.next_table_index = 1
        for (const table of round.tables) {
            this.display_table(table)
        }
        if (this.console.tournament.state == TournamentState.PLAYING
            && this.index == this.console.tournament.rounds.length
            && round.tables.every(t => t.state == TableState.FINISHED)
        ) {
            const button = base.create_append(this.action_row, "button", ["col-2", "me-2", "btn", "btn-success"])
            button.innerText = "Finish round"
            button.addEventListener("click", (ev) => { this.console.finish_round() })
        }
        if (this.console.tournament.state == TournamentState.FINALS
            && this.index == this.console.tournament.rounds.length
            && round.tables.every(t => t.state == TableState.FINISHED)
        ) {
            const button = base.create_append(this.action_row, "button", ["col-2", "me-2", "btn", "btn-success"])
            button.innerText = "Finish tournament"
            button.addEventListener("click", (ev) => { this.console.finish_tournament() })
        }
    }

    display_table(data: Table | undefined): HTMLTableSectionElement {
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
            case TableState.FINISHED:
                badge.classList.add("text-bg-success")
                break
            case TableState.INVALID:
                badge.classList.add("text-bg-danger")
                break
            case TableState.IN_PROGRESS:
                badge.classList.add("text-bg-secondary")
                break
        }
        if (data.state != TableState.FINISHED) {
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
        player: Player,
        seat: TableSeat | undefined = undefined
    ): HTMLTableCellElement {
        row.dataset.player_uid = player.uid
        if (this.finals) {
            base.create_append(row, "th", [], { scope: "row" }).innerText = player.seed.toString()
            base.create_append(row, "td", [], { scope: "row" }).innerText = player.vekn
        } else {
            base.create_append(row, "th", [], { scope: "row" }).innerText = player.vekn
        }
        base.create_append(row, "td").innerText = player.name
        if (seat) {
            base.create_append(row, "td").innerText = score_string(seat.result)
        } else {
            // not seated *yet*: we're in alter seating mode
            base.create_append(row, "td").innerText = "0VP"
        }
        return base.create_append(row, "td", ["action-row"])
    }

    setup_reseat_table_body(table: HTMLTableSectionElement) {
        var rows = table.querySelectorAll("tr") as NodeListOf<HTMLTableRowElement>
        for (const row of rows) {
            const action_row = row.querySelector(".action-row") as HTMLTableCellElement
            remove_children(action_row)
            this.display_reseat_actions(row, action_row)
        }
        while (rows.length < 5) {
            this.add_empty_row(table)
            rows = table.querySelectorAll("tr") as NodeListOf<HTMLTableRowElement>
        }
    }
    start_reseat() {
        remove_children(this.action_row)
        this.reseat_button = base.create_append(this.action_row, "button", ["col-2", "me-2", "btn", "btn-success"])
        this.reseat_button.innerHTML = '<i class="bi bi-check"></i> Save seating'
        this.reseat_button.addEventListener("click", (ev) => { this.reseat() })
        const add_table_button = base.create_append(this.action_row, "button", ["col-2", "me-2", "btn", "btn-primary"])
        add_table_button.innerHTML = '<i class="bi bi-plus"></i> Add Table'
        add_table_button.addEventListener("click", (ev) => { this.setup_reseat_table_body(this.display_table(undefined)) })
        const cancel_button = base.create_append(this.action_row, "button", ["col-2", "me-2", "btn", "btn-secondary"])
        cancel_button.innerHTML = '<i class="bi bi-x"></i> Cancel'
        cancel_button.addEventListener("click", (ev) => { this.display() })

        const tables = this.panel.querySelectorAll("tbody") as NodeListOf<HTMLTableSectionElement>
        for (const table of tables.values()) {
            this.setup_reseat_table_body(table)
        }
    }

    display_reseat_actions(row: HTMLTableRowElement, actions_row: HTMLTableCellElement) {
        const remove_button = base.create_append(actions_row, "button", ["me-2", "btn", "btn-sm", "btn-danger"])
        remove_button.innerHTML = '<i class="bi bi-trash"></i>'
        remove_button.addEventListener("click", (ev) => { this.remove_row(row) })
        row.draggable = true
        row.addEventListener("dragstart", (ev) => this.dragstart_row(ev, row))
        row.addEventListener("dragenter", (ev) => this.dragenter_row(ev, row))
        row.addEventListener("dragover", (ev) => ev.preventDefault())
        row.addEventListener("dragend", (ev) => this.dragend_row(ev, row))
    }

    dragstart_row(ev: DragEvent, row: HTMLTableRowElement) {
        const target_row = ev.target as HTMLTableRowElement
        console.log("dragstart", ev, target_row)
        this.dragging = target_row
        this.dragging.classList.add("dragged")
        this.dragging_origin = this.dragging.parentElement as HTMLTableSectionElement
    }

    dragenter_row(ev: DragEvent, target_row: HTMLTableRowElement) {
        if (this.dragging == undefined) { return }
        if (this.dragging == target_row) { return }
        ev.preventDefault()
        if (this.cross_table_drag && this.cross_table_drag != target_row) {
            swap_nodes(this.dragging, this.cross_table_drag)
            this.cross_table_drag.classList.remove("dragged")
            this.cross_table_drag = undefined
        }
        if (this.dragging_origin != target_row.parentElement as HTMLTableSectionElement) {
            this.cross_table_drag = target_row
            this.cross_table_drag.classList.add("dragged")
        }
        swap_nodes(this.dragging, target_row)
    }

    dragenter_empty_row(ev: DragEvent, target_row: HTMLTableRowElement) {
        if (this.dragging == undefined) { return }
        if (this.cross_table_drag && this.cross_table_drag != target_row) {
            swap_nodes(this.dragging, this.cross_table_drag)
            this.cross_table_drag.classList.remove("dragged")
            this.cross_table_drag = undefined
        }
        if (this.dragging.parentElement == target_row.parentElement) { return }
        ev.preventDefault()
        swap_row_and_empty(this.dragging, target_row)
        this.dragging_origin = this.dragging.parentElement as HTMLTableSectionElement
    }

    dragend_row(ev: DragEvent, row: HTMLTableRowElement) {
        console.log("dragend", ev, this.dragging)
        if (this.dragging) {
            this.dragging.classList.remove("dragged")
        }
        this.dragging = undefined
        if (this.cross_table_drag) {
            this.cross_table_drag.classList.remove("dragged")
        }
        this.cross_table_drag = undefined
        this.dragging_origin = undefined
    }

    remove_row(row: HTMLTableRowElement) {
        const parent = row.parentElement as HTMLTableSectionElement
        if (Object.hasOwn(this.console.tournament.players, row.dataset.player_uid)) {
            this.console.player_lookup.persons_map.add([this.console.tournament.players[row.dataset.player_uid]])
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
        empty_row.addEventListener("dragenter", (ev) => this.dragenter_empty_row(ev, empty_row))
        empty_row.addEventListener("dragover", (ev) => ev.preventDefault())
        empty_row.addEventListener("dragend", (ev) => this.dragend_row(ev, empty_row))
    }

    async reseat() {
        const tables = this.panel.querySelectorAll("tbody") as NodeListOf<HTMLTableSectionElement>
        const round_seating = []
        for (const table of tables.values()) {
            const table_seating = []
            const rows = table.querySelectorAll("tr") as NodeListOf<HTMLTableRowElement>
            for (const row of rows) {
                const player_uid = row.dataset.player_uid
                if (player_uid) {
                    table_seating.push(player_uid)
                }
            }
            if (table_seating.length > 0) {
                round_seating.push(table_seating)
            }
        }
        await this.console.alter_seating(this.index, round_seating)
    }

    setup_player_lookup_modal() {
        const players = []
        const player_in_round = new Set<string>()
        for (const table of this.console.tournament.rounds[this.index - 1].tables) {
            for (const seat of table.seating) {
                player_in_round.add(seat.player_uid)
            }
        }
        for (const player of Object.values(this.console.tournament.players)) {
            if (player_in_round.has(player.uid)) { continue }
            players.push(player)
        }
        this.console.player_lookup.init(this, players)
    }

    display_player_lookup_modal(empty_row: HTMLTableRowElement) {
        this.console.player_lookup.show(empty_row)
    }

    add_player(empty_row, player: Player) {
        remove_children(empty_row)
        const actions = this.display_player(empty_row, player)
        this.display_reseat_actions(empty_row, actions)
        this.console.player_lookup.persons_map.remove(player.uid)
    }
}

class ScoreModal {
    console: TournamentConsole
    player_uid: string
    round_number: number
    modal_div: HTMLDivElement
    modal: bootstrap.Modal
    title: HTMLHeadingElement
    input_vps: HTMLInputElement
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
        const body = base.create_append(content, "div", ["modal-body"])
        const form = base.create_append(body, "form")
        this.input_vps = base.create_append(form, "input", ["form-control", "my-2"],
            { type: "number", name: "vp", min: "0", max: "5", step: "0.5" }
        )
        base.create_append(form, "button", ["btn", "btn-primary", "my-2"], { type: "submit" }).innerText = "Submit"
        form.addEventListener("submit", (ev) => {
            ev.preventDefault()
            this.console.set_score(this.player_uid, this.round_number, parseFloat(this.input_vps.value))
            this.modal.hide()
        })
        this.modal = new bootstrap.Modal(this.modal_div)
    }

    show(player: Player, round_number: number, vps: number = 0) {
        this.title.innerText = `${player.name} result: round ${round_number}`
        this.player_uid = player.uid
        this.round_number = round_number
        this.input_vps.value = vps.toString()
        this.modal.show()
    }
}

class TournamentConsole {
    token: base.Token
    members_map: MemberMap | undefined
    tournament: Tournament | undefined
    nav: HTMLElement
    tabs_div: HTMLDivElement
    score_modal: ScoreModal
    tabs: Map<string, bootstrap.Tab>
    player_lookup: PlayerLookupModal
    registration: Registration
    rounds: RoundTab[]
    constructor(el: HTMLDivElement, token: base.Token) {
        this.token = token
        this.members_map = new MemberMap()
        this.score_modal = new ScoreModal(el, this)
        this.player_lookup = new PlayerLookupModal(el)
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
        this.registration = new Registration(this)
        this.rounds = []
        for (var i = 0; i < this.tournament.rounds.length; i++) {
            var finals: boolean = false
            if ((this.tournament.state == TournamentState.FINALS
                || this.tournament.state == TournamentState.FINISHED)
                && this.tournament.rounds.length - this.rounds.length == 1
            ) {
                finals = true
            }
            const round_tab = new RoundTab(this, i + 1, finals)
            this.rounds.push(round_tab)
        }
        this.tabs.get("Registration").show()
        await this.members_map.init(this.token)
    }

    display() {
        while (this.nav.parentElement.firstElementChild != this.nav) {
            this.nav.parentElement.firstElementChild.remove()
        }
        if (this.tournament.state == TournamentState.FINISHED) {
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
            if ((this.tournament.state == TournamentState.FINALS
                || this.tournament.state == TournamentState.FINISHED)
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

    toss_for_finals(): [string[], Record<string, number>] {
        const players = Object.values(this.tournament.players)
        var last_rank = 0
        var to_toss: Player[] = []
        const toss = {}
        for (const [rank, player] of standings(players)) {
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
        return [standings(players).splice(0, 5).map(p => p[1].uid), toss]
    }

    async handle_tournament_event(tev: events.TournamentEvent) {
        console.log("handle event", tev)
        // TODO: implement offline mode
        const res = await base.do_fetch(`/api/tournaments/${this.tournament.uid}/event`, {
            method: "post",
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.token.access_token}`
            },
            body: JSON.stringify(tev)
        })
        if (!res) { return }
        const response = await res.json()
        console.log(response)
        this.tournament = response
        this.display()
    }
    async register_player(member: Member) {
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
            .filter(p => p.state === PlayerState.CHECKED_IN)
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
    async finish_tournament() {
        const event: events.FinishTournament = {
            type: events.EventType.FINISH_TOURNAMENT,
            uid: uuid.v4()
        }
        await this.handle_tournament_event(event)
    }
}

async function load() {
    console.log("load")
    const consoleDiv = document.getElementById("consoleDiv") as HTMLDivElement
    const token = await base.fetchToken()
    const tournament = new TournamentConsole(consoleDiv, token)
    await tournament.init(consoleDiv.dataset.tournamentUid)
    tournament.display()
}

window.addEventListener("load", (ev) => { base.load() })
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

enum TableState {
    FINISHED = "Finished",
    IN_PROGRESS = "In Progress",
    INVALID = "Invalid",
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

interface Person {
    name: string,
    vekn: string,
    uid: string,
    country: string | undefined,  // country name
    city: string | undefined,  // city name
}

interface Player extends Person {
    state: PlayerState,
    barriers: Barrier[],
    rounds_played: number,
    table: number,  // non-zero when playing
    seat: number,  // non-zero when playing
    toss: number,  // non-zero when draws for seeding finals
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
    state: TableState,
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
    // current_round: number,
    limited: LimitedFormat | undefined,
    state: TournamentState,
    players: Record<string, Player>,
    finals_seeds: string[],
    rounds: Round[],
    sanctions: Record<string, Sanction[]>,
    winner: string,
    extra: {},
}

interface Member extends Person {
    nickname: string | undefined,  // player nickname
    email: string | undefined,  // the user's email
    verified: boolean | undefined,  // whether the email has been verified
    state: string | undefined,  // state/region name
    discord: {} | undefined,
}
