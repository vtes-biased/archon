import * as d from "../d"
import * as base from "../base"

export interface PlayerSelectCallback {
    (row: HTMLTableRowElement, player: d.Player): void
}

export class PlayerSelectModal extends base.Modal {
    select: HTMLSelectElement
    callback: PlayerSelectCallback | undefined
    empty_row: HTMLTableRowElement | undefined
    players: Map<string, d.Player>
    constructor(el: HTMLElement, title: string = "Add player") {
        super(el)
        this.modal_title.innerText = title
        const form = base.create_append(this.modal_body, "form")
        this.select = base.create_append(form, "select", ["form-select"], { name: "select-player" })
        base.create_append(this.select, "option", [], { value: "", label: "" })
        this.select.addEventListener("change", (ev) => this.select_player())
        this.players = new Map()
        this.modal_div.addEventListener("shown.bs.modal", () => { this.select.focus() })
    }

    init(callback: PlayerSelectCallback, players: d.Player[]) {
        this.callback = callback
        this.players.clear()
        for (const player of players) {
            this.players.set(player.uid, player)
        }
    }

    show(empty_row: HTMLTableRowElement) {
        this.empty_row = empty_row
        while (this.select.options.length > 1) {
            this.select.options.remove(1)
        }
        const players = [...this.players.values()].sort((a, b) => a.name.localeCompare(b.name))
        for (const player of players) {
            base.create_append(this.select, "option", [], {
                value: player.uid,
                label: `${player.name} (#${player.vekn})`
            })
        }
        this.modal.show()
    }

    select_player() {
        const player = this.players.get(this.select.selectedOptions[0].value)
        if (this.callback && this.empty_row && player) {
            this.callback(this.empty_row, player)
        }
        this.modal.hide()
    }

    add(player: d.Player) {
        this.players.set(player.uid, player)
    }

    remove(player: d.Player) {
        this.players.delete(player.uid)
    }
}