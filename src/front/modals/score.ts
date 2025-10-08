import * as base from "../base"
import * as d from "../d"
import * as bootstrap from 'bootstrap'
import { Engine } from "../tournament/engine"

export class ScoreModal {
    engine: Engine
    player_uid: string
    round_number: number
    modal_div: HTMLDivElement
    modal: bootstrap.Modal
    title: HTMLHeadingElement
    btn_35: HTMLButtonElement
    btn_35_tooltip: bootstrap.Tooltip
    btn_45: HTMLButtonElement
    btn_45_tooltip: bootstrap.Tooltip
    btn_50: HTMLButtonElement
    btn_50_tooltip: bootstrap.Tooltip
    constructor(el: HTMLDivElement, engine: Engine) {
        this.engine = engine
        this.modal_div = base.create_append(el, "div", ["modal", "fade"],
            { tabindex: "-1", "aria-hidden": "true", "aria-labelledby": "scoreModalLabel" }
        )
        const dialog = base.create_append(this.modal_div, "div", ["modal-dialog"])
        const content = base.create_append(dialog, "div", ["modal-content"])
        const header = base.create_append(content, "div", ["modal-header"])
        this.title = base.create_append(header, "h1", ["modal-title", "fs-5"], { id: "scoreModalLabel" })
        base.create_append(header, "button", ["btn-close"], { "data-bs-dismiss": "modal", "aria-label": "Close" })
        const body = base.create_append(content, "div", ["modal-body", "d-flex", "flex-column", "align-items-center"])
        const row_1 = base.create_append(body, "div", ["d-flex", "flex-row", "align-items-center"])
        const btn_00 = base.create_append(row_1, "button", ["btn", "btn-primary", "me-1", "mb-1"], { type: "button" })
        const btn_10 = base.create_append(row_1, "button", ["btn", "btn-primary", "me-1", "mb-1"], { type: "button" })
        const btn_20 = base.create_append(row_1, "button", ["btn", "btn-primary", "me-1", "mb-1"], { type: "button" })
        const btn_30 = base.create_append(row_1, "button", ["btn", "btn-primary", "me-1", "mb-1"], { type: "button" })
        const btn_40 = base.create_append(row_1, "button", ["btn", "btn-primary", "me-1", "mb-1"], { type: "button" })
        this.btn_50 = base.create_append(row_1, "button", ["btn", "btn-primary", "me-1", "mb-1"], { type: "button" })
        this.btn_50_tooltip = base.add_tooltip(this.btn_50, "Normally not on a 5p table")
        const row_2 = base.create_append(body, "div", ["d-flex", "flex-row", "align-items-center"])
        const btn_05 = base.create_append(row_2, "button", ["btn", "btn-primary", "me-1", "mb-1"], { type: "button" })
        const btn_15 = base.create_append(row_2, "button", ["btn", "btn-primary", "me-1", "mb-1"], { type: "button" })
        const btn_25 = base.create_append(row_2, "button", ["btn", "btn-primary", "me-1", "mb-1"], { type: "button" })
        this.btn_35 = base.create_append(row_2, "button", ["btn", "btn-primary", "me-1", "mb-1"], { type: "button" })
        this.btn_35_tooltip = base.add_tooltip(this.btn_35, "Normally not on a 5p table")
        this.btn_45 = base.create_append(row_2, "button", ["btn", "btn-secondary", "me-1", "mb-1"], { type: "button" })
        this.btn_45_tooltip = base.add_tooltip(this.btn_45, "Normally invalid")
        btn_00.innerText = "0"
        btn_05.innerText = "0.5"
        btn_10.innerText = "1"
        btn_15.innerText = "1.5"
        btn_20.innerText = "2"
        btn_25.innerText = "2.5"
        btn_30.innerText = "3"
        this.btn_35.innerText = "3.5"
        btn_40.innerText = "4"
        this.btn_45.innerText = "4.5"
        this.btn_50.innerText = "5"
        btn_00.addEventListener("click", (ev) => this.set_score(0))
        btn_05.addEventListener("click", (ev) => this.set_score(0.5))
        btn_10.addEventListener("click", (ev) => this.set_score(1))
        btn_15.addEventListener("click", (ev) => this.set_score(1.5))
        btn_20.addEventListener("click", (ev) => this.set_score(2))
        btn_25.addEventListener("click", (ev) => this.set_score(2.5))
        btn_30.addEventListener("click", (ev) => this.set_score(3))
        this.btn_35.addEventListener("click", (ev) => this.set_score(3.5))
        btn_40.addEventListener("click", (ev) => this.set_score(4))
        this.btn_45.addEventListener("click", (ev) => { this.btn_45_tooltip.hide(); this.set_score(4.5) })
        this.btn_50.addEventListener("click", (ev) => { this.btn_50_tooltip.hide(); this.set_score(5) })
        this.modal = new bootstrap.Modal(this.modal_div)
    }

    async set_score(score: number) {
        await this.engine.set_score(this.player_uid, this.round_number, score)
        this.modal.hide()
    }

    show(player: d.Player, round_number: number, table_size: number, vps: number = 0) {
        if (!this.engine.tournament) { return }
        const is_judge = this.engine.tournament.judges?.find(judge => judge.uid == player.uid)
        this.title.innerText = `${player.name} result: round ${round_number}`
        this.player_uid = player.uid
        this.round_number = round_number
        if (table_size < 5) {
            if (is_judge) {
                this.btn_35.hidden = false
                this.btn_35.classList.remove("btn-primary")
                this.btn_35.classList.add("btn-secondary")
                this.btn_35_tooltip.enable()
                this.btn_50.hidden = false
                this.btn_50.classList.remove("btn-primary")
                this.btn_50.classList.add("btn-secondary")
                this.btn_50_tooltip.enable()
            } else {
                this.btn_35_tooltip.disable()
                this.btn_35.hidden = true
                this.btn_50_tooltip.disable()
                this.btn_50.hidden = true
            }
        } else {
            this.btn_35.classList.remove("btn-secondary")
            this.btn_35.classList.add("btn-primary")
            this.btn_35_tooltip.disable()
            this.btn_35.hidden = false
            this.btn_50.classList.remove("btn-secondary")
            this.btn_50.classList.add("btn-primary")
            this.btn_50_tooltip.disable()
            this.btn_50.hidden = false
            if (is_judge) {
                this.btn_45.hidden = false
                this.btn_45_tooltip.enable()
            } else {
                this.btn_45.hidden = true
                this.btn_45_tooltip.disable()
            }
        }
        this.modal.show()
    }
}
