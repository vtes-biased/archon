import * as bootstrap from "bootstrap"
import * as base from "../../base"
import * as d from "../../d"
import * as member from "../../member"
import * as utils from "../../utils"
import { ScoreModal } from "../../modals/score"
import { DeckModal } from "../../modals/deck"
import { CheckInModal } from "../../modals/check_in"
import { Engine } from "../../tournament/engine"
import { BaseTournamentDisplay } from "./base"

export class PlayerDisplay extends BaseTournamentDisplay {
    base: HTMLDivElement
    user: d.Person | undefined
    engine: Engine
    cutoff: d.Score | undefined
    deck_infos: d.DeckInfo[] | undefined
    confirmation_modal: base.ConfirmationModal
    checkin_modal: CheckInModal
    deck_modal: DeckModal
    score_modal: ScoreModal
    tooltips: base.TooltipManager
    constructor(root: HTMLDivElement) {
        const new_root = base.create_append(root, "div")
        super(new_root)
        this.tooltips = new base.TooltipManager()
        this.confirmation_modal = new base.ConfirmationModal(root)
        this.checkin_modal = new CheckInModal(root)
        this.deck_modal = new DeckModal(root, this.engine)
        this.score_modal = new ScoreModal(root, this.engine)
        this.alert = base.create_prepend(root, "div", ["alert"], { role: "alert" })
        this.base = new_root
    }
    async init(
        token: base.Token | undefined,
        cutoff: d.Score | undefined = undefined,
        deck_infos: d.DeckInfo[] | undefined = undefined
    ) {
        super.init(token)
        this.cutoff = cutoff
        this.deck_infos = deck_infos
        if (this.token) {
            const res = await base.do_fetch_with_token(`/api/vekn/members/${this.user_id}`, this.token, {})
            if (res) {
                this.user = await res.json() as d.Person
            }
        } else {
            this.user = undefined
        }
        this.engine = new Engine(token, (tournament, round_change) => this.display(tournament))
    }
    display(tournament: d.TournamentConfig | d.Tournament) {
        this.tooltips.dispose()
        base.remove_children(this.base)
        if (this.user_id) {
            this.engine.tournament = tournament as d.Tournament
        } else {
            this.engine.tournament = undefined
        }
        base.create_append(this.base, "h1", ["mb-2"]).innerText = tournament.name
        this.display_header(tournament)
        if (this.user_id && !(
            tournament.state == d.TournamentState.FINALS ||
            tournament.state == d.TournamentState.FINISHED
        )) {
            this.display_contenders(tournament as d.Tournament)
        }
        if (this.user_id) {
            this.display_user_info(tournament as d.Tournament)
        }
        this.display_venue(tournament)
        this.display_judges(tournament)
        this.display_description(tournament)
        if (this.user_id && (
            tournament.standings_mode == d.StandingsMode.PUBLIC ||
            tournament.standings_mode == d.StandingsMode.TOP_10 ||
            tournament.state == d.TournamentState.FINALS ||
            tournament.state == d.TournamentState.FINISHED
        )) {
            this.display_standings(tournament as d.Tournament)
        }
        if (this.deck_infos) {
            this.display_decks()
        }
    }
    display_user_info(tournament: d.Tournament) {
        if (!this.user && tournament.state != d.TournamentState.FINISHED) {
            this.set_alert('You need to <a href="/login.html">login</a> to participate.', d.AlertLevel.INFO)
            return
        }
        const is_admin = member.can_admin_tournament(this.user, tournament)
        const current_round = tournament.rounds.length
        const started = current_round > 0
        const first_round_checkin = (tournament.state == d.TournamentState.WAITING && !started)
        const buttons_div = base.create_append(this.root, "div", ["align-items-center", "my-2"])
        if (is_admin) {
            base.create_append(buttons_div, "a", ["btn", "btn-warning", "text-nowrap", "me-2", "mb-2"],
                { href: `/tournament/${tournament.uid}/console.html` }
            ).innerText = "Tournament Manager"
        }
        // _________________________________________________________________________________________ User not registered
        if (!Object.hasOwn(tournament.players, this.user.uid)) {
            if (tournament.state == d.TournamentState.FINISHED) {
                return
            }
            if (tournament.state == d.TournamentState.FINALS) {
                this.set_alert("Finals in progress: you are not participating", d.AlertLevel.INFO)
                return
            }
            if (tournament.state == d.TournamentState.PLANNED) {
                this.set_alert(
                    "Registration has not opened yet <br>" +
                    "<em>Please check back later or contact a Judge to register you</em>",
                    d.AlertLevel.INFO
                )
                return
            }
            if (!this.user.vekn || this.user.vekn.length < 1) {
                this.set_alert(
                    "A VEKN ID# is required to register to this event: " +
                    "claim your VEKN ID#, if you have one, in your " +
                    `<a class="alert-link" href="/member/${this.user.uid}/display.html">Profile</a><br>` +
                    "<em>If you hav no VEKN ID#, ask a Judge or an organizer to register you</em>"
                    , d.AlertLevel.WARNING
                )
                return
            }
            if (tournament.state == d.TournamentState.REGISTRATION || first_round_checkin) {
                this.set_alert("You can register to this tournament", d.AlertLevel.INFO)
                this.display_user_register(buttons_div)
                return
            }
            this.set_alert(
                "Tournament in progress: you are not participating <br>" +
                "<em>Either ask a Judge to check you in, or register for next round</em>",
                d.AlertLevel.WARNING
            )
            this.display_user_register(buttons_div)
            return
        }
        // _______________________________________________________________________________________________ ADD: Decklist
        // in all cases, even after the tournament's finished, allow players to upload their decklist
        const player = tournament.players[this.user.uid]
        if (!tournament.multideck || tournament.rounds.length > 0) {
            this.display_user_set_deck(tournament, buttons_div)
        }
        // display past rounds seating and results
        if (tournament.rounds.length > 0) {
            var max_round = tournament.rounds.length
            if (tournament.state == d.TournamentState.PLAYING) {
                max_round -= 1
            }
            if (tournament.state == d.TournamentState.FINALS || tournament.state == d.TournamentState.FINISHED) {
                max_round -= 1
            }
            if (max_round > 0) {
                const accordion = base.create_append(this.root, "div", ["accordion"], { id: "pastRoundsAccordion" })
                for (var idx = 0; idx < max_round; idx++) {
                    const round = tournament.rounds[idx]
                    var player_table: d.Table = undefined
                    var player_seat: d.TableSeat = undefined
                    for (const table of round.tables) {
                        for (const seat of table.seating) {
                            if (seat.player_uid == player.uid) {
                                player_table = table
                                player_seat = seat
                                break
                            }
                        }
                        if (player_seat) {
                            break
                        }
                    }
                    if (!player_seat) { continue }
                    const id = `prev-round-col-item-${idx}`
                    const head_id = `prev-round-col-head-${idx}`
                    const item = base.create_append(accordion, "div", ["accordion-item"])
                    const header = base.create_append(item, "h2", ["accordion-header"], { id: head_id })
                    const button = base.create_append(header, "button", ["accordion-button", "collapsed"], {
                        type: "button",
                        "data-bs-toggle": "collapse",
                        "data-bs-target": `#${id}`,
                        "aria-expanded": "false",
                        "aria-controls": id,
                    })
                    button.innerText = `Round ${idx + 1}`
                    if (player_seat) {
                        const badge = base.create_append(button, "div", ["badge", "ms-2", "text-bg-secondary"])
                        badge.innerText = utils.score_string(player_seat.result)
                    } else {
                        const badge = base.create_append(button, "div", ["badge", "ms-2", "text-bg-danger"])
                        badge.innerText = "No play"
                    }
                    const collapse = base.create_append(item, "div", ["accordion-collapse", "collapse"], {
                        "aria-labelledby": head_id, "data-bs-parent": "#pastRoundsAccordion"
                    })
                    collapse.id = id
                    const body = base.create_append(collapse, "div", ["accordion-body"])
                    this.display_user_table(tournament, player, body, player_table)
                }
                [].slice.call(accordion.querySelectorAll(".collapse")).map(
                    (el: HTMLDivElement) => new bootstrap.Collapse(el, { toggle: false, parent: accordion })
                )
            }
        }
        // _________________________________________________________________________________________ Tournament Finished
        if (tournament.state == d.TournamentState.FINISHED) {
            if (tournament.winner == player.uid) {
                this.set_alert(
                    "Tournament finished: you won, congratulations!",
                    d.AlertLevel.WARNING
                )
            }
            // no message otherwise. Participation appears in standings.
            return
        }
        // _________________________________________________________________________________________________ ADD: Status
        var status: string
        switch (tournament.state) {
            case d.TournamentState.PLANNED:
                status = "Tournament planned — Registrations not yet open"
                break;
            case d.TournamentState.REGISTRATION:
                if (current_round > 0) {
                    status = `Round ${current_round} finished`
                } else {
                    status = "Registrations open"
                }
                break;
            case d.TournamentState.WAITING:
                status = `Round ${current_round + 1} begins soon — Check-in open`
                break;
            case d.TournamentState.PLAYING:
                status = `Round ${current_round} in progress`
                if (player.state == d.PlayerState.PLAYING) {
                    status += ` — Your table: Table ${player.table}`
                }
                break;
            case d.TournamentState.FINALS:
                status = `Finals in progress`
                if (player.state == d.PlayerState.PLAYING) {
                    status += ` — You play ${utils.ordinal(player.seed)} seed`
                }
                break;
        }
        const status_title = base.create_append(this.root, "h2", ["my-2"])
        status_title.innerHTML = status
        // ______________________________________________________________________________________________________ Finals
        if (tournament.state == d.TournamentState.FINALS) {
            if (player.state == d.PlayerState.PLAYING) {
                this.set_alert("You play the finals", d.AlertLevel.SUCCESS)
                this.display_current_user_table(tournament, player)
            } else {
                this.set_alert("Finals in progress: you are not participating", d.AlertLevel.INFO)
                // TODO: it would be nice to be able to link live streams here
            }
            return
        }

        // ______________________________________________________________________________________ Finished before finals
        if (player.state == d.PlayerState.FINISHED) {
            if (player.barriers.includes(d.Barrier.BANNED)) {
                this.set_alert(
                    "You are banned from tournament play by the VEKN <br>" +
                    `<em>Check your <a class="alert-link" href="/member/${this.user.uid}/display.html">Profile</a> ` +
                    "for more information</em>",
                    d.AlertLevel.DANGER
                )
                return
            }
            if (player.barriers.includes(d.Barrier.DISQUALIFIED)) {
                this.set_alert(
                    "You have been disqualified <br>" +
                    `<em>Check your <a class="alert-link" href="/member/${this.user.uid}/display.html">Profile</a> ` +
                    "for more information</em>",
                    d.AlertLevel.DANGER
                )
                return
            }
            this.set_alert(
                "You have dropped out of this tournament <br>" +
                "<em>You can register back</em>",
                d.AlertLevel.WARNING
            )
            this.display_user_register(buttons_div)
            return
        }
        // ____________________________________________________________________________________________ ADD: Drop button
        {
            const drop_button = base.create_append(buttons_div, "button",
                ["btn", "btn-danger", "text-nowrap", "me-2", "mb-2"]
            )
            drop_button.innerHTML = '<i class="bi bi-x-circle-fill"></i> Drop from the tournament'
            this.tooltips.add(drop_button, "Let the organizers know you are leaving")
            drop_button.addEventListener("click", (ev) => {
                this.confirmation_modal.show(
                    "You will not participate in future rounds",
                    () => this.engine.drop(player.uid)
                )
            })
        }
        // _____________________________________________________________________________________ Cutoff (standings mode)
        if (tournament.standings_mode == d.StandingsMode.CUTOFF && this.cutoff) {
            const cutoff_div = base.create_append(this.root, "div", ["my-2", "text-bg-info", "rounded", "p-2"])
            cutoff_div.innerHTML = `<strong>Cutoff for top 5:</strong> ${utils.score_string(this.cutoff)}`
        }
        // ______________________________________________________________________________________ Planned / Registration
        if (tournament.state in [d.TournamentState.PLANNED, d.TournamentState.REGISTRATION]) {
            this.set_alert(
                "You are registered <br>" +
                "<em>You can upload (and re-upload) you deck list at any time until the first round starts — " +
                "not even judges can see your deck list until it starts</em>",
                d.AlertLevel.SUCCESS
            )
            return
        }
        // _____________________________________________________________________________________________________ Playing
        if (tournament.state == d.TournamentState.PLAYING) {
            if (player.state != d.PlayerState.PLAYING) {
                this.set_alert(
                    "You are not playing <br> " +
                    "<em>Contact a judge urgently if you should be</em>",
                    d.AlertLevel.DANGER
                )
                return
            }
            this.set_alert(`You are playing on table ${player.table}, seat ${player.seat}`, d.AlertLevel.SUCCESS)
            this.display_current_user_table(tournament, player)
            return
        }
        // ____________________________________________________________________________________________________ Check-In
        if (tournament.state == d.TournamentState.WAITING) {
            if (player.state == d.PlayerState.CHECKED_IN) {
                this.set_alert(`You are checked in and ready to play`, d.AlertLevel.SUCCESS)
                return
            }
            const tooltip_span = base.create_append(buttons_div, "span", [], { tabindex: "0" })
            const checkin_button = base.create_append(tooltip_span, "button",
                ["btn", "btn-primary", "text-nowrap", "me-2", "mb-2"]
            )
            checkin_button.innerHTML = '<i class="bi bi-qr-code-scan"> Check In</i>'
            if (player.barriers.length == 0) {
                checkin_button.disabled = false
                checkin_button.addEventListener("click", (ev) => this.checkin_modal.show(this.engine, player))
                this.set_alert(
                    "You need to check in to play the next round <br>" +
                    "<em>If you do not check in, you will not play<em>",
                    d.AlertLevel.WARNING
                )
                return
            }
            checkin_button.disabled = true
            if (player.barriers.includes(d.Barrier.BANNED)) {
                const msg = "You are banned from tournament play by the VEKN"
                this.set_alert(msg, d.AlertLevel.DANGER)
                this.tooltips.add(tooltip_span, msg)
                return
            }
            if (player.barriers.includes(d.Barrier.DISQUALIFIED)) {
                const msg = "You have been disqualified"
                this.set_alert(msg, d.AlertLevel.DANGER)
                this.tooltips.add(tooltip_span, msg)
                return
            }
            if (player.barriers.includes(d.Barrier.MAX_ROUNDS)) {
                const msg = "You have played the maximum number of rounds"
                this.set_alert(msg, d.AlertLevel.INFO)
                this.tooltips.add(tooltip_span, msg)
                return
            }
            if (player.barriers.includes(d.Barrier.MISSING_DECK)) {
                const msg = "You must upload your deck list"
                this.set_alert(msg, d.AlertLevel.WARNING)
                this.tooltips.add(tooltip_span, msg)
                return
            }
        }
        return
    }
    display_user_register(buttons_div: HTMLDivElement) {
        const register_button = base.create_append(buttons_div, "button",
            ["btn", "btn-success", "text-nowrap", "me-2", "mb-2"]
        )
        register_button.innerText = "Register"
        register_button.addEventListener("click", (ev) => this.engine.register_player(this.user))
    }
    display_user_set_deck(tournament: d.Tournament, buttons_div: HTMLDivElement) {
        const current_round = tournament.rounds.length
        const player = tournament.players[this.user.uid]
        const tooltip_span = base.create_append(buttons_div, "span", [], { tabindex: "0" })
        const upload_deck_button = base.create_append(tooltip_span, "button",
            ["btn", "btn-primary", "text-nowrap", "me-2", "mb-2"]
        )
        upload_deck_button.innerText = "Decklist"
        if (tournament.decklist_required && current_round > 0) {
            if (player.deck) {
                this.tooltips.add(tooltip_span, "Only a judge can modify your deck list")
            } else {
                const alert = base.create_prepend(this.root, "div",
                    ["alert", "alert-danger", "alert-dismissible", "fade", "show"],
                    { role: "alert" }
                )
                alert.innerText = `You must upload your deck list`
                base.create_append(alert, "button", ["btn-close"],
                    { type: "button", "data-bs-dismiss": "alert", "arial-label": "Close" }
                )
                bootstrap.Alert.getOrCreateInstance(alert)
                this.tooltips.add(tooltip_span,
                    "Once uploaded, you will not be able to modify your decklist"
                )
            }
        } else {
            this.tooltips.add(tooltip_span,
                "You can re-upload a new version anytime before the tournament begins"
            )
        }
        var submit_disabled = false
        if (player.deck && tournament.decklist_required && current_round > 0) {
            submit_disabled = true
            upload_deck_button.classList.remove("btn-primary")
            upload_deck_button.classList.add("btn-secondary")
        }
        upload_deck_button.addEventListener("click", (ev) => {
            this.deck_modal.show(this.engine, player, submit_disabled)
        })

        // Add VDB link button if player has uploaded a deck
        if (tournament.multideck && current_round > 0) {
            // For multideck tournaments, create a dropdown to select which round's deck to view
            const vdb_container = base.create_append(buttons_div, "div", ["d-flex", "me-2", "mb-2"])
            const vdb_round_select = base.create_append(vdb_container, "select", ["form-select", "me-2"])
            const vdb_link = base.create_append(vdb_container, "a",
                ["btn", "btn-vdb", "bg-vdb", "text-white", "text-nowrap"],
                { target: "_blank" }
            )
            vdb_link.innerHTML = '<i class="bi bi-file-text"></i> View Deck'

            // Populate round options
            for (var idx = 1; idx <= tournament.rounds.length; idx++) {
                const option = base.create_element("option")
                if (idx == tournament.rounds.length && tournament.finals_seeds.length) {
                    option.label = "Finals"
                } else {
                    option.label = `Round ${idx}`
                }
                option.value = idx.toString()
                vdb_round_select.options.add(option)
            }

            // Function to update VDB link based on selected round
            const updateVdbLink = () => {
                const selected_round = parseInt(vdb_round_select.value)
                var round_deck = undefined
                for (const table of tournament.rounds[selected_round - 1].tables) {
                    for (const seating of table.seating) {
                        if (seating.player_uid == this.user.uid) {
                            round_deck = seating.deck ?? undefined
                            break
                        }
                    }
                }

                if (round_deck?.vdb_link) {
                    vdb_link.href = round_deck.vdb_link
                    vdb_link.classList.remove("disabled")
                    vdb_link.style.pointerEvents = "auto"
                } else {
                    vdb_link.href = "javascript:void(0)"
                    vdb_link.classList.add("disabled")
                    vdb_link.style.pointerEvents = "none"
                }
            }

            vdb_round_select.addEventListener("change", updateVdbLink)
            vdb_round_select.selectedIndex = current_round - 1
            updateVdbLink()

            const vdb_tooltip_span = base.create_append(buttons_div, "span", [], { tabindex: "0" })
            this.tooltips.add(vdb_tooltip_span, "Select round and view your deck in VDB")
        } else {
            // For single deck tournaments, show simple VDB link
            if (player.deck?.vdb_link) {
                const vdb_link = base.create_append(buttons_div, "a",
                    ["btn", "btn-vdb", "bg-vdb", "text-white", "text-nowrap", "me-2", "mb-2"],
                    { href: player.deck.vdb_link, target: "_blank" }
                )
                vdb_link.innerHTML = '<i class="bi bi-file-text"></i> View Deck'
                const vdb_tooltip_span = base.create_append(buttons_div, "span", [], { tabindex: "0" })
                this.tooltips.add(vdb_tooltip_span, "View your deck in VDB")
            }
        }
    }
    display_current_user_table(tournament: d.Tournament, player: d.Player) {
        const current_round = tournament.rounds.length
        const player_table = tournament.rounds[current_round - 1].tables[player.table - 1]
        this.display_user_table(tournament, player, this.root, player_table, true)
    }
    display_user_table(
        tournament: d.Tournament,
        player: d.Player,
        el: HTMLElement,
        player_table: d.Table,
        current: boolean = false
    ) {
        const table_div = base.create_append(el, "div")
        const table = base.create_append(table_div, "table", ["table", "table-sm", "table-responsive"])
        const head = base.create_append(table, "thead")
        const tr = base.create_append(head, "tr", ["align-middle", "smaller-font"])
        var headers: Array<string>
        if (current && tournament.state != d.TournamentState.FINALS) {
            headers = ["Seat", "VEKN#", "Name", "Score", ""]
        } else {
            headers = ["Seat", "VEKN#", "Name", "Score"]
        }
        for (const label of headers) {
            const th = base.create_append(tr, "th", [], { scope: "col" })
            th.innerText = label
        }
        const body = base.create_append(table, "tbody")
        for (const [idx, seat] of player_table.seating.entries()) {
            const seat_player = tournament.players[seat.player_uid]
            const row = base.create_append(body, "tr", ["align-middle"])
            var cell_cls = ["text-nowrap"]
            var name_cls = ["w-100", "smaller-font"]
            if (player.uid == seat_player.uid) {
                cell_cls.push("bg-primary-subtle")
                name_cls.push("bg-primary-subtle")
            }
            if (tournament.state == d.TournamentState.FINALS) {
                base.create_append(row, "td", cell_cls).innerHTML = utils.full_score_string(seat_player)
                base.create_append(row, "td", cell_cls).innerText = seat_player.vekn
            } else {
                base.create_append(row, "th", cell_cls, { scope: "row" }).innerText = (idx + 1).toString()
                base.create_append(row, "td", cell_cls).innerText = seat_player.vekn
            }
            base.create_append(row, "td", name_cls).innerText = seat_player.name
            base.create_append(row, "td", cell_cls).innerText = utils.score_string(seat.result)
            if (current && tournament.state != d.TournamentState.FINALS) {
                const actions = base.create_append(row, "td", cell_cls)
                const changeButton = base.create_append(actions, "button",
                    ["me-2", "mb-2", "btn", "btn-sm", "btn-primary"]
                )
                changeButton.innerHTML = '<i class="bi bi-pencil"></i>'
                changeButton.addEventListener("click", (ev) => {
                    this.score_modal.show(
                        seat_player,
                        tournament.rounds.length,
                        player_table.seating.length,
                        seat.result?.vp ?? 0
                    )
                })
            }
        }
    }
    display_contenders(tournament: d.Tournament) {
        const accordion = base.create_append(this.base, "div", ["accordion"], { id: "contendersAccordion" })
        const item = base.create_append(accordion, "div", ["accordion-item"])
        const header = base.create_append(item, "h2", ["accordion-header"], { id: "contendersAccordionHeader" })
        const button = base.create_append(header, "button", ["accordion-button", "collapsed"], {
            type: "button",
            "data-bs-toggle": "collapse",
            "data-bs-target": "#contendersCollapse",
            "aria-expanded": "false",
            "aria-controls": "contendersCollapse",
        })
        button.innerText = `${Object.getOwnPropertyNames(tournament.players).length} contenders`
        const collapse = base.create_append(item, "div", ["accordion-collapse", "collapse"], {
            "aria-labelledby": "contendersAccordionHeader", "data-bs-parent": "#pastRoundsAccordion"
        })
        collapse.id = "contendersCollapse"
        const body = base.create_append(collapse, "div", ["accordion-body"])
        if (this.user) {
            const ul = base.create_append(body, "ul")
            for (const player of Object.values(tournament.players).sort(
                (a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" })
            )) {
                const list_item = base.create_append(ul, "li")
                if (player.vekn) {
                    list_item.innerText = `${player.name} (#${player.vekn})`
                } else {
                    list_item.innerText = player.name
                }
            }
        } else {
            const message = base.create_append(body, "div", ["alert", "alert-info"])
            message.innerHTML = (
                "Only members can see other members names. Please " +
                '<a href="/login.html">login</a>'
            )
        }
    }
    display_decks() {
        if (!this.deck_infos) { return }
        base.create_append(this.root, "h2", ["mt-4"]).innerText = "Decks"
        const table = base.create_append(this.root, "table", ["table", "table-striped"])
        const thead = base.create_append(table, "thead")
        const tr = base.create_append(thead, "tr", ["align-middle"])
        for (const header of ["Score", "Name"]) {
            base.create_append(tr, "th", [], { scope: "col" }).innerText = header
        }
        const tbody = base.create_append(table, "tbody")
        for (const deck of this.deck_infos) {
            const tr = base.create_append(tbody, "tr", ["align-middle"])
            const classes = ["text-nowrap"]
            if (deck.winner) {
                classes.push("bg-warning-subtle")
            } else if (deck.finalist) {
                classes.push("bg-primary-subtle")
            }
            base.create_append(tr, "td", classes).innerText = utils.score_string(deck.score)
            const name_cell = base.create_append(tr, "th", classes, { scope: "row" })
            const deck_link = base.create_append(name_cell, "a", [], {})
            const name = utils.constrain_string(deck.deck.name, 50)
            deck_link.innerText = name ?? ""
            deck_link.href = deck.deck.vdb_link ?? ""
        }
    }
}
