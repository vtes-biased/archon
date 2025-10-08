import * as base from "../base"
import * as d from "../d"
import * as utils from "../utils"
import * as seating from "../seating"
import { Engine } from "../tournament/engine"


export class SeedFinalsModal extends base.Modal {
    alert: HTMLDivElement
    form: HTMLDivElement
    players_table: HTMLTableElement
    players_table_body: HTMLTableSectionElement
    players: d.Player[]
    to_toss: d.Player[][]
    submit_button: HTMLButtonElement
    toss_button: HTMLButtonElement
    engine: Engine
    constructor(el: HTMLElement, engine: Engine) {
        super(el)
        this.engine = engine
        this.modal_title.innerText = "Finals seeding"
        const alert = base.create_append(this.modal_body, "div", ["alert", "alert-info"], { role: "alert" })
        alert.innerText = (
            "Make sure those players are available for the finals. " +
            "Close and drop or check-in players to adjust."
        )
        // WARNING: don't use a form here, even if we have the toss number as inputs.
        // It breaks on Firefox in a strange way: failing to parse the form data itself
        // makes it raise a Network error on the fetch sending the event there...
        this.players_table = base.create_append(this.modal_body, "table", ["table", "table-sm"])
        const head = base.create_append(this.players_table, "thead")
        const row = base.create_append(head, "tr", ["align-middle"])
        for (const label of ["Rank", "Toss", "Player"]) {
            const cel = base.create_append(row, "th", [], { scope: "col" })
            cel.innerText = label
        }
        this.players_table_body = base.create_append(this.players_table, "tbody")
        const buttons_div = base.create_append(this.modal_body, "div", ["d-flex", "my-2"])
        this.submit_button = base.create_append(buttons_div, "button", ["btn", "btn-primary", "me-2"],
            { type: "submit" }
        )
        this.submit_button.innerText = "Submit"
        this.submit_button.addEventListener("click", async (ev) => await this.submit())
        this.toss_button = base.create_append(buttons_div, "button", ["btn", "btn-warning", "me-2"],
            { type: "button" }
        )
        this.toss_button.innerHTML = `<i class="bi bi-coin"></i> Toss`
        const tooltip = base.add_tooltip(this.toss_button, "Toss to break ties")
        this.toss_button.addEventListener("click", (ev) => { ev.preventDefault(); tooltip.hide(); this.do_toss() })
        this.to_toss = []
    }

    show() {
        if (!this.engine.tournament) { return }
        this.players = []
        for (const [rank, player] of utils.standings(this.engine.tournament, undefined, true)) {
            if (rank > 5) {
                break
            }
            this.players.push(player)
        }
        this.modal.show()
        this.display()
    }

    display() {
        base.remove_children(this.players_table_body)
        if (!this.engine.tournament) { return }
        var last_rank: number = 0
        var last_row: HTMLTableRowElement | undefined = undefined
        var last_player: d.Player | undefined = undefined
        var toss_basket: (d.Player | undefined)[] | undefined = undefined
        for (const [rank, player] of utils.standings(this.engine.tournament, this.players)) {
            const row = base.create_append(this.players_table_body, "tr", ["align-middle"])
            const score_cell = base.create_append(row, "td", ["text-nowrap"])
            score_cell.innerHTML = utils.full_score_string(player, rank)
            const toss_cel = base.create_append(row, "td", ["text-nowrap"])
            const toss = base.create_append(toss_cel, "input", ["border", "form-control-sm"],
                { type: "number", min: "0", max: "5", placeholder: "0", name: `toss-${player.uid}` }
            )
            toss.value = player.toss?.toString() ?? "0"
            toss.addEventListener("change", (ev) => this.change_toss(parseInt(toss.value), player))
            const name = base.create_append(row, "td", ["w-100"])
            name.innerText = `#${player.vekn} ${player.name}`
            if (rank == last_rank) {
                if (toss_basket) {
                    toss_basket.push(player)
                }
                else {
                    toss_basket = [last_player, player]
                    for (const cel of last_row?.children ?? []) {
                        cel.classList.add("bg-warning-subtle")
                    }
                }
                for (const cel of row.children) {
                    cel.classList.add("bg-warning-subtle")
                }
            } else {
                if (toss_basket) {
                    this.to_toss.push(toss_basket.filter(p => p !== undefined) as d.Player[])
                    toss_basket = undefined
                }
            }
            last_rank = rank
            last_row = row
            last_player = player
        }
        if (toss_basket) {
            this.to_toss.push(toss_basket.filter(p => p !== undefined) as d.Player[])
            toss_basket = undefined
        }
        if (this.to_toss.length > 0) {
            this.submit_button.disabled = true
            this.toss_button.disabled = false
            this.toss_button.classList.remove("invisible")
            this.toss_button.classList.add("visible")
        } else {
            this.submit_button.disabled = false
            this.toss_button.disabled = true
            this.toss_button.classList.remove("visible")
            this.toss_button.classList.add("invisible")
        }
    }

    async submit() {
        if (!this.engine.tournament) { return }
        const toss = {}
        const seeds: string[] = []
        for (const player of this.players) {
            toss[player.uid] = player.toss
        }
        for (const [rank, player] of utils.standings(this.engine.tournament, this.players)) {
            if (rank > 5) { break }
            seeds.push(player.uid)
        }
        await this.engine.seed_finals(seeds, toss)
        this.modal.hide()
    }

    do_toss() {
        for (const player of this.players) {
            player.toss = 0
        }
        for (const basket of this.to_toss) {
            seating.shuffle_array(basket)
            var idx: number = 1
            for (const player of basket) {
                player.toss = idx++
            }
        }
        this.to_toss = []
        this.display()
    }

    change_toss(value: number, player: d.Player) {
        player.toss = value
        this.display()
    }
}
