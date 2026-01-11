import * as d from "../d"
import * as base from "../base"
import * as events from "../events"
import * as offline from "../offline"
import * as localEngine from "./local_engine"
import { v4 as uuidv4 } from "uuid"
import * as seating from "../seating"

export interface DisplayCallback {
    (tournament: d.Tournament, round_change: boolean): void
}

export class Engine {
    token: base.Token
    display_callback: DisplayCallback
    tournament: d.Tournament
    offline: boolean = false

    constructor(token: base.Token, display_callback: DisplayCallback) {
        this.token = token
        this.display_callback = display_callback
    }

    /**
     * Initialize the engine. Checks IndexedDB for offline data first.
     */
    async init(tournament_uid: string) {
        // First: check if we have offline data for this tournament
        const offlineData = await offline.getOfflineTournament(tournament_uid)
        const user_uid = base.user_uid_from_token(this.token)

        if (offlineData && offlineData.owner_uid === user_uid) {
            // Resume offline mode from local storage
            console.log('Resuming offline mode from IndexedDB')
            this.tournament = offlineData.tournament
            this.offline = true
            return
        }

        // Otherwise: try to fetch from server
        try {
            const res = await base.do_fetch_with_token(
                `/api/tournaments/${tournament_uid}`, this.token, { method: "get" }
            )
            if (!res) {
                // Network error - check if we have stale offline data to recover
                if (offlineData) {
                    console.warn('Network error, resuming from offline data')
                    this.tournament = offlineData.tournament
                    this.offline = true
                }
                return
            }
            this.tournament = await res.json() as d.Tournament
        } catch (e) {
            // Network error - check if we have stale offline data to recover
            if (offlineData) {
                console.warn('Network error, resuming from offline data')
                this.tournament = offlineData.tournament
                this.offline = true
            } else {
                throw e  // No local data, can't proceed
            }
        }
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

        if (this.offline) {
            return this.handle_event_offline(tev)
        }

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

    /**
     * Handle event while in offline mode
     */
    handle_event_offline(tev: events.TournamentEvent): boolean {
        // Apply event locally
        localEngine.applyEvent(this.tournament, tev)
        // Persist to IndexedDB
        offline.updateOfflineTournament(this.tournament)
        // Update display
        this.display_callback(
            this.tournament,
            [
                events.EventType.ROUND_START,
                events.EventType.ROUND_FINISH,
                events.EventType.ROUND_CANCEL,
                events.EventType.SEED_FINALS,
                events.EventType.FINISH_TOURNAMENT
            ].includes(tev.type)
        )
        return true
    }

    /**
     * Take the tournament offline for local management
     */
    async goOffline(): Promise<boolean> {
        if (this.offline) {
            console.warn('Already offline')
            return true
        }

        // Cache the console page for offline access
        try {
            await offline.cacheConsolePageForOffline(this.tournament.uid)
        } catch (e) {
            console.warn('Failed to cache console page:', e)
            // Continue anyway - the page might already be cached
        }

        // Tell server we're going offline
        const res = await base.do_fetch_with_token(
            `/api/tournaments/${this.tournament.uid}/go-offline`,
            this.token, { method: "post" }
        )
        if (!res || !res.ok) {
            return false
        }

        this.tournament = await res.json() as d.Tournament
        await offline.goOffline(this.tournament, base.user_uid_from_token(this.token))
        this.offline = true
        this.display_callback(this.tournament, false)
        return true
    }

    /**
     * Sync offline data back to server
     */
    async syncOnline(): Promise<boolean> {
        if (!this.offline) {
            console.warn('Not in offline mode')
            return true
        }

        const data = await offline.prepareSyncData(this.tournament.uid)
        if (!data) {
            console.error('No offline data to sync')
            return false
        }

        const res = await base.do_fetch_with_token(
            `/api/tournaments/${this.tournament.uid}/sync-offline`,
            this.token,
            { method: "post", body: JSON.stringify(data) }
        )
        if (!res || !res.ok) {
            return false
        }

        this.tournament = await res.json() as d.Tournament
        await offline.clearOffline(this.tournament.uid)
        this.offline = false
        this.display_callback(this.tournament, true)
        return true
    }

    /**
     * Force tournament back online, discarding offline changes
     */
    async forceOnline(): Promise<boolean> {
        const res = await base.do_fetch_with_token(
            `/api/tournaments/${this.tournament.uid}/force-online`,
            this.token,
            { method: "post" }
        )
        if (!res || !res.ok) {
            return false
        }

        this.tournament = await res.json() as d.Tournament
        await offline.clearOffline(this.tournament.uid)
        this.offline = false
        this.display_callback(this.tournament, true)
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