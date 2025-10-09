import * as base from "../base"
import * as d from "../d"
import QrScanner from "qr-scanner"
import { Engine } from "../tournament/engine"


export interface DeckSubmitCallback {
    (player_uid: string, deck: string, round: number | undefined, attribution: boolean): Promise<void>
}

export class DeckSubmit {
    root: HTMLDivElement
    callback: DeckSubmitCallback
    qr_code_button: HTMLButtonElement
    qr_scanner: QrScanner | undefined
    video: HTMLVideoElement
    form: HTMLFormElement
    round_div: HTMLDivElement
    round_select: HTMLSelectElement
    deck_link: HTMLAnchorElement
    deck_div: HTMLDivElement
    deck: HTMLTextAreaElement
    deck_label: HTMLLabelElement
    attribution_checkbox: HTMLInputElement
    attribution_subtext: HTMLDivElement
    submit_button: HTMLButtonElement
    player_uid: string
    tournament: d.Tournament
    constructor(el: HTMLDivElement, callback: DeckSubmitCallback, modal_div: HTMLDivElement | undefined = undefined) {
        this.root = el
        this.callback = callback
        this.form = base.create_append(this.root, "form", ["w-100"])
        const deck_buttons_div = base.create_append(this.form, "div", ["d-md-flex"])
        this.deck_link = base.create_append(deck_buttons_div, "a",
            ["btn", "btn-vdb", "bg-vdb", "text-white", "me-2", "mb-2"],
            { target: "_blank" }
        )
        this.qr_code_button = base.create_append(deck_buttons_div, "button", ["btn", "btn-primary", "me-2", "mb-2"],
            { type: "button" }
        )
        this.qr_code_button.innerHTML = '<i class="bi bi-qr-code-scan"> Scan VDB</i>'
        this.video = base.create_append(this.form, "video", ["w-100"])
        this.video.hidden = true
        this.qr_code_button.addEventListener("click", async (ev) => { ev.preventDefault(); await this.toggle_video() })
        this.round_div = base.create_append(this.form, "div", ["input-group", "form-floating"])
        this.round_select = base.create_append(this.round_div, "select", ["form-select", "my-2"],
            { name: "round", id: "deckModalRoundInput" }
        )
        base.create_append(this.round_div, "label", ["form-label"], { for: "deckModalRoundInput" }).innerText = "Round"
        this.round_select.addEventListener("change", (ev) => this.display_round(this.round_select.selectedIndex + 1))
        this.deck_div = base.create_append(this.form, "div", ["input-group", "form-floating"])
        this.deck = base.create_append(this.deck_div, "textarea", ["form-control", "mb-2", "h-100"],
            { id: "deckModalTextInput", type: "text", autocomplete: "new-deck", rows: "10", maxlength: 10000 }
        )
        this.deck.ariaLabel = "Deck list (plain text or URL)"
        this.deck_label = base.create_append(this.deck_div, "label", ["form-label"], { for: "deckModalTextInput" })
        this.deck_label.innerText = "Deck list (plain text or URL)"

        // Attribution checkbox
        const attribution_div = base.create_append(this.form, "div", ["form-check", "mb-3"])
        this.attribution_checkbox = base.create_append(attribution_div, "input", ["form-check-input"],
            { type: "checkbox", id: "deckModalAttributionInput" }
        )
        const attribution_label = base.create_append(attribution_div, "label", ["form-check-label"],
            { for: "deckModalAttributionInput" }
        )
        attribution_label.innerText = "Allow attribution"
        this.attribution_checkbox.addEventListener("change", () => this.update_attribution_subtext())
        // Add explanatory subtext
        this.attribution_subtext = base.create_append(attribution_div, "div", ["form-text", "text-muted", "small", "fst-italic"])

        const btn_div = base.create_append(this.form, "div", ["col-auto"])
        this.submit_button = base.create_append(btn_div, "button", ["btn", "btn-primary", "me-2", "mb-2"],
            { type: "submit" }
        )
        this.submit_button.innerText = "Submit"
        this.form.addEventListener("submit", async (ev) => await this.submit(ev))
        if (modal_div) {
            this.root.addEventListener("hide.bs.modal", (ev) => this.stop_video())
        }
    }
    update_attribution_subtext() {
        if (this.attribution_checkbox.checked) {
            this.attribution_subtext.innerText =
                "Attribution: your deck will be displayed in archiving programs with your name, " +
                "or the author's name if specified in the decklist. "
        } else {
            this.attribution_subtext.innerText =
                "No attribution: your deck will be anonymous in archiving programs. " +
                "Note that if you reach finals, your deck may be displayed regardless."
        }
    }
    async toggle_video() {
        if (this.qr_scanner) {
            this.qr_scanner.stop()
            this.qr_scanner.destroy()
            this.qr_scanner = undefined
            this.video.hidden = true
            this.qr_code_button.innerHTML = '<i class="bi bi-qr-code-scan"> Scan VDB</i>'
        } else {
            this.video.hidden = false
            this.qr_scanner = new QrScanner(this.video, async (result) => this.scanned(result),
                { highlightScanRegion: true }
            )
            this.qr_code_button.innerHTML = '<i class="bi bi-qr-code-scan"> Stop scan</i>'
            await this.qr_scanner.start()
        }
    }
    stop_video() {
        if (this.qr_scanner) { this.toggle_video() }
    }
    init(
        player_uid: string,
        tournament: d.Tournament,
        round: number | undefined = undefined,
        submit_disabled: boolean = false
    ) {
        console.log("decksubmit init")
        this.player_uid = player_uid
        this.tournament = tournament
        this.deck.value = ""
        if (submit_disabled) {
            this.deck_div.hidden = true
            this.submit_button.hidden = true
            this.qr_code_button.disabled = true
        } else {
            this.deck_div.hidden = false
            this.submit_button.hidden = false
            this.qr_code_button.disabled = false
        }
        this.stop_video()
        base.remove_children(this.round_select)
        round = round ?? tournament.rounds.length
        if (tournament.multideck && round > 0) {
            this.round_select.hidden = false
            this.round_div.classList.add("visible")
            this.round_div.classList.remove("invisible")
            for (var idx = 1; idx <= tournament.rounds.length; idx++) {
                const option = base.create_element("option")
                if (idx == tournament.rounds.length && tournament.finals_seeds.length) {
                    option.label = "Finals"
                } else {
                    option.label = `Round ${idx}`
                }
                option.value = idx.toString()
                this.round_select.options.add(option)
            }
            this.round_select.selectedIndex = round - 1
            this.display_round(round)
        } else {
            this.round_div.classList.add("invisible")
            this.round_div.classList.remove("visible")
            this.round_select.selectedIndex = -1
            this.round_select.hidden = true
            this.display_round(0)
        }
    }
    display_round(round: number) {
        var current_deck: d.KrcgDeck | undefined = undefined
        console.log("display_round", round)
        if (this.tournament.multideck && round > 0) {
            for (const table of this.tournament.rounds[round - 1].tables) {
                for (const seating of table.seating) {
                    if (seating.player_uid == this.player_uid) {
                        current_deck = seating.deck ?? undefined
                    }
                }
            }
        } else {
            current_deck = this.tournament.players[this.player_uid]?.deck ?? undefined
        }
        if (current_deck?.vdb_link) {
            this.deck_link.href = current_deck.vdb_link
            this.deck_link.innerHTML = '<i class="bi bi-file-text"></i> View'
            this.deck_link.classList.remove("disabled")
            this.deck_label.innerText = 'Update deck list (plain text or URL)'
        } else {
            this.deck_link.innerHTML = "No decklist"
            this.deck_link.href = "javascript:void(0)"
            this.deck_link.classList.add("disabled")
            this.deck_label.innerText = "Deck list (plain text or URL)"
        }
        // Set attribution checkbox based on current deck's author field
        this.attribution_checkbox.checked = current_deck?.author ? true : false
        this.attribution_checkbox.dispatchEvent(new Event("change"))
    }
    scanned(result: QrScanner.ScanResult) {
        this.qr_scanner?.stop()
        this.deck.value = result.data
        this.form.dispatchEvent(new SubmitEvent("submit", { submitter: this.qr_scanner?.$video }))
    }
    async submit(ev: SubmitEvent) {
        ev.preventDefault()
        var round: number | undefined = undefined
        if (this.round_select.selectedIndex >= 0) {
            round = this.round_select.selectedIndex + 1
        }
        await this.callback(this.player_uid, this.deck.value, round, this.attribution_checkbox.checked)
    }
}

export class DeckModal extends base.Modal {
    engine: Engine
    deck_submit: DeckSubmit
    player_uid: string
    constructor(el: HTMLDivElement, engine: Engine) {
        super(el)
        this.engine = engine
        this.deck_submit = new DeckSubmit(this.modal_body, (a, b, c, d) => this.submit(a, b, c, d), this.modal_div)
    }
    async submit(player: string, deck: string, round: number | undefined, attribution: boolean) {
        const res = await this.engine.set_deck(player, deck, round, attribution)
        if (res) {
            this.modal.hide()
        }
    }
    show(engine: Engine, player: d.Player, submit_disabled: boolean) {
        this.engine = engine
        this.modal_title.innerText = `${player.name}'s deck`
        this.deck_submit.init(player.uid, engine.tournament, undefined, submit_disabled)
        this.modal.show()
    }
}
