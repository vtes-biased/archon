import * as base from "./base"
import * as events from "./events"
import * as bootstrap from 'bootstrap'
import unidecode from 'unidecode'
import * as uuid from 'uuid'


var tournament: Tournament | undefined = undefined

function display_tournament(token: base.Token, tournament: Tournament) {
    const playersTableBody = document.getElementById("playersTableBody") as HTMLTableSectionElement
    while (playersTableBody.lastElementChild) {
        playersTableBody.removeChild(playersTableBody.lastElementChild)
    }
    for (const player of Object.values(tournament.players)) {
        const row = document.createElement("tr")
        playersTableBody.append(row)
        const head = document.createElement("th")
        head.scope = "row"
        head.innerText = player.vekn
        row.append(head)
        const name = document.createElement("td")
        name.innerText = player.name
        row.append(name)
        const state = document.createElement("td")
        state.innerText = player.state
        row.append(state)
        const actions = document.createElement("td")
        row.append(actions)

        if (tournament.state == TournamentState.WAITING) {
            if (player.state == PlayerState.REGISTERED) {
                const button = document.createElement("button")
                button.classList.add("btn", "btn-success")
                button.innerText = "Check In"
                button.addEventListener("click", (ev) => { check_in(token, player.uid).then() })
                actions.append(button)
            }
            else if (player.state == PlayerState.CHECKED_IN) {
                const button = document.createElement("button")
                button.classList.add("btn", "btn-warning")
                button.innerText = "Drop"
                button.addEventListener("click", (ev) => { drop(token, player.uid).then() })
                actions.append(button)
            }
        }
    }
    const actionRow = document.getElementById("actionRow") as HTMLDivElement
    while (actionRow.lastElementChild) {
        actionRow.removeChild(actionRow.lastElementChild)
    }
    if (tournament.state == TournamentState.REGISTRATION) {
        const button = document.createElement("button")
        button.classList.add("col-2", "btn", "btn-success")
        button.innerText = "Open Check-In"
        button.addEventListener("click", (ev) => { open_checkin(token).then() })
        actionRow.append(button)
    }
    if (tournament.state == TournamentState.WAITING) {
        const button = document.createElement("button")
        button.classList.add("col-2", "btn", "btn-success")
        button.innerText = `Seat Round ${tournament.rounds.length + 1}`
        button.addEventListener("click", (ev) => { start_round(token).then() })
        actionRow.append(button)
    }
    const navTabContent = document.getElementById("navTabContent") as HTMLDivElement
    const navRegistrations = document.getElementById("navRegistrations") as HTMLDivElement
    while (navTabContent.lastElementChild != navRegistrations) {
        navTabContent.removeChild(navTabContent.lastElementChild)
    }
    const navTab = document.getElementById("navTab") as HTMLDivElement
    const navRegistrationsTab = document.getElementById("navRegistrationsTab") as HTMLButtonElement
    while (navTab.lastElementChild != navRegistrationsTab) {
        navTab.removeChild(navTab.lastElementChild)
    }
    var i = 0
    for (const round_ of tournament.rounds) {
        i++
        const roundTab = document.createElement("div")
        roundTab.classList.add("tab-pane", "fade")
        roundTab.role = "tabpanel"
        roundTab.ariaLabel = `Round ${i}`
        roundTab.id = `round${i}Tab`
        navTabContent.append(roundTab)
        const roundButton = document.createElement("button")
        roundButton.classList.add("nav-link")
        roundButton.id = `navRound${i}Tab`
        roundButton.type = "button"
        roundButton.role = "tab"
        roundButton.ariaSelected = "false"
        roundButton.innerText = `Round ${i}`
        roundButton.dataset.bsToggle = "tab"
        roundButton.dataset.bsTarget = `#round${i}Tab`
        navTab.append(roundButton)
        var j = 0
        var div = undefined
        for (const table of round_.tables) {
            if (j % 2 === 0) {
                div = document.createElement("div")
                div.classList.add("row", "g-3", "my-4")
                roundTab.append(div)
            }
            display_table(token, div, table, i, j + 1)
            j++
        }
    }
    var triggerTabList = [].slice.call(navTab.querySelectorAll('button'))
    triggerTabList.forEach(function (triggerEl: HTMLElement) {
        var tabTrigger = new bootstrap.Tab(triggerEl)
        triggerEl.addEventListener('click', function (event) {
            event.preventDefault()
            tabTrigger.show()
        })
    })
}

function display_table(token: base.Token, el: HTMLElement, data: Table, round: number, table_number: number) {
    console.log("display table")
    const div = document.createElement("div")
    div.classList.add("col-md-6")
    el.append(div)
    const title_div = document.createElement("div")
    title_div.classList.add("d-inline-flex", "flex-row", "mb-2", "align-items-center")
    div.append(title_div)
    const title = document.createElement("h2")
    title.classList.add("m-0")
    title.innerText = `Table ${table_number}`
    title_div.append(title)
    const badge = document.createElement("span")
    badge.classList.add("badge", "mx-2")
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
    title_div.append(badge)
    if (data.state != TableState.FINISHED) {
        const overrideButton = document.createElement("button")
        overrideButton.classList.add("btn", "btn-warning")
        overrideButton.innerText = "Override"
        overrideButton.addEventListener("click", ev => override_table(ev, token, round, table_number).then())
        title_div.append(overrideButton)
    }
    if (data.override) {
        const override_badge = document.createElement("span")
        override_badge.classList.add("badge", "mx-2", "text-bg-info")
        override_badge.innerText = "Overriden"
        title_div.append(override_badge)
        // TODO: add comment as tooltip?
    }
    const table = document.createElement("table")
    table.classList.add("table")
    div.append(table)
    const head = document.createElement("thead")
    table.append(head)
    const tr = document.createElement("tr")
    head.append(tr)
    const headVEKN = document.createElement("th")
    headVEKN.scope = "col"
    headVEKN.innerText = "VEKN #"
    tr.append(headVEKN)
    const headName = document.createElement("th")
    headName.scope = "col"
    headName.innerText = "Name"
    tr.append(headName)
    const headScore = document.createElement("th")
    headScore.scope = "col"
    headScore.innerText = "Score"
    tr.append(headScore)
    const headActions = document.createElement("th")
    headActions.scope = "col"
    tr.append(headActions)
    const body = document.createElement("tbody")
    table.append(body)

    for (const seat of data.seating) {
        const player = tournament.players[seat.player_uid]
        const row = document.createElement("tr")
        body.append(row)
        const rowHead = document.createElement("th")
        rowHead.scope = "row"
        rowHead.innerText = player.vekn
        row.append(rowHead)
        const name = document.createElement("td")
        name.innerText = player.name
        row.append(name)
        const score = document.createElement("td")
        score.innerText = display_score(seat.result)
        row.append(score)
        const actions = document.createElement("td")
        row.append(actions)
        const changeButton = document.createElement("button")
        changeButton.classList.add("btn", "btn-sm", "btn-primary")
        changeButton.innerHTML = '<i class="bi bi-pencil"></i>'
        changeButton.addEventListener("click", ev => show_score_modale(ev, player, round, seat.result.vp))
        actions.append(changeButton)
    }
}

function show_score_modale(ev: Event, player: Player, round: number, vp: number) {
    console.log("show_score_modale")
    const scoreModal = bootstrap.Modal.getInstance("#scoreModal")
    const scoreModalLabel = document.getElementById("scoreModalLabel") as HTMLHeadingElement
    const scoreFormPlayerUid = document.getElementById("scoreFormPlayerUid") as HTMLInputElement
    const scoreFormRound = document.getElementById("scoreFormRound") as HTMLInputElement
    const scoreFormVP = document.getElementById("scoreFormVP") as HTMLInputElement
    scoreModalLabel.innerText = `${player.name} result: round ${round}`
    scoreFormPlayerUid.value = player.uid
    scoreFormRound.value = round.toString()
    scoreFormVP.value = vp.toString()
    scoreModal.show()
}

async function override_table(ev: Event, token: base.Token, round: number, table_number: number) {
    console.log("override_table")
    const event: events.Override = {
        type: events.EventType.OVERRIDE,
        uid: uuid.v4(),
        round: round,
        table: table_number,
        judge_uid: "",  // TODO: yeah we need proper auth
        comment: "",  // TODO: we'll need another modal I guess
    }
    await handle_tournament_event(token, event)
}

function display_score(score: Score) {
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

async function register_player(ev: Event, token: base.Token, lookup: MemberLookup) {
    console.log("register_player")
    ev.preventDefault()
    const registerPlayerForm = ev.target as HTMLFormElement
    const event: events.Register = {
        type: events.EventType.REGISTER,
        uid: uuid.v4(),
        name: lookup.member.name,
        vekn: lookup.member.vekn,
        player_uid: lookup.member.uid,

    }
    await handle_tournament_event(token, event)
    lookup.reset()
}

async function open_checkin(token: base.Token) {
    console.log("open_checkin")
    const event: events.OpenCheckin = {
        type: events.EventType.OPEN_CHECKIN,
        uid: uuid.v4(),
    }
    await handle_tournament_event(token, event)
}

async function check_in(token: base.Token, player_uid: string) {
    console.log("check_in", player_uid)
    const event: events.CheckIn = {
        type: events.EventType.CHECK_IN,
        uid: uuid.v4(),
        player_uid: player_uid,
    }
    await handle_tournament_event(token, event)
}

async function drop(token: base.Token, player_uid: string) {
    console.log("drop", player_uid)
    const event: events.Drop = {
        type: events.EventType.DROP,
        uid: uuid.v4(),
        player_uid: player_uid,
    }
    await handle_tournament_event(token, event)
}

function shuffle_array(array: Array<any>) {
    for (let i = array.length - 1; i >= 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

// function seat_round() {
//     const contenders = Object.values(tournament.players).filter(p => p.state === PlayerState.CHECKED_IN)
//     shuffleArray(contenders)
//     const seat_in_fives = contenders.length - 4 * (5 - (contenders.length % 5 | 5))
//     var seated = 0
//     const res: Round = { tables: [] }
//     while (seated < contenders.length) {
//         const seats = seated < seat_in_fives ? 5 : 4
//         const table: Table = { seating: [], override: undefined }
//         for (const p of contenders.slice(seated, seated + seats)) {
//             table.seating.push({ player_uid: p.uid, result: { gw: 0, vp: 0, tp: 0 } })
//         }
//         res.tables.push(table)
//         seated += seats
//     }
//     return res
// }

function default_seating() {
    const contenders = Object.values(tournament.players).filter(p => p.state === PlayerState.CHECKED_IN)
    shuffle_array(contenders)
    const seat_in_fives = contenders.length - 4 * (5 - (contenders.length % 5 | 5))
    var seated = 0
    const res: string[][] = []
    while (seated < contenders.length) {
        const seats = seated < seat_in_fives ? 5 : 4
        res.push(contenders.slice(seated, seated + seats).map(p => p.uid))
        seated += seats
    }
    return res
}

async function start_round(token: base.Token) {
    // TODO: handle seating optimisation
    // const next_round = seat_round()
    // const seating: string[][] = []
    // for (const table of next_round.tables) {
    //     const res: string[] = []
    //     for(const seat of table.seating){
    //         res.push(seat.player_uid)
    //     }
    //     seating.push(res)
    // }
    console.log("start_round")
    const event: events.RoundStart = {
        type: events.EventType.ROUND_START,
        uid: uuid.v4(),
        seating: default_seating()
    }
    await handle_tournament_event(token, event)
}

async function set_result(ev: SubmitEvent, token: base.Token) {
    ev.preventDefault()
    console.log("set_result", ev)
    const scoreModal = bootstrap.Modal.getInstance("#scoreModal")
    const scoreForm = ev.target as HTMLFormElement
    const data = new FormData(scoreForm)
    const round = parseInt(data.get("round").toString())
    const event: events.SetResult = {
        type: events.EventType.SET_RESULT,
        uid: uuid.v4(),
        player_uid: data.get("player_uid").toString(),
        round: round,
        result: { vp: parseFloat(data.get("vp").toString()), gw: 0, tp: 0 },
        judge_uid: ""  // TODO: set the correct UID here
    }
    await handle_tournament_event(token, event)
    const triggerEl = document.getElementById(`navRound${round}Tab`)
    if (triggerEl) {
        bootstrap.Tab.getInstance(triggerEl).show()
    }
    else {
        const navRegistrationsTab = document.getElementById("navRegistrationsTab")
        bootstrap.Tab.getInstance(navRegistrationsTab).show()
    }
    console.log("hide modale")
    scoreModal.hide()
}

async function handle_tournament_event(token: base.Token, ev: events.TournamentEvent) {
    console.log("handle event", ev)
    // TODO: implement offline mode
    const res = await base.do_fetch(`/api/tournaments/${tournament.uid}/event`, {
        method: "post",
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'Authorization': `Bearer ${token.access_token}` },
        body: JSON.stringify(ev)
    })
    if (!res) { return }
    const response = await res.json()
    console.log(response)
    // window.localStorage.setItem("tournament", JSON.stringify(response))
    tournament = response
    display_tournament(token, tournament)
}

function setupSubmitScore(token: base.Token) {
    console.log("setupSubmitScore")
    new bootstrap.Modal("#scoreModal")
    const scoreForm = document.getElementById("scoreForm") as HTMLFormElement
    scoreForm.addEventListener("submit", ev => set_result(ev, token).then())
}

function normalize_string(s: string) {
    var res = unidecode(s).toLowerCase()
    // remove non-letters non-numbers
    res.replace(/[^\p{L}\p{N}\s]/gu, "")
    // remove spurious spaces
    res.replace(/\s{2,}/g, " ");
    return res
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
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'Authorization': `Bearer ${token.access_token}` },
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


async function load() {
    console.log("load")
    const tournamentData = document.getElementById("tournamentData") as HTMLDivElement
    tournament = JSON.parse(tournamentData.dataset.tournament) as Tournament
    const token = await base.fetchToken()
    const members_map = new MemberMap()
    await members_map.init(token)
    const navRegistrations = document.getElementById("navRegistrations") as HTMLDivElement
    const registration_lookup = new MemberLookup(members_map, navRegistrations, "Register")
    registration_lookup.form.addEventListener("submit", ev => register_player(ev, token, registration_lookup))
    setupSubmitScore(token)
    display_tournament(token, tournament)
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
