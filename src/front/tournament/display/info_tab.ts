import * as bootstrap from "bootstrap"
import * as base from "../../base"
import * as d from "../../d"
import * as member from "../../member"
import { Base64 } from 'js-base64'
import { stringify } from 'yaml'
import { Engine } from "../engine"
import { BaseTournamentDisplay } from "./base"
import { CreateTournament } from "./create"

export interface InfoTabContainer {
    confirmation: base.ConfirmationModal
}

export class InfoTab extends CreateTournament {
    engine: Engine
    container: InfoTabContainer
    constructor(root: HTMLDivElement, container: InfoTabContainer) {
        super(root)
        this.container = container
    }
    // Only expose the new signature - hide parent init completely
    // @ts-expect-error: Intentionally overriding parent init with different signature
    async init(engine: Engine, countries: d.Country[], members_map: member.MembersDB): Promise<void> {
        // bypass super init to avoid unnecessary queries (members, countries)
        await BaseTournamentDisplay.prototype.init.call(this, engine.token)
        this.engine = engine
        this.countries = new Map(countries.map(c => [c.country, c]))
        this.members_map = members_map
        if (!this.engine.tournament) {
            console.error("No tournament - cannot init info tab")
            window.location.href = "/tournaments"
            return
        }
        { // fetch user
            const res = await base.do_fetch_with_token(`/api/vekn/members/${this.user_id}`, this.token, {})
            if (res) {
                this.user = await res.json() as d.Person
            } else {
                console.error("No user - cannot init info tab")
                window.location.href = "/tournaments/" + this.engine.tournament.uid
                return
            }
            if (!member.can_admin_tournament(this.user, this.engine.tournament)) {
                window.location.href = "/tournaments/" + this.engine.tournament.uid
                return
            }
        }
        { // fetch regular leagues only (tournaments can't be in meta-leagues)
            const res = await base.do_fetch_with_token(
                "/api/leagues/full?league_type=League",
                this.token,
                {}
            )
            if (res) {
                this.leagues = await res.json() as d.LeagueMinimal[]
            } else {
                this.leagues = []
            }
        }
    }
    display() {
        this.cleanup()
        if (!this.engine.tournament) {
            console.error("No tournament - cannot display info tab")
            return
        }
        this.judges = this.engine.tournament.judges ?? []
        this.display_buttons()
        this.display_header(this.engine.tournament)
        this.display_venue(this.engine.tournament)
        this.display_judges(this.engine.tournament)
        this.display_description(this.engine.tournament)
    }
    display_edit() {
        this.cleanup()
        if (!this.engine.tournament) {
            console.error("No tournament - cannot display info tab")
            return
        }
        this.judges = this.engine.tournament.judges ?? []
        super.display_form()
        this.fill_form(this.engine.tournament)
        this.form.addEventListener("submit", (ev) => this.update_tournament(ev))
        this.cancel_button.addEventListener("click", (ev) => this.display())
        this.update_leagues_options()
    }
    fill_form(tournament: d.Tournament) {
        if (tournament?.name && tournament.name.length > 0) {
            this.name.value = tournament.name
        }
        this.format.value = tournament.format
        this.rank.value = tournament.rank ?? ""
        if (this.format.value != d.TournamentFormat.Standard) {
            this.rank.value = d.TournamentRank.BASIC
            this.rank.disabled = true
        }
        this.proxies.checked = tournament.proxies ?? false
        if (this.rank.value != d.TournamentRank.BASIC || tournament?.online) {
            this.proxies.checked = false
            this.proxies.disabled = true
        }
        this.multideck.checked = tournament.multideck ?? false
        if (this.rank.value != d.TournamentRank.BASIC) {
            this.multideck.checked = false
            this.multideck.disabled = true
        }
        this.decklist_required.checked = tournament.decklist_required ?? false
        if (this.multideck.checked) {
            this.decklist_required.checked = false
            this.decklist_required.disabled = true
        }
        this.online.checked = tournament.online ?? false
        this.country.value = tournament.country || ""
        if (tournament?.online) {
            this.country.selectedIndex = 0
            this.country.disabled = true
            this.country.required = false
        }
        this.venue.value = tournament.venue || ""
        if (tournament?.venue && tournament.venue?.length > 0) {
            this.venue.value = tournament.venue
        } else if (!tournament?.online && !tournament?.country) {
            this.venue.disabled = true
        }
        this.venue_url.value = tournament.venue_url || ""
        if (this.venue.disabled) {
            this.venue_url.value = ""
            this.venue_url.disabled = true
        }
        this.address.value = tournament.address || ""
        this.map_url.value = tournament.map_url || ""
        if (this.venue.disabled || tournament?.online) {
            this.address.disabled = true
            this.address.value = ""
            this.map_url.disabled = true
            this.map_url.value = ""
        }
        this.start.value = tournament.start || ""
        this.finish.value = tournament.finish || ""
        this.timezone.value = tournament.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone
        this.description.value = tournament.description || ""
        this.judges = tournament.judges ?? []
        this.update_leagues_options()
        this.league.value = tournament.league?.uid || ""
        this.change_value()
    }
    display_buttons() {
        const buttons_div = base.create_append(this.root, "div", ["d-sm-flex", "mt-4", "mb-2"])
        const edit_button = base.create_append(buttons_div, "button", ["btn", "btn-primary", "me-2", "mb-2"])
        edit_button.innerHTML = '<i class="bi bi-pencil"></i> Edit'
        edit_button.addEventListener("click", (ev) => this.display_edit())
        if (this.user.roles?.includes(d.MemberRole.ADMIN)) {
            const download_button = base.create_append(buttons_div, "button",
                ["btn", "btn-secondary", "text-nowrap", "me-2", "mb-2"],
                { role: "button" }
            )
            download_button.innerHTML = '<i class="bi bi-download"></i> Download'
            download_button.addEventListener("click", async (ev) => await this.download_info())
            const delete_button = base.create_append(buttons_div, "a",
                ["btn", "btn-danger", "text-nowrap", "me-2", "mb-2"],
                { role: "button" }
            )
            delete_button.innerHTML = '<i class="bi bi-trash"></i> Delete'
            delete_button.addEventListener("click", (ev) => this.container.confirmation.show(
                "This will permanently and officially delete this tournament data<br>" +
                "<em>Only do this if this tournament is invalid or has not taken place</em>",
                () => this.engine.delete_tournament()
            ))
        }
        {
            // TODO: Remove when removing vekn.net
            const temp_div = base.create_append(this.root, "div", ["d-sm-flex", "mt-4", "mb-2", "align-items-center"])
            if (!this.engine.tournament.extra["vekn_id"]) {
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
                this.tooltips.add(set_vekn_span, "Set event id# if it exists on vekn.net already")
                set_vekn.addEventListener("click", (ev) => this.engine.set_vekn(vekn_id.value))
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
                this.tooltips.add(sync_vekn_span, "Create event on vekn.net if it does not exists yet")
                sync_vekn.addEventListener("click", (ev) => {
                    this.engine.vekn_sync(parseInt(rounds.selectedOptions[0].value))
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
            } else if (this.engine.tournament.state == d.TournamentState.FINISHED) {
                if (this.engine.tournament.extra["vekn_submitted"]) {
                    const eid = this.engine.tournament.extra["vekn_id"]
                    base.create_append(temp_div, "p").innerHTML = (
                        "Archon submitted to VEKN: " +
                        `<a href="https://www.vekn.net/event-calendar/event/${eid}">Event #${eid}</a>`
                    )
                } else {
                    const sync_vekn = base.create_append(temp_div, "button",
                        ["me-2", "mb-2", "text-nowrap", "btn", "btn-secondary"]
                    )
                    sync_vekn.innerText = "Send to VEKN"
                    this.tooltips.add(sync_vekn, "Send Archon data to vekn.net")
                    sync_vekn.addEventListener("click", (ev) => this.engine.vekn_sync())
                }
            }
        }
    }
    async download_info() {
        const res = await base.do_fetch_with_token(
            `/api/tournaments/${this.engine.tournament?.uid}/info`,
            this.token,
            { method: "get" }
        )
        if (!res) { return }
        const tournament_info_data: d.TournamentInfo = await res.json()
        const download_link = base.create_element("a", [], {
            href: "data:application/yaml;charset=utf-8;base64," + Base64.encode(
                stringify(tournament_info_data)
            ),
            download: `${this.engine.tournament.name}.txt`,
            role: "button"
        })
        download_link.click()
    }
    async update_tournament(ev: Event) {
        ev.preventDefault()
        this.form.classList.add('was-validated')
        if (!this.form.checkValidity()) {
            ev.stopPropagation()
            return
        }
        const tournament_data = this.get_tournament_data()
        this.engine.update_config(tournament_data)
    }
}
