import * as base from "./base"
import * as bootstrap from 'bootstrap'
import unidecode from 'unidecode'
import * as uuid from 'uuid'

const members_by_vekn = new Map() as Map<string, Member>
const members_by_uid = new Map() as Map<string, Member>
const members_trie = new Map() as Map<string, Array<Member>>
var tournament: Tournament | undefined = undefined

function select_member_by_vekn(ev: Event) {
    const memberVeknId = ev.currentTarget as HTMLInputElement
    const memberName = document.getElementById("memberName") as HTMLInputElement
    const memberUid = document.getElementById("memberUid") as HTMLInputElement
    const registerPlayerButton = document.getElementById("registerPlayerButton") as HTMLInputElement
    if (members_by_vekn.has(memberVeknId.value)) {
        memberName.value = members_by_vekn.get(memberVeknId.value).name
        memberUid.value = members_by_vekn.get(memberVeknId.value).uid
        registerPlayerButton.disabled = false
    }
    else {
        memberName.value = ""
        memberUid.value = ""
        registerPlayerButton.disabled = true
    }
}

function select_member_name(ev: Event) {
    const button = ev.currentTarget as HTMLButtonElement
    const memberVeknId = document.getElementById("memberVeknId") as HTMLInputElement
    const memberName = document.getElementById("memberName") as HTMLInputElement
    const memberUid = document.getElementById("memberUid") as HTMLInputElement
    const registerPlayerButton = document.getElementById("registerPlayerButton") as HTMLInputElement
    if (members_by_uid.has(button.dataset.memberUid)) {
        const member = members_by_uid.get(button.dataset.memberUid)
        memberVeknId.value = member.vekn
        memberName.value = member.name
        memberUid.value = member.uid
        registerPlayerButton.disabled = false
    }
    else {
        memberVeknId.value = ""
        memberName.value = ""
        memberUid.value = ""
        registerPlayerButton.disabled = true
    }
    const ddown = new bootstrap.Dropdown(memberName)
    ddown.hide()
}

function complete_member_name(ev: Event) {
    const memberName = ev.currentTarget as HTMLInputElement
    if (memberName.value.length < 3) { return }
    var members_list: Member[] | undefined = undefined
    for (const part of memberName.value.split(" ")) {
        console.log("part", part)
        console.log(members_trie)
        if (members_trie.has(part)) {
            const members = members_trie.get(part)
            if (members_list) {
                members_list = members_list.filter(m => members.includes(m))
            } else {
                members_list = members
            }
        }
    }
    members_list = members_list.slice(0, 10)
    console.log("completion", members_list)
    const memberCompletionDropdown = document.getElementById("memberCompletionDropdown") as HTMLUListElement
    console.log(memberCompletionDropdown)
    while (memberCompletionDropdown.lastElementChild) {
        memberCompletionDropdown.removeChild(memberCompletionDropdown.lastElementChild)
    }
    for (const member of members_list) {
        const li = document.createElement("li")
        memberCompletionDropdown.append(li)
        const button = document.createElement("button")
        button.classList.add("dropdown-item")
        button.type = "button"
        button.innerText = member.name
        button.dataset.memberUid = member.uid
        button.addEventListener("click", select_member_name)
        li.append(button)
    }
    const ddown = new bootstrap.Dropdown(memberName)
    ddown.show()
}

function display_tournament(tournament: Tournament) {
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
    }
}

async function register_player(ev: Event) {
    // create or update tournament
    ev.preventDefault()
    const registerPlayerForm = ev.currentTarget as HTMLFormElement
    const data = new FormData(registerPlayerForm)
    const event = {
        type: "REGISTER",
        uid: uuid.v4(),
        name: data.get("memberName"),
        vekn: data.get("memberVeknId"),
        player_uid: data.get("uid"),

    }
    // TODO: move to a generic tournament event handler
    // TODO: implement offline mode
    const res = await base.do_fetch(`/api/tournament/${tournament.uid}/event`, {
        method: "post",
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(event)
    })
    if (!res) { return }
    const response = await res.json()
    console.log(response)
    // TODO: use journal to do diff updates
    // window.localStorage.setItem("tournament", JSON.stringify(response))
    tournament = response
    display_tournament(tournament)
}

function setupRegisterPlayer() {
    const memberVeknId = document.getElementById("memberVeknId") as HTMLInputElement
    const memberName = document.getElementById("memberName") as HTMLInputElement
    memberVeknId.addEventListener("input", select_member_by_vekn)
    memberName.addEventListener("input", complete_member_name)
    const registerPlayerForm = document.getElementById("registerPlayerForm") as HTMLFormElement
    registerPlayerForm.addEventListener("submit", (ev) => register_player(ev).then())
}

function load() {
    console.log("loading...")
    const tournamentData = document.getElementById("tournamentData") as HTMLDivElement
    tournament = JSON.parse(tournamentData.dataset.tournament) as Tournament
    console.log("parsing members...")
    const membersData = document.getElementById("membersData") as HTMLDivElement
    const members = JSON.parse(membersData.dataset.members) as Member[]
    // window.localStorage.setItem("members", JSON.stringify(members))
    // fill our maps: members_by_vekn and members_trie
    console.log("filling maps...")
    for (const member of members) {
        members_by_vekn.set(member.vekn, member)
        members_by_uid.set(member.uid, member)
        var name = unidecode(member.name).toLowerCase()
        // remove non-letters non-numbers
        name = name.replace(/[^\p{L}\p{N}\s]/gu, "")
        // remove spurious spaces
        name = name.replace(/\s{2,}/g, " ");
        const parts = name.split(" ")
        for (const part of parts) {
            for (var i = 1; i < part.length + 1; i++) {
                const piece = part.slice(0, i)
                if (!members_trie.has(piece)) {
                    members_trie.set(piece, [])
                }
                members_trie.get(piece).push(member)
            }
        }
    }
    setupRegisterPlayer()
    display_tournament(tournament)
}

window.addEventListener("load", (ev) => { base.load().then() })
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
    organizer: string,
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
    current_round: number,
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
