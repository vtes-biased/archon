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

function normalize_string(s: string) {
    var res = unidecode(s).toLowerCase()
    // remove non-letters non-numbers
    res.replace(/[^\p{L}\p{N}\s]/gu, "")
    // remove spurious spaces
    res.replace(/\s{2,}/g, " ");
    return res
}

function score_string(score: Score): string {
    if (score.gw) {
        return `${score.gw}GW${score.vp}`
    }
    else if (score.vp > 1) {
        return `${score.vp}VPs`
    }
    else {
        return `${score.vp}VP`
    }
}

class MemberMap {
    members_by_vekn: Map<string, Member>
    members_by_uid: Map<string, Member>
    members_trie: Map<string, Array<Member>>
    constructor() {
        this.members_by_vekn = new Map()
        this.members_by_uid = new Map()
        this.members_trie = new Map()
    }

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
        for (const member of members) {
            this.members_by_vekn.set(member.vekn, member)
            this.members_by_uid.set(member.uid, member)
            const parts = normalize_string(member.name).split(" ")
            for (const part of parts) {
                for (var i = 1; i < part.length + 1; i++) {
                    const piece = part.slice(0, i)
                    if (!this.members_trie.has(piece)) {
                        this.members_trie.set(piece, [])
                    }
                    this.members_trie.get(piece).push(member)
                }
            }
        }
    }

    complete_name(s: string): Member[] {
        var members_list: Member[] | undefined = undefined
        for (const part of normalize_string(s).toLowerCase().split(" ")) {
            const members = this.members_trie.get(part)
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

class MemberLookup {
    root: HTMLElement
    form: HTMLFormElement
    input_vekn_id: HTMLInputElement
    dropdown_div: HTMLDivElement
    input_name: HTMLInputElement
    dropdown_menu: HTMLUListElement
    button: HTMLButtonElement
    dropdown: bootstrap.Dropdown
    members_map: MemberMap
    member: Member | undefined
    focus: HTMLLIElement | undefined
    constructor(members_map: MemberMap, root: HTMLElement, label: string) {
        this.members_map = members_map
        this.root = root
        this.form = base.create_append(this.root, "form")
        const top_div = base.create_append(this.form, "div", ["row", "g-3"])
        const vekn_div = base.create_append(top_div, "div", ["col-2", "d-flex", "align-items-center"])
        this.input_vekn_id = base.create_append(vekn_div, "input", ["form-control"],
            { type: "text", placeholder: "VEKN ID number", autocomplete: "off", "aria-autocomplete": "off" }
        )
        this.input_vekn_id.spellcheck = false

        this.dropdown_div = base.create_append(top_div, "div", ["col-4", "d-flex", "align-items-center", "dropdown"])
        this.input_name = base.create_append(this.dropdown_div, "input", ["form-control", "dropdown-toggle"],
            { type: "text", placeholder: "Name", autocomplete: "off", "aria-autocomplete": "off" }
        )
        this.input_name.spellcheck = false
        this.dropdown_menu = base.create_append(this.dropdown_div, "ul", ["dropdown-menu"])
        const button_div = base.create_append(top_div, "div", ["col-2", "d-flex", "align-items-center"])
        this.button = base.create_append(button_div, "button", ["btn", "btn-primary", "my-2"], { type: "submit" })
        this.button.innerText = label
        this.button.disabled = true
        this.dropdown = new bootstrap.Dropdown(this.input_name)
        this.dropdown.hide()
        this.input_vekn_id.addEventListener("input", (ev) => this.select_member_by_vekn())
        this.input_name.addEventListener("input", base.debounce((ev) => this.complete_member_name()))
        this.dropdown_div.addEventListener("keydown", (ev) => this.keydown(ev));
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
        this.member = undefined
        this.input_vekn_id.value = ""
        this.input_name.value = ""
        this.button.disabled = true
        this.reset_focus()
    }

    select_member_by_vekn() {
        this.member = this.members_map.members_by_vekn.get(this.input_vekn_id.value)
        if (this.member) {
            this.input_name.value = this.member.name
            this.button.disabled = false
        }
        else {
            this.input_name.value = ""
            this.button.disabled = true
        }
    }

    select_member_name(ev: Event) {
        const button = ev.currentTarget as HTMLButtonElement
        this.member = this.members_map.members_by_uid.get(button.dataset.memberUid)
        if (this.member) {
            this.input_vekn_id.value = this.member.vekn
            this.input_name.value = this.member.name
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
        const members_list = this.members_map.complete_name(this.input_name.value)
        if (!members_list) {
            this.dropdown.hide()
            return
        }
        for (const member of members_list.slice(0, 10)) {
            const li = base.create_append(this.dropdown_menu, "li")
            const button = base.create_append(li, "button", ["dropdown-item"], { type: "button", "data-member-uid": member.uid })
            button.innerText = `${member.name} (${member.city}, ${member.country})`
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

class Registration {
    console: TournamentConsole
    panel: HTMLDivElement
    action_row: HTMLDivElement
    register_element: MemberLookup
    players_table: HTMLTableElement
    players_table_body: HTMLTableSectionElement
    constructor(console: TournamentConsole) {
        this.console = console
        this.panel = console.add_nav("Registration")
        this.action_row = base.create_append(this.panel, "div", ["row", "g-3", "my-4"])
        this.register_element = new MemberLookup(console.members_map, this.panel, "Register")
        this.register_element.form.addEventListener("submit", (ev) => {
            ev.preventDefault()
            this.console.register_player(this.register_element.member)
            this.register_element.reset()
        })
        this.players_table = base.create_append(this.panel, "table", ["table", "my-4"])
        const head = base.create_append(this.players_table, "thead")
        const row = base.create_append(head, "tr")
        for (const label of ["VEKN #", "Name", "State"]) {
            const cel = base.create_append(row, "th", [], { scope: "col" })
            cel.innerText = label
        }
        this.players_table_body = base.create_append(this.players_table, "tbody")
    }

    display() {
        remove_children(this.players_table_body)
        for (const player of Object.values(this.console.tournament.players)) {
            const row = base.create_append(this.players_table_body, "tr")
            const head = base.create_append(row, "th", [], { scope: "row" })
            head.innerText = player.vekn
            const name = base.create_append(row, "td")
            name.innerText = player.name
            const state = base.create_append(row, "td")
            state.innerText = player.state
            const actions = base.create_append(row, "td")
            if (this.console.tournament.state == TournamentState.WAITING) {
                if (player.state == PlayerState.REGISTERED) {
                    const button = base.create_append(actions, "button", ["btn", "btn-success"])
                    button.innerText = "Check In"
                    button.addEventListener("click", (ev) => { this.console.check_in(player.uid) })
                }
                else if (player.state == PlayerState.CHECKED_IN) {
                    const button = base.create_append(actions, "button", ["btn", "btn-warning"])
                    button.innerText = "Drop"
                    button.addEventListener("click", (ev) => { this.console.drop(player.uid) })
                }
            }
        }
        remove_children(this.action_row)
        if (this.console.tournament.state == TournamentState.REGISTRATION) {
            const button = base.create_append(this.action_row, "button", ["col-2", "btn", "btn-success"])
            button.innerText = "Open Check-In"
            button.addEventListener("click", (ev) => { this.console.open_checkin() })
        }
        else if (this.console.tournament.state == TournamentState.WAITING) {
            const button = base.create_append(this.action_row, "button", ["col-2", "btn", "btn-success"])
            button.innerText = `Seat Round ${this.console.tournament.rounds.length + 1}`
            button.addEventListener("click", (ev) => { this.console.start_round() })
        }
    }
}

class RoundTab {
    console: TournamentConsole
    index: number
    panel: HTMLDivElement
    action_row: HTMLDivElement
    constructor(con: TournamentConsole, index: number) {
        this.console = con
        this.index = index
        this.panel = this.console.add_nav(`Round ${this.index}`)
        console.log("adding action row", this.panel)
    }

    display() {
        remove_children(this.panel)
        this.action_row = base.create_append(this.panel, "div", ["row", "g-3", "my-4"])
        const round = this.console.tournament.rounds[this.index - 1]
        var j = 0
        var div = undefined
        for (const table of round.tables) {
            if (j % 2 === 0) {
                div = base.create_append(this.panel, "div", ["row", "g-3", "my-4"])
            }
            this.display_table(div, table, j + 1)
            j++
        }
        if (this.console.tournament.state == TournamentState.PLAYING
            && this.index == this.console.tournament.rounds.length
            && round.tables.every(t => t.state == TableState.FINISHED)
        ) {
            console.log("adding button", this.action_row)
            const button = base.create_append(this.action_row, "button", ["col-2", "btn", "btn-success"])
            button.innerText = "Finish round"
            button.addEventListener("click", (ev) => { this.console.finish_round() })
        } else {
            console.log("some tables are not finished")
        }
    }

    display_table(root: HTMLDivElement, data: Table, table_index: number) {
        const div = base.create_append(root, "div", ["col-md-6"])
        const title_div = base.create_append(div, "div", ["d-inline-flex", "flex-row", "mb-2", "align-items-center"])
        const title = base.create_append(title_div, "h2", ["m-0"])
        title.innerText = `Table ${table_index}`
        const badge = base.create_append(title_div, "span", ["badge", "mx-2"])
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
            const overrideButton = base.create_append(title_div, "button", ["btn", "btn-warning"])
            overrideButton.innerText = "Override"
            overrideButton.addEventListener("click", ev => this.console.override_table(this.index, table_index))
        }
        if (data.override) {
            const override_badge = base.create_append(title_div, "span", ["badge", "mx-2", "text-bg-info"])
            override_badge.innerText = "Overriden"
            // TODO: add comment as tooltip?
        }
        const table = base.create_append(div, "table", ["table"])
        const head = base.create_append(table, "thead")
        const tr = base.create_append(head, "tr")
        for (const label of ["VEKN#", "Name", "Score", ""]) {
            const th = base.create_append(tr, "th", [], { scope: "col" })
            th.innerText = label
        }
        const body = base.create_append(table, "tbody")
        for (const seat of data.seating) {
            const player = this.console.tournament.players[seat.player_uid]
            const row = base.create_append(body, "tr")
            base.create_append(row, "th", [], { scope: "row" }).innerText = player.vekn
            base.create_append(row, "td").innerText = player.name
            base.create_append(row, "td").innerText = score_string(seat.result)
            const actions = base.create_append(row, "td")
            const changeButton = base.create_append(actions, "button", ["btn", "btn-sm", "btn-primary"])
            changeButton.innerHTML = '<i class="bi bi-pencil"></i>'
            changeButton.addEventListener("click", (ev) => {
                this.console.score_modal.show(player, this.index, seat.result.vp)
            })
        }
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
    registration: Registration
    rounds: RoundTab[]
    constructor(el: HTMLDivElement, token: base.Token) {
        this.token = token
        this.members_map = new MemberMap()
        this.score_modal = new ScoreModal(el, this)
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
            const round_tab = new RoundTab(this, i + 1)
            this.rounds.push(round_tab)
        }
        this.tabs.get("Registration").show()
        await this.members_map.init(this.token)
    }

    display() {
        while (this.tournament.rounds.length > this.rounds.length) {
            const round_tab = new RoundTab(this, this.rounds.length + 1)
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

    add_nav(label: string): HTMLDivElement {
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
        this.tabs.set(label, tabTrigger)
        return tab
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

interface Player {
    name: string,
    vekn: string,
    uid: string,
    state: PlayerState,
    barriers: Barrier[],
    rounds_played: number,
    table: number,  // non-zero when playing
    seat: number,  // non-zero when playing
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

interface Member {
    vekn: string,  // VEKN number
    name: string,  // player name
    nickname: string | undefined,  // player nickname
    email: string | undefined,  // the user's email
    verified: boolean | undefined,  // whether the email has been verified
    country: string | undefined,  // country name
    state: string | undefined,  // state/region name
    city: string | undefined,  // city name
    uid: string | undefined,  // UUID assigned by the backend
    discord: {} | undefined,
}
