import * as base from "../base"
import * as d from "../d"
import * as events from "../events"
import * as utils from "../utils"

// ─────────────────────────────────────────────────────────────────────────────
// Reusable sanction list rendering
// ─────────────────────────────────────────────────────────────────────────────

export function render_sanction_badge(sanction: d.Sanction): HTMLSpanElement {
    const badge = base.create_element("span", ["badge", "me-1"])
    badge.innerText = sanction.level ?? ""
    switch (sanction.level) {
        case events.SanctionLevel.CAUTION:
            badge.classList.add("text-bg-secondary")
            break
        case events.SanctionLevel.WARNING:
            badge.classList.add("text-bg-warning")
            break
        case events.SanctionLevel.DISQUALIFICATION:
        case events.SanctionLevel.BAN:
            badge.classList.add("text-bg-danger")
            break
    }
    return badge
}

export function render_sanction_item(
    sanction: d.Sanction,
    on_remove?: (sanction_uid: string) => void
): HTMLDivElement {
    const item = base.create_element("div", ["border", "rounded", "p-2", "mb-2", "bg-light"])
    item.dataset.uid = sanction.uid

    // Header row with badges and remove button
    const header = base.create_append(item, "div", ["d-flex", "align-items-center", "mb-1"])
    header.appendChild(render_sanction_badge(sanction))
    if (sanction.category) {
        const cat_badge = base.create_append(header, "span", ["badge", "text-bg-secondary", "me-1"])
        cat_badge.innerText = sanction.category
    }
    if (sanction.judge) {
        const judge = base.create_append(header, "small", ["text-muted", "me-auto"])
        judge.innerText = `by ${sanction.judge.name}`
    } else {
        base.create_append(header, "div", ["me-auto"])
    }
    if (on_remove) {
        const remove_btn = base.create_append(header, "button", ["btn", "btn-sm", "btn-danger", "py-0", "px-1"])
        remove_btn.innerHTML = '<i class="bi bi-trash"></i>'
        remove_btn.addEventListener("click", () => on_remove(sanction.uid ?? ""))
    }

    // Tournament info for RegisteredSanction
    if (Object.hasOwn(sanction, "tournament")) {
        const rsanction = sanction as d.RegisteredSanction
        if (rsanction.tournament) {
            const info = base.create_append(item, "small", ["text-muted", "d-block", "mb-1"])
            info.innerText = `${rsanction.tournament.name} (${utils.date_string(rsanction.tournament)})`
        }
    }

    // Comment
    if (sanction.comment) {
        const comment = base.create_append(item, "div", ["small"])
        comment.innerText = sanction.comment
    }

    return item
}

export function render_sanctions_list(
    container: HTMLElement,
    sanctions: d.Sanction[],
    on_remove?: (sanction_uid: string) => void
) {
    base.remove_children(container)
    if (sanctions.length === 0) {
        const empty = base.create_append(container, "div", ["text-muted", "fst-italic"])
        empty.innerText = "No sanctions"
        return
    }
    for (const sanction of sanctions) {
        container.appendChild(render_sanction_item(sanction, on_remove))
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sanction form (reusable)
// ─────────────────────────────────────────────────────────────────────────────

export class SanctionForm {
    form: HTMLFormElement
    comment: HTMLTextAreaElement
    level: HTMLSelectElement
    category: HTMLSelectElement
    submit_button: HTMLButtonElement

    constructor(
        container: HTMLElement,
        button_text: string = "Add Sanction",
        levels: events.SanctionLevel[] = Object.values(events.SanctionLevel)
    ) {
        this.form = base.create_append(container, "form", ["w-100"])
        this.comment = base.create_append(this.form, "textarea", ["form-control", "mb-2"],
            { type: "text", autocomplete: "new-comment", rows: 2, maxlength: 500, name: "comment" }
        )
        this.comment.ariaAutoComplete = "none"
        this.comment.spellcheck = false
        this.comment.placeholder = "Comment"

        const select_div = base.create_append(this.form, "div", ["d-flex", "gap-1", "flex-wrap"])
        const level_div = base.create_append(select_div, "div", ["form-floating", "flex-grow-1"])
        this.level = base.create_append(level_div, "select", ["form-select"], { id: "sanctionFormLevel" })
        this.level.ariaLabel = "Level"
        base.create_append(level_div, "label", [], { for: "sanctionFormLevel" }).innerText = "Level"
        for (const level of levels) {
            this.level.options.add(base.create_element("option", [], { value: level, label: level }))
        }
        this.level.required = true

        const category_div = base.create_append(select_div, "div", ["form-floating", "flex-grow-1"])
        this.category = base.create_append(category_div, "select", ["form-select"], { id: "sanctionFormCategory" })
        this.category.ariaLabel = "Category"
        base.create_append(category_div, "label", [], { for: "sanctionFormCategory" }).innerText = "Category"
        this.category.options.add(base.create_element("option", [], { value: "", label: "N/A" }))
        for (const category of Object.values(events.SanctionCategory)) {
            this.category.options.add(base.create_element("option", [], { value: category, label: category }))
        }
        this.category.required = false

        const buttons_div = base.create_append(this.form, "div", ["d-flex", "mt-2"])
        this.submit_button = base.create_append(buttons_div, "button", ["btn", "btn-warning"],
            { type: "submit" }
        )
        this.submit_button.innerText = button_text
    }

    reset() {
        this.comment.value = ""
        this.level.selectedIndex = 0
        this.category.selectedIndex = 0
    }

    get_values(): { level: string, category: string, comment: string } {
        return {
            level: this.level.value,
            category: this.category.value,
            comment: this.comment.value
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Simple form-only modal for adding sanctions (member page)
// ─────────────────────────────────────────────────────────────────────────────

// Member page levels (no tournament-specific CAUTION/DISQUALIFICATION)
export const MEMBER_SANCTION_LEVELS = [events.SanctionLevel.WARNING, events.SanctionLevel.BAN]

export class SanctionFormModal extends base.Modal {
    sanction_form: SanctionForm
    cancel_button: HTMLButtonElement
    member_uid: string | null
    on_submit: (member_uid: string, level: string, category: string, comment: string) => Promise<d.Sanction | null>

    constructor(
        el: HTMLElement,
        on_submit: (member_uid: string, level: string, category: string, comment: string) => Promise<d.Sanction | null>
    ) {
        super(el)
        this.on_submit = on_submit
        this.member_uid = null
        this.modal_title.innerText = "Add Sanction"
        this.sanction_form = new SanctionForm(this.modal_body, "Submit", MEMBER_SANCTION_LEVELS)
        this.sanction_form.form.addEventListener("submit", (ev) => this.submit(ev))

        // Add cancel button after submit
        this.cancel_button = base.create_element("button", ["btn", "btn-secondary", "ms-2"], { type: "button" })
        this.cancel_button.innerText = "Cancel"
        this.cancel_button.addEventListener("click", () => this.modal.hide())
        this.sanction_form.submit_button.parentElement?.appendChild(this.cancel_button)
    }

    show(member: d.Person) {
        this.member_uid = member.uid
        this.modal_title.innerText = `Sanction ${member.name}`
        this.sanction_form.reset()
        this.modal.show()
    }

    async submit(ev: SubmitEvent) {
        ev.preventDefault()
        if (!this.member_uid) return
        const { level, category, comment } = this.sanction_form.get_values()
        const sanction = await this.on_submit(this.member_uid, level, category, comment)
        if (sanction) {
            this.modal.hide()
        }
    }
}
