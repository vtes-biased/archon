import * as d from "../d"
import * as base from "../base"
import * as utils from "../utils"
import * as seating from "../seating"
import { Engine } from "./engine"
import { PlayerSelectModal } from "../modals/player_select"
import { ScoreModal } from "../modals/score"
import { SanctionPlayerModal } from "../modals/sanction_player"
import { OverrideModal } from "../modals/override"

class PlayerDrag {
    // this drag & drop thing is tricky enough to deserve its own class
    dragging: HTMLTableRowElement | null
    origin_parent: HTMLTableSectionElement | null
    origin_next: HTMLTableRowElement | null
    previous_switch: HTMLTableRowElement | null
    constructor() {
        this.dragging = null
        this.origin_parent = null
        this.origin_next = null
        this.previous_switch = null
    }
    start(dragging: HTMLTableRowElement) {
        this.dragging = dragging
        this.dragging.classList.add("dragged")
        this.origin_parent = this.dragging.parentElement as HTMLTableSectionElement
        this.origin_next = this.dragging.nextElementSibling as HTMLTableRowElement | null
    }
    end() {
        if (this.dragging) {
            this.dragging.classList.remove("dragged")
        }
        this.dragging = null
        if (this.previous_switch) {
            this.previous_switch.classList.remove("dragged")
        }
        this.previous_switch = null
        this.origin_parent = null
        this.origin_next = null
    }
    is_empty(target: HTMLTableRowElement): boolean {
        return target.dataset.player_uid == null
    }
    same_table(target: HTMLTableRowElement): boolean {
        return this.origin_parent == target.parentElement as HTMLTableSectionElement
    }
    is_sibling(target: HTMLTableRowElement): boolean {
        return !!this.dragging && (this.dragging.nextElementSibling == target || this.dragging.previousElementSibling == target)
    }
    update(target: HTMLTableRowElement) {
        // this is where the drag & drop (d&d) magic happens
        // we switch rows as we go while dragging for instant comfortable UX update
        if (!this.dragging) { return }
        if (this.dragging == target) { return }
        // in all other cases, we switch cells so dragging is in place of target in the end
        // first, if there was a previous switch, reset back
        if (this.previous_switch) {
            // if it was an empty row, it goes to the last seat
            if (this.is_empty(this.previous_switch)) {
                // do not swap for an empty slot if we already swapped for an empty slot on the same table
                if (this.is_empty(target) && target.parentElement == this.previous_switch.parentElement) { return }
                this.dragging.parentElement?.append(this.previous_switch)
            }
            // otherwise, put it back where we are
            else {
                this.dragging.parentElement?.insertBefore(this.previous_switch, this.dragging)
            }
            // put the dragged item back to its original position
            this.origin_parent?.insertBefore(this.dragging, this.origin_next)
            this.previous_switch.classList.remove("dragged")
            this.previous_switch = null
        }
        // on the same table (local d&d), we swap continuously, so as to keep the players order set
        if (this.same_table(target)) {
            // do not swap to an empty seat in the same table
            if (this.is_empty(target)) { return }
            // only swap with siblings
            if (!this.is_sibling(target)) { return }
            // use our _current_ position, not our original position: this is what continuous swap means
            const current_next = this.dragging.nextElementSibling
            target.parentElement?.insertBefore(this.dragging, target.nextElementSibling)
            target.parentElement?.insertBefore(target, current_next)
        }
        // on another table (cross d&d), we do a "simple" swap: the end state of the whole dragging operation
        // including hovering many other rows, must as if we just swap the origin and the target
        // so we record our target to swap it back (first part of this method) if we change target later in the drag
        else {
            // if landing on an empty cell, target the first empty cell in the table
            while (
                this.is_empty(target) &&
                target.previousElementSibling &&
                target.previousElementSibling.tagName == "TR" &&
                this.is_empty(target.previousElementSibling as HTMLTableRowElement)
            ) {
                target = target.previousElementSibling as HTMLTableRowElement
            }
            this.previous_switch = target
            this.previous_switch.classList.add("dragged")
            target.parentElement?.insertBefore(this.dragging, target)
            if (this.is_empty(target)) {
                this.origin_parent?.append(target)
            } else {
                this.origin_parent?.insertBefore(target, this.origin_next)
            }
        }
    }
}

export interface RoundTabContainer {
    select_modal: PlayerSelectModal
    score_modal: ScoreModal
    sanction_player_modal: SanctionPlayerModal
    override_modal: OverrideModal
    warn_about_player: (player_uid: string) => Promise<boolean>
    confirmation: base.ConfirmationModal
    compute_seating_issues: () => string[][][]
}

export class RoundTab {
    engine: Engine
    container: RoundTabContainer
    index: number
    next_table_index: number
    table_div: HTMLDivElement | undefined
    panel: HTMLDivElement
    action_row: HTMLDivElement
    reseat_button: HTMLButtonElement
    tooltips: base.TooltipManager
    finals: boolean
    player_drag: PlayerDrag
    constructor(engine: Engine, container: RoundTabContainer, index: number, finals: boolean = false) {
        this.engine = engine
        this.container = container
        this.index = index
        this.finals = finals
        this.player_drag = new PlayerDrag()
        this.tooltips = new base.TooltipManager()
    }
    init(panel: HTMLDivElement) {
        this.panel = panel
    }
    display() {
        if (!this.panel) { return }
        this.tooltips.dispose()
        base.remove_children(this.panel)
        if (!this.engine?.tournament) { return }
        this.action_row = base.create_append(this.panel, "div", ["d-md-flex", "my-4"])
        {
            const print_button = base.create_append(this.action_row, "a", ["me-2", "mb-2", "btn", "btn-secondary"],
                { target: "_blank" }
            )
            print_button.innerHTML = '<i class="bi bi-printer-fill"></i>'
            this.tooltips.add(print_button, "Printable version")
            print_button.href = `/tournament/${this.engine.tournament.uid}/print-seating.html?round=${this.index}`
        }
        {
            this.reseat_button = base.create_append(this.action_row, "button", ["me-2", "mb-2", "text-nowrap", "btn"])
            if (this.finals) {
                this.reseat_button.classList.add("btn-primary")
                this.tooltips.add(this.reseat_button, "Use after seating procedure to record the finals seating")
            } else {
                this.reseat_button.classList.add("btn-warning")
            }
            this.reseat_button.innerHTML = '<i class="bi bi-pentagon-fill"></i> Alter seating'
            this.reseat_button.addEventListener("click", (ev) => {
                this.start_reseat()
            })
        }
        const round = this.engine.tournament.rounds[this.index - 1]
        this.next_table_index = 1
        for (const table of round.tables) {
            this.display_table(table)
        }
        if (
            this.index == this.engine.tournament.rounds.length
            && round.tables.every(t => t.seating.every(s => (s.result?.vp || 0) == 0))
        ) {
            const button = base.create_append(this.action_row, "button",
                ["me-2", "mb-2", "text-nowrap", "btn", "btn-danger"]
            )
            var message: string
            if (this.engine.tournament.state == d.TournamentState.FINALS) {
                button.innerHTML = '<i class="bi bi-x-circle-fill"></i> Cancel Seeding'
                message = "This will not reset the toss (tie-breakers)"
            } else {
                button.innerHTML = '<i class="bi bi-x-circle-fill"></i> Cancel Round'
                message = "Do not use if players have started to play"
            }
            this.tooltips.add(button, message)
            button.addEventListener("click", (ev) => {
                if (round.tables.length > 0) {
                    this.container.confirmation.show(
                        "<strong>This seating will be lost</strong> <br>" +
                        `<em>${message}</em>`,
                        () => this.engine.cancel_round()
                    )
                } else {
                    this.engine.cancel_round()
                }
            })
        }
        if (this.engine.tournament.state == d.TournamentState.PLAYING
            && this.index == this.engine.tournament.rounds.length
            && round.tables.length > 0
            && round.tables.every(t => t.state == d.TableState.FINISHED)
        ) {
            const button = base.create_append(this.action_row, "button",
                ["me-2", "mb-2", "text-nowrap", "btn", "btn-success"]
            )
            button.innerText = "Finish round"
            button.addEventListener("click", (ev) => { this.engine.finish_round() })
        }
        if (this.engine.tournament.state == d.TournamentState.FINALS
            && this.index == this.engine.tournament.rounds.length
            && round.tables.every(t => t.state == d.TableState.FINISHED)
        ) {
            const button = base.create_append(this.action_row, "button",
                ["me-2", "mb-2", "text-nowrap", "btn", "btn-success"]
            )
            button.innerText = "Finish tournament"
            button.addEventListener("click", (ev) => { this.engine.finish_tournament() })
        }
    }

    display_table(data: d.Table | undefined): HTMLTableSectionElement {
        if (!this.table_div || this.next_table_index % 2 === 1) {
            this.table_div = base.create_append(this.panel, "div", ["row", "g-5", "my-0"])
        }
        const table_index = this.next_table_index++
        const div = base.create_append(this.table_div, "div", ["col-lg-6"])
        const title_div = base.create_append(div, "div", ["d-inline-flex", "flex-row", "mb-2", "align-items-center"])
        const title = base.create_append(title_div, "h2", ["m-0", "me-2"])
        if (this.finals) {
            title.innerText = `Finals table`
        } else {
            title.innerText = `Table ${table_index}`
        }
        const table = base.create_append(div, "table", ["table", "table-sm"])
        const head = base.create_append(table, "thead")
        const tr = base.create_append(head, "tr", ["align-middle", "smaller-font"])
        var headers = ["VEKN#", "Name", "Score", ""]
        if (this.finals) {
            headers = ["Seed", "VEKN#", "Name", "Score", ""]
        }
        for (const label of headers) {
            const th = base.create_append(tr, "th", [], { scope: "col" })
            th.innerText = label
        }
        const body = base.create_append(table, "tbody")
        // Empty table creation stops here
        if (!data) { return body }
        const badge = base.create_append(title_div, "span", ["badge", "me-2"])
        badge.innerText = data.state
        switch (data.state) {
            case d.TableState.FINISHED:
                badge.classList.add("text-bg-success")
                break
            case d.TableState.INVALID:
                badge.classList.add("text-bg-danger")
                break
            case d.TableState.IN_PROGRESS:
                badge.classList.add("text-bg-secondary")
                break
        }
        if (data.state != d.TableState.FINISHED) {
            const overrideButton = base.create_append(title_div, "button", ["me-2", "btn", "btn-warning"])
            overrideButton.innerText = "Override"
            this.tooltips.add(overrideButton, "Validate an odd score")
            overrideButton.addEventListener("click", ev => {
                this.container.override_modal.show(this.index, data, table_index)
            })
        }
        if (data.override) {
            const overrideButton = base.create_append(title_div, "button", ["me-2", "btn", "btn-info"])
            overrideButton.innerText = "Overriden"
            this.tooltips.add(overrideButton, "Check or remove the override")
            overrideButton.addEventListener("click", ev => {
                this.container.override_modal.show(this.index, data, table_index)
            })
        }
        if (!this.engine.tournament) { return body }
        for (const seat of data.seating) {
            const player = this.engine.tournament.players[seat.player_uid]
            const row = base.create_append(body, "tr", ["align-middle"])
            const actions = this.display_player(row, player, seat)
            const changeButton = base.create_append(actions, "button", ["me-2", "btn", "btn-sm", "btn-primary"])
            changeButton.innerHTML = '<i class="bi bi-pencil"></i>'
            this.tooltips.add(changeButton, "Set score")
            changeButton.addEventListener("click", (ev) => {
                this.container.score_modal.show(player, this.index, data.seating.length, seat.result?.vp || 0)
            })
            const sanctionButton = base.create_append(actions, "button", ["me-2", "btn", "btn-sm"])
            sanctionButton.innerHTML = '<i class="bi bi-info-circle-fill"></i>'
            this.tooltips.add(sanctionButton, "Decklist & sanctions")
            sanctionButton.addEventListener("click", (ev) => {
                this.container.sanction_player_modal.show(player.uid, this.index, seat)
            })
            this.container.warn_about_player(player.uid).then((warn: boolean) => {
                if (warn) {
                    sanctionButton.classList.add("btn-warning")
                } else {
                    sanctionButton.classList.add("btn-primary")
                }
            })
        }
        return body
    }

    display_player(
        row: HTMLTableRowElement,
        player: d.Player,
        seat: d.TableSeat | undefined = undefined
    ): HTMLTableCellElement {
        row.dataset.player_uid = player.uid
        if (this.finals) {
            const score_cell = base.create_append(row, "td", ["text-nowrap"])
            score_cell.innerHTML = utils.full_score_string(player)
        }
        base.create_append(row, "th", ["text-nowrap", "smaller-font"], { scope: "row" }).innerText = player.vekn || ""
        base.create_append(row, "td", ["w-100", "smaller-font"]).innerText = player.name
        if (seat) {
            base.create_append(row, "td", ["text-nowrap"]).innerText = utils.score_string(seat.result)
        } else {
            // not seated *yet*: we're in alter seating mode
            base.create_append(row, "td", ["text-nowrap"]).innerText = "0VP"
        }
        return base.create_append(row, "td", ["action-row", "text-nowrap"])
    }

    iter_tables(): ArrayIterator<HTMLTableSectionElement> {
        const tables = this.panel.querySelectorAll("tbody") as NodeListOf<HTMLTableSectionElement>
        return tables.values()
    }

    iter_rows(table: HTMLTableSectionElement | undefined = undefined): ArrayIterator<HTMLTableRowElement> {
        const rows = (table ?? this.panel).querySelectorAll("tr") as NodeListOf<HTMLTableRowElement>
        return rows.values()
    }

    *iter_player_uids(table: HTMLTableSectionElement | undefined = undefined): Generator<string> {
        for (const row of this.iter_rows(table)) {
            const player_uid = row.dataset.player_uid
            if (player_uid) { yield player_uid }
        }
    }

    setup_reseat_table_body(table: HTMLTableSectionElement) {
        var rows = table.querySelectorAll("tr") as NodeListOf<HTMLTableRowElement>
        for (const row of rows) {
            const action_row = row.querySelector(".action-row") as HTMLTableCellElement
            base.remove_children(action_row)
            this.display_reseat_actions(row, action_row)
        }
        while (rows.length < 5) {
            this.add_empty_row(table)
            rows = table.querySelectorAll("tr") as NodeListOf<HTMLTableRowElement>
        }
    }
    start_reseat() {
        this.tooltips.partial_dispose(this.action_row)
        base.remove_children(this.action_row)
        this.reseat_button = base.create_append(this.action_row, "button", ["me-2", "btn", "btn-success"])
        this.reseat_button.innerHTML = '<i class="bi bi-check"></i> Save seating'
        this.reseat_button.addEventListener("click", (ev) => { this.reseat() })
        if (!this.finals) {
            const add_table_button = base.create_append(this.action_row, "button",
                ["me-2", "btn", "btn-primary"]
            )
            add_table_button.innerHTML = '<i class="bi bi-plus"></i> Add Table'
            add_table_button.addEventListener("click",
                (ev) => { this.setup_reseat_table_body(this.display_table(undefined)) }
            )
        }
        const cancel_button = base.create_append(this.action_row, "button", ["me-2", "btn", "btn-secondary"])
        cancel_button.innerHTML = '<i class="bi bi-x"></i> Cancel'
        cancel_button.addEventListener("click", (ev) => { this.display() })

        for (const table of this.iter_tables()) {
            this.setup_reseat_table_body(table)
        }
        this.display_seating_issues()
    }

    display_reseat_actions(row: HTMLTableRowElement, actions_row: HTMLTableCellElement) {
        const remove_button = base.create_append(actions_row, "button", ["me-2", "btn", "btn-sm", "btn-danger"])
        remove_button.innerHTML = '<i class="bi bi-trash"></i>'
        remove_button.addEventListener("click", (ev) => { this.remove_row(row) })
        row.draggable = true
        row.addEventListener("dragstart", (ev) => this.dragstart_row(ev))
        row.addEventListener("dragenter", (ev) => this.dragenter_row(ev))
        row.addEventListener("dragover", (ev) => ev.preventDefault())
        row.addEventListener("dragend", (ev) => this.dragend_row(ev))
    }

    display_seating_issues() {
        if (this.finals) { return }
        const issues = this.container.compute_seating_issues()
        const warnings = new Map<string, [number, string]>()
        for (const [idx, instances] of issues.entries()) {
            var message: string | undefined = undefined
            switch (idx) {
                case seating.RULE.R1_PREDATOR_PREY:
                    message = "R1. Repeated Predator-Prey relationship"
                    break;
                case seating.RULE.R2_OPPONENT_ALWAYS:
                    message = "R2. Repeated Opponents"
                    break;
                case seating.RULE.R3_AVAILABLE_VPS:
                    message = "R3. Non-average available VPs"
                    break;
                case seating.RULE.R4_OPPONENT_TWICE:
                    message = "R4. Opponents twice"
                    break;
                case seating.RULE.R5_FIFTH_SEAT:
                    message = "R5. Fifth seat twice"
                    break;
                case seating.RULE.R6_SAME_POSITION:
                    message = "R6. Repeated opponent position"
                    break;
                case seating.RULE.R7_SAME_SEAT:
                    message = "R7. Repeated seat"
                    break;
                case seating.RULE.R8_STARTING_TRANSFERS:
                    message = "R8. Non-average starting transfers"
                    break;
                case seating.RULE.R9_SAME_POSITION_GROUP:
                    message = "R9. Repeated opponent position group"
                    break;
                default:
                    console.log("Unknown issue index!!")
                    break;
            }
            for (const instance of instances) {
                for (const player_uid of instance) {
                    if (warnings.has(player_uid) && warnings.get(player_uid)![0] < idx + 1) {
                        continue
                    }
                    warnings.set(player_uid, [idx + 1, message || ""])
                }
            }
        }
        for (const row of this.iter_rows()) {
            const player_uid = row.dataset.player_uid
            const cell = row.querySelector("th") as HTMLTableCellElement
            const previous_icons = cell.querySelectorAll("i") as NodeListOf<HTMLElement>
            for (const icon of previous_icons) {
                icon.remove()
            }
            if (player_uid && warnings.has(player_uid)) {
                const [level, message] = warnings.get(player_uid)!
                const classes = ["bi", "bi-exclamation-triangle-fill", "me-1"]
                if (level < 2) {
                    // Rule 1 is forbidden by the rules (repeated predator-prey)
                    classes.push("text-danger")
                } else if (level < 8) {
                    // Rules 2->7 are mostly avoidable, except on very small tournaments
                    // Rule 4 (opponents twice) is ignored in tournaments with <5 tables 
                    classes.push("text-warning")
                } else {
                    // Rule 8 is unavoidable in small tournaments
                    // Rule 9 can be hard to satisfy
                    classes.push("text-info")
                }
                const icon = base.create_prepend(cell, "i", classes)
                this.tooltips.add(icon, message)
            }
        }
    }

    dragstart_row(ev: DragEvent) {
        this.player_drag.start(ev.currentTarget as HTMLTableRowElement)
    }

    dragenter_row(ev: DragEvent) {
        ev.preventDefault()
        const target = ev.currentTarget as HTMLElement
        const target_row = target.closest("tr")
        if (target_row) {
            this.player_drag.update(target_row)
        }
    }

    dragend_row(ev: DragEvent) {
        this.player_drag.end()
        this.display_seating_issues()
    }

    remove_row(row: HTMLTableRowElement) {
        const parent = row.parentElement as HTMLTableSectionElement
        if (!this.engine?.tournament) { return }
        const player_uid = row.dataset.player_uid
        if (!player_uid) { return }
        if (Object.hasOwn(this.engine.tournament.players, player_uid)) {
            this.container.select_modal.add(this.engine.tournament.players[player_uid])
        } else {
            console.log("Removing unregistered player", row)
        }
        row.remove()
        this.add_empty_row(parent)
    }

    add_empty_row(body: HTMLTableSectionElement) {
        const empty_row = base.create_append(body, "tr", ["align-middle"])
        base.create_append(empty_row, "th")
        base.create_append(empty_row, "td")
        base.create_append(empty_row, "td")
        const action_row = base.create_append(empty_row, "td", ["action-row"])
        const plus_button = base.create_append(action_row, "button", ["me-2", "btn", "btn-sm", "btn-primary"])
        plus_button.innerHTML = '<i class="bi bi-plus"></i>'
        plus_button.addEventListener("click", (ev) => { this.display_player_lookup_modal(empty_row) })
        // no dragstart for empty rows
        empty_row.addEventListener("dragenter", (ev) => this.dragenter_row(ev))
        empty_row.addEventListener("dragover", (ev) => ev.preventDefault())
        empty_row.addEventListener("dragend", (ev) => this.dragend_row(ev))
    }

    async reseat() {
        const round_seating: string[][] = []
        for (const table of this.iter_tables()) {
            const table_seating: string[] = []
            for (const player_uid of this.iter_player_uids(table)) {
                table_seating.push(player_uid)
            }
            if (table_seating.length > 0) {
                round_seating.push(table_seating)
            }
        }
        if (this.finals) {
            await this.engine.seat_finals(round_seating[0])
        } else {
            await this.engine.alter_seating(this.index, round_seating)
        }
    }

    setup_player_lookup_modal() {
        if (!this.engine?.tournament) { return }
        const players: d.Player[] = []
        // check the DOM (in case we're altering seating)
        const player_in_round = new Set<string>(this.iter_player_uids())
        for (const player of Object.values(this.engine.tournament.players)) {
            if (player_in_round.has(player.uid)) { continue }
            players.push(player)
        }
        this.container.select_modal.init((row, player) => this.add_player(row, player), players)
    }

    display_player_lookup_modal(empty_row: HTMLTableRowElement) {
        this.container.select_modal.show(empty_row)
    }

    add_player(empty_row, player: d.Player) {
        base.remove_children(empty_row)
        const actions = this.display_player(empty_row, player)
        this.display_reseat_actions(empty_row, actions)
        this.container.select_modal.remove(player)
    }
}
