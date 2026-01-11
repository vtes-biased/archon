import * as base from "../base"
import * as d from "../d"
import * as events from "../events"
import * as bootstrap from 'bootstrap'
import { v4 as uuidv4 } from "uuid"
import { DeckSubmit } from "./deck"
import { Engine } from "../tournament/engine"
import { SanctionForm, render_sanctions_list } from "./sanction"
import * as member from "../member"


export class SanctionPlayerModal extends base.Modal {
    // Tabs
    nav: HTMLElement
    tabs_div: HTMLDivElement
    sanctions_tab: HTMLDivElement
    decks_tab: HTMLDivElement
    // Sanctions
    sanctions_list: HTMLDivElement
    other_sanctions_section: HTMLDivElement
    other_sanctions_list: HTMLDivElement
    sanction_form: SanctionForm
    // Deck
    deck_submit: DeckSubmit
    // State
    engine: Engine
    members_map: member.MembersDB
    current_member: d.Person | null
    round: number | undefined
    seat: d.TableSeat | undefined

    constructor(el: HTMLElement, engine: Engine, members_map: member.MembersDB) {
        super(el)
        this.engine = engine
        this.members_map = members_map
        this.current_member = null
        this.modal_title.innerText = "Player Info"

        // Tabs navigation
        this.nav = base.create_append(this.modal_body, "nav", ["nav", "nav-tabs", "w-100", "mb-2"], { role: "tablist" })
        this.tabs_div = base.create_append(this.modal_body, "div", ["tab-content", "w-100"])

        // Sanctions tab
        const sanctions_button = base.create_append(this.nav, "button", ["nav-link"], {
            id: `nav-modal-sanctions`,
            "data-bs-toggle": "tab",
            "data-bs-target": `#tab-modal-sanctions`,
            type: "button",
            role: "tab",
        })
        sanctions_button.innerText = "Sanctions"
        this.sanctions_tab = base.create_append(this.tabs_div, "div", ["tab-pane", "fade"], {
            id: `tab-modal-sanctions`,
            role: "tabpanel",
            "aria-labelledby": `nav-modal-sanctions`
        })
        const sanctions_tab_trigger = new bootstrap.Tab(sanctions_button)
        sanctions_button.addEventListener('click', (ev) => { ev.preventDefault(); sanctions_tab_trigger.show() })

        // Current tournament sanctions
        const current_header = base.create_append(this.sanctions_tab, "h6", ["mb-2", "text-muted"])
        current_header.innerText = "This tournament"
        this.sanctions_list = base.create_append(this.sanctions_tab, "div", ["mb-3"])

        // Add sanction form
        const form_header = base.create_append(this.sanctions_tab, "h6", ["mb-2", "text-muted", "border-top", "pt-2"])
        form_header.innerText = "Add sanction"
        this.sanction_form = new SanctionForm(this.sanctions_tab, "Add")
        this.sanction_form.form.addEventListener("submit", (ev) => this.submit_sanction(ev))

        // Other tournaments sanctions (collapsible)
        this.other_sanctions_section = base.create_append(this.sanctions_tab, "div", ["mt-3", "border-top", "pt-2"])
        const collapse_header = base.create_append(this.other_sanctions_section, "div", ["d-flex", "align-items-center"])
        const toggle_btn = base.create_append(collapse_header, "button",
            ["btn", "btn-sm", "btn-outline-secondary", "me-2"], { type: "button" }
        )
        toggle_btn.innerHTML = '<i class="bi bi-chevron-down"></i>'
        const other_header = base.create_append(collapse_header, "h6", ["mb-0", "text-muted"])
        other_header.innerText = "Previous sanctions"
        const collapse_div = base.create_append(this.other_sanctions_section, "div", ["collapse"])
        this.other_sanctions_list = base.create_append(collapse_div, "div", ["mt-2"])
        const other_collapse = new bootstrap.Collapse(collapse_div, { toggle: false })
        toggle_btn.addEventListener("click", () => other_collapse.toggle())

        // Decks tab
        const decks_button = base.create_append(this.nav, "button", ["nav-link"], {
            id: `nav-modal-decks`,
            "data-bs-toggle": "tab",
            "data-bs-target": `#tab-modal-decks`,
            type: "button",
            role: "tab",
        })
        decks_button.innerText = "Deck list"
        this.decks_tab = base.create_append(this.tabs_div, "div", ["tab-pane", "fade"], {
            id: `tab-modal-decks`,
            role: "tabpanel",
            "aria-labelledby": `nav-modal-decks`
        })
        const decks_tab_trigger = new bootstrap.Tab(decks_button)
        decks_button.addEventListener('click', (ev) => { ev.preventDefault(); decks_tab_trigger.show() })

        // Show sanctions tab by default
        sanctions_tab_trigger.show()
        this.deck_submit = new DeckSubmit(this.decks_tab, (a, b, c) => this.submit_deck(a, b, c), this.modal_div)
    }

    async show(member_uid: string, round: number | undefined, seat: d.TableSeat | undefined) {
        const m = await this.members_map.get_by_uid(member_uid) ?? null
        if (!m) return
        if (!this.engine.tournament) return
        this.current_member = m
        this.round = round
        this.seat = seat
        this.modal_title.innerText = m.name

        // Separate current tournament sanctions from others
        const current_sanctions: d.Sanction[] = this.engine.tournament.sanctions[member_uid] ?? []
        const other_sanctions: d.Sanction[] = (m.sanctions ?? []).filter(
            s => s.tournament?.uid !== this.engine.tournament?.uid
        )

        // Render current tournament sanctions (removable)
        render_sanctions_list(this.sanctions_list, current_sanctions, (uid) => this.remove_sanction(uid))

        // Render other tournaments sanctions (not removable)
        if (other_sanctions.length > 0) {
            this.other_sanctions_section.classList.remove("d-none")
            render_sanctions_list(this.other_sanctions_list, other_sanctions)
        } else {
            this.other_sanctions_section.classList.add("d-none")
        }

        // Reset form
        this.sanction_form.reset()

        // Init deck tab
        this.deck_submit.init(m.uid, this.engine.tournament, this.round)

        this.modal.show()
    }

    async submit_deck(player_uid: string, deck: string, round: number | undefined) {
        await this.engine.set_deck(player_uid, deck, round)
        if (this.current_member && this.engine.tournament) {
            this.deck_submit.init(this.current_member.uid, this.engine.tournament, this.round)
        }
    }

    async submit_sanction(ev: SubmitEvent) {
        ev.preventDefault()
        if (!this.current_member) return
        const { level, category, comment } = this.sanction_form.get_values()
        const sanction_uid: string = uuidv4()
        const tev = {
            uid: uuidv4(),
            type: events.EventType.SANCTION,
            sanction_uid: sanction_uid,
            player_uid: this.current_member.uid,
            level: level,
            category: category,
            comment: comment,
        } as events.Sanction
        const success = await this.engine.handle_tournament_event(tev)
        if (!success) return
        this.sanction_form.reset()
        // Re-render the list
        const current_sanctions: d.Sanction[] = this.engine.tournament?.sanctions[this.current_member.uid] ?? []
        render_sanctions_list(this.sanctions_list, current_sanctions, (uid) => this.remove_sanction(uid))
    }

    async remove_sanction(sanction_uid: string) {
        if (!this.current_member) return
        const tev = {
            uid: uuidv4(),
            type: events.EventType.UNSANCTION,
            sanction_uid: sanction_uid,
            player_uid: this.current_member.uid,
        } as events.Unsanction
        const success = await this.engine.handle_tournament_event(tev)
        if (!success) return
        // Re-render the list
        const current_sanctions: d.Sanction[] = this.engine.tournament?.sanctions[this.current_member.uid] ?? []
        render_sanctions_list(this.sanctions_list, current_sanctions, (uid) => this.remove_sanction(uid))
    }
}
