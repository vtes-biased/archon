import * as base from "../base"
import * as d from "../d"
import * as events from "../events"
import * as utils from "../utils"
import * as bootstrap from 'bootstrap'
import { v4 as uuidv4 } from "uuid"
import { DeckSubmit } from "./deck"
import { Engine } from "../tournament/engine"
import * as member from "../member"

export class SanctionPlayerModal extends base.Modal {
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
    engine: Engine
    members_map: member.MembersDB
    member: d.Person | null
    round: number | undefined
    seat: d.TableSeat | undefined
    constructor(el: HTMLElement, engine: Engine, members_map: member.MembersDB) {
        super(el)
        this.engine = engine
        this.members_map = members_map
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
        this.member = await this.members_map.get_by_uid(member_uid) ?? null
        if (!this.member) { return }
        if (!this.engine.tournament) { return }
        this.round = round
        this.seat = seat
        this.modal_title.innerText = this.member.name
        this.comment.value = ""
        this.level.selectedIndex = 0
        this.category.selectedIndex = 0
        base.remove_children(this.sanctions_accordion)
        this.sanction_idx = 0
        for (const sanction of this.member.sanctions ?? []) {
            if (sanction.tournament?.uid == this.engine.tournament.uid) {
                continue
            }
            this.add_sanction_display(sanction)
        }
        for (const sanction of this.engine.tournament.sanctions[member_uid] ?? []) {
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
        if (!this.member) { return }
        if (!this.engine.tournament) { return }
        this.deck_submit.init(this.member.uid, this.engine.tournament, this.round)
    }
    async submit_deck(player_uid: string, deck: string, round: number | undefined) {
        await this.engine.set_deck(player_uid, deck, round)
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
        level_badge.innerText = sanction.level ?? ""
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
            category_badge.innerText = sanction.category ?? ""
        }
        const collapse = base.create_append(item, "div", ["accordion-collapse", "collapse"], {
            "aria-labelledby": head_id, "data-bs-parent": "#sanctionAccordion"
        })
        collapse.id = id
        const body = base.create_append(collapse, "div", ["accordion-body"])
        body.innerText = sanction.comment ?? ""
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
            remove_button.addEventListener("click", (ev) => this.remove_sanction(sanction.uid ?? ""))
        }
    }

    async submit(ev: SubmitEvent) {
        ev.preventDefault()
        if (!this.member) { return }
        const sanction_uid: string = uuidv4()
        var tev = {
            uid: uuidv4(),
            type: events.EventType.SANCTION,
            sanction_uid: sanction_uid,
            player_uid: this.member.uid,
            level: this.level.value,
            category: this.category.value,
            comment: this.comment.value,
        } as events.Sanction
        const success = await this.engine.handle_tournament_event(tev)
        if (!success) { return }
        this.comment.value = ""
        const sanctions = this.engine?.tournament?.sanctions[this.member.uid]
        for (const sanction of sanctions ?? []) {
            if (sanction.uid == sanction_uid) {
                this.add_sanction_display(sanction)
            }
        }
    }

    async remove_sanction(sanction_uid: string) {
        var tev = {
            uid: uuidv4(),
            type: events.EventType.UNSANCTION,
            sanction_uid: sanction_uid,
            player_uid: this.member?.uid,
        } as events.Unsanction
        const tournament = await this.engine.handle_tournament_event(tev)
        if (!tournament) { return }
        for (const item of this.sanctions_accordion.querySelectorAll(".accordion-item") as NodeListOf<HTMLDivElement>) {
            if (item.dataset.uid == sanction_uid) {
                item.remove()
            }
        }
    }
}
