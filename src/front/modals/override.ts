import * as base from "../base"
import * as d from "../d"
import { Engine } from "../tournament/engine"

export class OverrideModal extends base.Modal {
    alert: HTMLDivElement
    form: HTMLFormElement
    comment: HTMLTextAreaElement
    submit_button: HTMLButtonElement
    remove_button: HTMLButtonElement
    cancel_button: HTMLButtonElement
    engine: Engine
    round: number | undefined
    table_number: number | undefined
    constructor(el: HTMLElement, engine: Engine) {
        super(el)
        this.engine = engine
        this.modal_title.innerText = "Override Table"
        this.alert = base.create_append(this.modal_body, "div", ["alert", "alert-info"], { role: "alert" })
        this.form = base.create_append(this.modal_body, "form", ["w-100"])
        this.comment = base.create_append(this.form, "textarea", ["form-control", "my-2"],
            { type: "text", autocomplete: "new-comment", rows: 3, maxlength: 500, name: "new-comment" }
        )
        this.comment.ariaAutoComplete = "none"
        this.comment.spellcheck = false
        this.comment.placeholder = "Comment"
        const buttons_div = base.create_append(this.form, "div", ["d-flex", "my-2"])
        this.submit_button = base.create_append(buttons_div, "button", ["btn", "btn-primary", "me-2"],
            { type: "submit" }
        )
        this.submit_button.innerText = "Submit"
        this.form.addEventListener("submit", (ev) => this.submit(ev))
        this.remove_button = base.create_append(buttons_div, "button", ["btn", "btn-danger", "me-2"],
            { type: "button" }
        )
        this.remove_button.innerHTML = '<i class="bi bi-trash"></i> Remove'
        this.remove_button.addEventListener("click", (ev) => this.unoverride())
        // remove_button hidden/shown in this.show()
        this.cancel_button = base.create_append(buttons_div, "button", ["btn", "btn-secondary", "me-2"],
            { type: "button" }
        )
        this.cancel_button.innerText = "Cancel"
        this.cancel_button.addEventListener("click", (ev) => { this.table_number = undefined; this.modal.hide() })
    }

    show(round: number, table: d.Table, table_number: number) {
        this.round = round
        this.table_number = table_number
        if (table.override) {
            this.comment.value = table.override.comment ?? ""
            this.remove_button.hidden = false
            this.remove_button.disabled = false
            this.alert.hidden = false
            this.alert.innerText = `Overriden by ${table.override.judge?.name}`
        } else {
            this.comment.value = ""
            this.remove_button.hidden = true
            this.remove_button.disabled = true
            this.alert.hidden = true
            this.alert.innerText = ""
        }
        this.modal.show()
    }

    async submit(ev: SubmitEvent) {
        ev.preventDefault()
        if (!this.round || !this.table_number) { return }
        const res = await this.engine.override_table(this.round, this.table_number, this.comment.value)
        if (res) {
            this.modal.hide()
        }
    }

    async unoverride() {
        if (!this.round || !this.table_number) { return }
        const res = await this.engine.unoverride_table(this.round, this.table_number)
        if (res) {
            this.modal.hide()
        }
    }
}
