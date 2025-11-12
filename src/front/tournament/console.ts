import * as bootstrap from 'bootstrap'
import * as d from "../d"
import * as base from "../base"
import * as events from "../events"
import * as member from "../member"
import * as seating from "../seating"
import { InfoTab } from "../tournament/display/info_tab"
import { Registration } from "../tournament/registration"
import { PlayerSelectModal } from "../modals/player_select"
import { SanctionPlayerModal } from "../modals/sanction_player"
import { SeedFinalsModal } from "../modals/seed_finals"
import { ScoreModal } from "../modals/score"
import { RoundTab } from "../tournament/round_tab"
import { Engine } from "../tournament/engine"
import { OverrideModal } from "../modals/override"

class TournamentConsole {
    root: HTMLDivElement
    token: base.Token
    members_map: member.MembersDB
    engine: Engine
    confirmation: base.ConfirmationModal
    score_modal: ScoreModal
    player_select: PlayerSelectModal
    add_member_modal: member.AddMemberModal
    sanction_player_modal: SanctionPlayerModal
    seed_finals_modal: SeedFinalsModal
    select_modal: PlayerSelectModal
    override_modal: OverrideModal
    message_div: HTMLDivElement
    nav: HTMLElement
    tabs_div: HTMLDivElement
    tabs: Map<string, bootstrap.Tab>
    info: InfoTab
    registration: Registration
    rounds: RoundTab[]

    constructor(el: HTMLDivElement, token: base.Token) {
        this.root = el
        this.token = token
        this.members_map = new member.MembersDB(token, el)
        this.engine = new Engine(token, (tournament, round_change) => this.display(round_change))
        this.confirmation = new base.ConfirmationModal(el)
        this.score_modal = new ScoreModal(el, this.engine)
        this.player_select = new PlayerSelectModal(el)
        this.add_member_modal = new member.AddMemberModal(el, this.members_map, (m) => this.engine.register_player(m))
        this.sanction_player_modal = new SanctionPlayerModal(el, this.engine, this.members_map)
        this.seed_finals_modal = new SeedFinalsModal(el, this.engine)
        this.select_modal = new PlayerSelectModal(el)
        this.override_modal = new OverrideModal(el, this.engine)
        this.message_div = base.create_append(el, "div", ["alert"], { role: "status" })
        this.nav = base.create_append(el, "nav", ["nav", "nav-tabs"], { role: "tablist" })
        this.tabs_div = base.create_append(el, "div", ["tab-content"])
    }

    get tournament() {
        return this.engine.tournament
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
        await this.engine.init(tournament_uid)
        this.tabs = new Map()
        base.remove_children(this.message_div)
        base.remove_children(this.nav)
        base.remove_children(this.tabs_div)
        const display_tab = this.add_nav("Info")
        this.info = new InfoTab(display_tab, this)
        this.registration = new Registration(this.engine, this, this.add_nav("Registration"))
        this.rounds = []
        await this.members_map.init()
        { // init countries in components using them
            const res = await base.do_fetch("/api/vekn/country", {})
            var countries: d.Country[] = []
            if (res) {
                countries = await res.json() as d.Country[]
            }
            await this.add_member_modal.init(this.token, countries)
            await this.info.init(this.engine, countries, this.members_map)
        }
        await this.display(true)
    }
    open_relevant_tab() {
        if (this.tournament.state == d.TournamentState.FINALS) {
            this.tabs.get(`Finals`)?.show()
        } else if (this.tournament.state == d.TournamentState.PLAYING) {
            this.tabs.get(`Round ${this.rounds.length}`)?.show()
        } else if (
            this.tournament.state == d.TournamentState.WAITING ||
            this.tournament.state == d.TournamentState.REGISTRATION
        ) {
            this.tabs.get("Registration")?.show()
        } else if (this.tournament.state != d.TournamentState.FINISHED && this.tournament.rounds.length > 0) {
            this.tabs.get("Registration")?.show()
        } else {
            this.tabs.get("Info")?.show()
        }
    }
    display(round_change: boolean = false) {
        this.info.display()
        this.registration.display()
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
            const round_tab = new RoundTab(this.engine, this, this.rounds.length + 1, finals)
            if (finals) {
                round_tab.init(this.add_nav(`Finals`, (ev) => round_tab.setup_player_lookup_modal()))
            } else {
                round_tab.init(this.add_nav(`Round ${this.rounds.length + 1}`, (ev) => round_tab.setup_player_lookup_modal()))
            }
            this.rounds.push(round_tab)
        }
        while (this.tournament.rounds.length < this.rounds.length) {
            const round = this.rounds.pop()
            if (!round) { break }
            round.panel.remove()
            const tab = this.tabs.get(`Round ${round.index}`)
            tab?.dispose()
            this.tabs.delete(`Round ${round.index}`)
            this.nav.lastElementChild?.remove()
        }
        for (const round of this.rounds) {
            round.display()
        }
        if (round_change) {
            this.open_relevant_tab()
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
            const tables: string[][] = []
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
                if (sanction.tournament?.uid && sanction.tournament?.uid != this.engine.tournament.uid) {
                    return true
                }
                if (sanction.level == events.SanctionLevel.BAN) {
                    return true
                }
            }
        }
        const local_sanctions = this.engine.tournament.sanctions[player_uid]
        if (local_sanctions) {
            for (const sanction of local_sanctions) {
                if (sanction.level != events.SanctionLevel.CAUTION) {
                    return true
                }
            }
        }
        return false
    }
}

async function load() {
    const consoleDiv = document.getElementById("consoleDiv") as HTMLDivElement
    const token = await base.fetchToken()
    if (!token) {
        window.location.href = "/login"
        return
    }
    const tournament_console = new TournamentConsole(consoleDiv, token)
    const tournament_uid = consoleDiv.dataset.tournamentUid
    if (!tournament_uid) {
        window.location.href = "/tournaments"
        return
    }
    await tournament_console.init(tournament_uid)
}

window.addEventListener("load", (ev) => { load() })
