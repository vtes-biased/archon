import * as d from "../d"
import * as base from "../base"
import * as events from "../events"
import { v4 as uuidv4 } from "uuid"
import * as seating from "../seating"

export interface DisplayCallback {
    (tournament: d.Tournament, round_change: boolean): void
}

export class Engine {
    token: base.Token
    display_callback: DisplayCallback
    tournament: d.Tournament

    constructor(token: base.Token, display_callback: DisplayCallback) {
        this.token = token
        this.display_callback = display_callback
    }
    async init(tournament_uid: string) {
        const res = await base.do_fetch_with_token(`/api/tournaments/${tournament_uid}`, this.token, { method: "get" })
        if (!res) { return }
        this.tournament = await res.json() as d.Tournament
    }
    async update_config(modification: Object) {
        if (!this.tournament) { return }
        const config = {
            name: this.tournament.name,
            format: this.tournament.format,
            start: this.tournament.start,
            timezone: this.tournament.timezone,
            uid: this.tournament.uid,
            rank: this.tournament.rank,
            country: this.tournament.country,
            venue: this.tournament.venue,
            venue_url: this.tournament.venue_url,
            address: this.tournament.address,
            map_url: this.tournament.map_url,
            online: this.tournament.online,
            proxies: this.tournament.proxies,
            multideck: this.tournament.multideck,
            decklist_required: this.tournament.decklist_required,
            finish: this.tournament.finish,
            description: this.tournament.description,
            league: this.tournament.league,
            judges: this.tournament.judges,
            standings_mode: this.tournament.standings_mode,
            decklists_mode: this.tournament.decklists_mode,
            max_rounds: this.tournament.max_rounds,
            limited: this.tournament.limited,
        } as d.TournamentConfig
        Object.assign(config, modification)
        const res = await base.do_fetch_with_token(
            `/api/tournaments/${this.tournament.uid}`,
            this.token,
            { method: "put", body: JSON.stringify(config) }
        )
        if (!res) { return }
        this.tournament = await res.json() as d.Tournament
        this.display_callback(this.tournament, false)
    }
    async handle_tournament_event(tev: events.TournamentEvent): Promise<boolean> {
        if (!this.tournament) { return false }
        console.log("handle event", tev)
        // TODO: implement offline mode
        const res = await base.do_fetch_with_token(
            `/api/tournaments/${this.tournament.uid}/event`, this.token,
            { method: "post", body: JSON.stringify(tev) }
        )
        if (!res) { return false }
        this.tournament = await res.json() as d.Tournament
        await this.display_callback(
            this.tournament, [
                events.EventType.ROUND_START,
                events.EventType.ROUND_FINISH,
                events.EventType.ROUND_CANCEL,
                events.EventType.SEED_FINALS,
                events.EventType.FINISH_TOURNAMENT
            ].includes(tev.type)
        )
        return true
    }
    async register_player(member: d.Person): Promise<boolean> {
        const event: events.Register = {
            type: events.EventType.REGISTER,
            uid: uuidv4(),
            name: member.name,
            vekn: member.vekn ?? "",
            player_uid: member.uid,
            country: member.country ?? "",
            city: member.city ?? "",
        }
        return await this.handle_tournament_event(event)
    }
    async check_in(player_uid: string, code: string | undefined = undefined): Promise<boolean> {
        const event: events.CheckIn = {
            type: events.EventType.CHECK_IN,
            uid: uuidv4(),
            player_uid: player_uid,
            code: code,
        }
        return await this.handle_tournament_event(event)
    }
    async check_everyone_in(): Promise<boolean> {
        const event: events.CheckEveryoneIn = {
            type: events.EventType.CHECK_EVERYONE_IN,
            uid: uuidv4(),
        }
        return await this.handle_tournament_event(event)
    }
    async check_out(player_uid: string): Promise<boolean> {
        const event: events.CheckOut = {
            type: events.EventType.CHECK_OUT,
            uid: uuidv4(),
            player_uid: player_uid,
        }
        return await this.handle_tournament_event(event)
    }
    async drop(player_uid: string): Promise<boolean> {
        const event: events.Drop = {
            type: events.EventType.DROP,
            uid: uuidv4(),
            player_uid: player_uid,
        }
        return await this.handle_tournament_event(event)
    }
    async open_registration(): Promise<boolean> {
        const event: events.OpenRegistration = {
            type: events.EventType.OPEN_REGISTRATION,
            uid: uuidv4(),
        }
        return await this.handle_tournament_event(event)
    }
    async close_registration(): Promise<boolean> {
        const event: events.CloseRegistration = {
            type: events.EventType.CLOSE_REGISTRATION,
            uid: uuidv4(),
        }
        return await this.handle_tournament_event(event)
    }
    async open_checkin(): Promise<boolean> {
        const event: events.OpenCheckin = {
            type: events.EventType.OPEN_CHECKIN,
            uid: uuidv4(),
        }
        return await this.handle_tournament_event(event)
    }
    async cancel_checkin() {
        const event: events.CancelCheckin = {
            type: events.EventType.CANCEL_CHECKIN,
            uid: uuidv4(),
        }
        await this.handle_tournament_event(event)
    }
    async start_round(): Promise<boolean> {
        if (!this.tournament) { return false }
        const contenders = Object.values(this.tournament.players ?? {})
            .filter(p => p.state === d.PlayerState.CHECKED_IN)
            .map(p => p.uid)
        const s = seating.initial_seating(
            (this.tournament.rounds ?? [])
                .map(r => r.tables
                    .map(t => t.seating
                        .map(s => s.player_uid)
                    )
                ),
            contenders
        )
        const event: events.RoundStart = {
            type: events.EventType.ROUND_START,
            uid: uuidv4(),
            seating: s
        }
        return await this.handle_tournament_event(event)
    }
    async override_table(round_number: number, table_number: number, comment: string): Promise<boolean> {
        const event: events.Override = {
            type: events.EventType.OVERRIDE,
            uid: uuidv4(),
            round: round_number,
            table: table_number,
            comment: comment,
        }
        return await this.handle_tournament_event(event)
    }
    async unoverride_table(round_number: number, table_number: number): Promise<boolean> {
        const event: events.Unoverride = {
            type: events.EventType.UNOVERRIDE,
            uid: uuidv4(),
            round: round_number,
            table: table_number,
        }
        return await this.handle_tournament_event(event)
    }
    async set_score(player_uid: string, round_number: number, vps: number): Promise<boolean> {
        const event: events.SetResult = {
            type: events.EventType.SET_RESULT,
            uid: uuidv4(),
            player_uid: player_uid,
            round: round_number,
            vps: vps,
        }
        return await this.handle_tournament_event(event)
    }
    async set_deck(
        player_uid: string,
        deck: string,
        round: number | undefined = undefined,
        attribution: boolean = false
    ): Promise<boolean> {
        const tev = {
            uid: uuidv4(),
            type: events.EventType.SET_DECK,
            player_uid: player_uid,
            deck: deck,
            round: round ?? null,
            attribution: attribution,
        } as events.SetDeck
        return await this.handle_tournament_event(tev)
    }
    async finish_round(): Promise<boolean> {
        const event: events.RoundFinish = {
            type: events.EventType.ROUND_FINISH,
            uid: uuidv4(),
        }
        return await this.handle_tournament_event(event)
    }
    async cancel_round(): Promise<boolean> {
        const event: events.RoundCancel = {
            type: events.EventType.ROUND_CANCEL,
            uid: uuidv4(),
        }
        return await this.handle_tournament_event(event)
    }
    async seed_finals(seeds: string[], toss: Record<string, number>): Promise<boolean> {
        const event: events.SeedFinals = {
            type: events.EventType.SEED_FINALS,
            uid: uuidv4(),
            seeds: seeds,
            toss: toss,
        }
        return await this.handle_tournament_event(event)
    }
    async alter_seating(round: number, seating: string[][]): Promise<boolean> {
        const event: events.RoundAlter = {
            type: events.EventType.ROUND_ALTER,
            uid: uuidv4(),
            round: round,
            seating: seating,
        }
        return await this.handle_tournament_event(event)
    }
    async seat_finals(seating: string[]): Promise<boolean> {
        const event: events.SeatFinals = {
            type: events.EventType.SEAT_FINALS,
            uid: uuidv4(),
            seating: seating,
        }
        return await this.handle_tournament_event(event)
    }
    async finish_tournament(): Promise<boolean> {
        const event: events.FinishTournament = {
            type: events.EventType.FINISH_TOURNAMENT,
            uid: uuidv4(),
        }
        return await this.handle_tournament_event(event)
    }
    async set_vekn(vekn_id: string) {
        const res = await base.do_fetch_with_token(
            `/api/tournaments/${this.tournament.uid}/set-vekn/${vekn_id}`,
            this.token, { method: "post" }
        )
        if (res) {
            await this.display_callback(this.tournament, false)
        }
    }
    async vekn_sync(rounds: number | undefined = undefined) {
        if (!rounds) {
            rounds = Math.max(1, (this.tournament?.rounds ?? []).length)
        }
        const res = await base.do_fetch_with_token(
            `/api/tournaments/${this.tournament.uid}/vekn-sync/${rounds}`,
            this.token,
            { method: "post" }
        )
        if (res) {
            await this.display_callback(this.tournament, false)
        }
    }
    async delete_tournament() {
        const res = await base.do_fetch_with_token(
            `/api/tournaments/${this.tournament.uid}`,
            this.token,
            { method: "delete" }
        )
        if (!res) { return }
        window.location.href = "/tournament/list.html"
    }
}