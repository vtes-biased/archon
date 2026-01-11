/**
 * Local tournament engine for offline mode.
 * Applies events to tournament state without server interaction.
 * Simplified compared to Python engine - trusts event validity.
 */
import * as d from "../d"
import * as events from "../events"

/**
 * Compute GW and TPs based on VPs for a table.
 * Simplified version of Python scoring.compute_table_scores()
 */
function computeTableScores(seating: d.TableSeat[]): number {
    const size = seating.length
    // TP values: 12, 24, 36, 48, 60 for 5-player table
    let tps = [12, 24, 36, 48, 60].slice(0, size)
    if (size < 5) {
        tps.splice(2, 1)  // Remove middle value for 4-player
        tps = tps.slice(4 - size)
    }

    // Sort seats by VP
    const sorted = [...seating].sort((a, b) => a.result.vp - b.result.vp)
    let maxVp = 0

    // Group by VP and assign TPs
    let i = 0
    while (i < sorted.length) {
        const vp = sorted[i].result.vp
        maxVp = Math.max(maxVp, vp)

        // Find all with same VP
        let j = i
        while (j < sorted.length && sorted[j].result.vp === vp) {
            j++
        }
        const count = j - i

        // Calculate shared TP
        let totalTp = 0
        for (let k = 0; k < count; k++) {
            totalTp += tps.shift() || 0
        }
        const sharedTp = Math.floor(totalTp / count)

        // Assign GW if sole highest with >= 2 VP
        const gw = (vp >= 2 && count === 1 && tps.length === 0) ? 1 : 0

        // Apply to all in group
        for (let k = i; k < j; k++) {
            sorted[k].result.gw = gw
            sorted[k].result.tp = sharedTp
        }

        i = j
    }

    return maxVp
}

/**
 * Check if table VP total is valid and compute table state
 */
function computeTableState(table: d.Table): void {
    const size = table.seating.length
    if (size < 4 || size > 5) {
        table.state = d.TableState.INVALID
        return
    }

    const total = table.seating.reduce(
        (sum, s) => sum + Math.ceil(s.result.vp),
        0
    )

    if (total < size) {
        table.state = d.TableState.IN_PROGRESS
    } else if (total > size) {
        table.state = d.TableState.INVALID
    } else {
        // Total is correct - could still be invalid but we trust it in offline mode
        table.state = d.TableState.FINISHED
    }

    // Override takes precedence
    if (table.override) {
        table.state = d.TableState.FINISHED
    }
}

/**
 * Create a new Score object
 */
function newScore(gw = 0, vp = 0, tp = 0): d.Score {
    return { gw, vp, tp }
}

/**
 * Add two scores
 */
function addScore(a: d.Score, b: d.Score): d.Score {
    return {
        gw: a.gw + b.gw,
        vp: a.vp + b.vp,
        tp: a.tp + b.tp,
    }
}

/**
 * Subtract score b from a (min 0)
 */
function subScore(a: d.Score, b: d.Score): d.Score {
    return {
        gw: Math.max(0, a.gw - b.gw),
        vp: Math.max(0, a.vp - b.vp),
        tp: Math.max(0, a.tp - b.tp),
    }
}

/**
 * Convert seating array to Round structure
 */
function eventSeatingToRound(
    tournament: d.Tournament,
    seating: string[][]
): d.Round {
    return {
        tables: seating.map(table => ({
            seating: table.map(uid => ({
                player_uid: uid,
                result: newScore(),
                deck: tournament.multideck ? tournament.players[uid]?.deck : null,
            })),
            state: d.TableState.IN_PROGRESS,
        })),
    }
}

/**
 * Update player statuses based on current round
 */
function setPlayersStatusesFromCurrentRound(tournament: d.Tournament): void {
    const currentRound = tournament.rounds[tournament.rounds.length - 1]
    const playersInRound = new Map<string, [number, number]>()

    currentRound.tables.forEach((table, tableIdx) => {
        table.seating.forEach((seat, seatIdx) => {
            playersInRound.set(seat.player_uid, [tableIdx + 1, seatIdx + 1])
        })
    })

    for (const player of Object.values(tournament.players)) {
        if (playersInRound.has(player.uid)) {
            const [table, seat] = playersInRound.get(player.uid)!
            player.state = d.PlayerState.PLAYING
            player.table = table
            player.seat = seat
        } else {
            player.table = 0
            player.seat = 0
            if (player.state !== d.PlayerState.FINISHED) {
                // Drop players who weren't checked in if we have previous rounds
                if (tournament.rounds.length > 1 &&
                    player.state !== d.PlayerState.CHECKED_IN) {
                    player.state = d.PlayerState.FINISHED
                } else {
                    player.state = d.PlayerState.REGISTERED
                }
            }
        }
    }
}

/**
 * Apply a tournament event locally
 */
export function applyEvent(tournament: d.Tournament, event: events.TournamentEvent): void {
    switch (event.type) {
        case events.EventType.REGISTER:
            applyRegister(tournament, event as events.Register)
            break
        case events.EventType.OPEN_REGISTRATION:
            tournament.state = d.TournamentState.REGISTRATION
            break
        case events.EventType.CLOSE_REGISTRATION:
            tournament.state = d.TournamentState.PLANNED
            break
        case events.EventType.OPEN_CHECKIN:
            tournament.state = d.TournamentState.WAITING
            break
        case events.EventType.CANCEL_CHECKIN:
            applyCancelCheckin(tournament)
            break
        case events.EventType.CHECK_IN:
            applyCheckIn(tournament, event as events.CheckIn)
            break
        case events.EventType.CHECK_EVERYONE_IN:
            applyCheckEveryoneIn(tournament)
            break
        case events.EventType.CHECK_OUT:
            applyCheckOut(tournament, event as events.CheckOut)
            break
        case events.EventType.ROUND_START:
            applyRoundStart(tournament, event as events.RoundStart)
            break
        case events.EventType.ROUND_ALTER:
            applyRoundAlter(tournament, event as events.RoundAlter)
            break
        case events.EventType.ROUND_FINISH:
            applyRoundFinish(tournament)
            break
        case events.EventType.ROUND_CANCEL:
            applyRoundCancel(tournament)
            break
        case events.EventType.SET_RESULT:
            applySetResult(tournament, event as events.SetResult)
            break
        case events.EventType.SET_DECK:
            applySetDeck(tournament, event as events.SetDeck)
            break
        case events.EventType.DROP:
            applyDrop(tournament, event as events.Drop)
            break
        case events.EventType.SANCTION:
            applySanction(tournament, event as events.Sanction)
            break
        case events.EventType.UNSANCTION:
            applyUnsanction(tournament, event as events.Unsanction)
            break
        case events.EventType.OVERRIDE:
            applyOverride(tournament, event as events.Override)
            break
        case events.EventType.UNOVERRIDE:
            applyUnoverride(tournament, event as events.Unoverride)
            break
        case events.EventType.SEED_FINALS:
            applySeedFinals(tournament, event as events.SeedFinals)
            break
        case events.EventType.SEAT_FINALS:
            applySeatFinals(tournament, event as events.SeatFinals)
            break
        case events.EventType.FINISH_TOURNAMENT:
            applyFinishTournament(tournament)
            break
    }
}

function applyRegister(tournament: d.Tournament, event: events.Register): void {
    if (tournament.players[event.player_uid]) {
        // Player already registered - only change state if dropped
        const player = tournament.players[event.player_uid]
        if (player.state === d.PlayerState.FINISHED &&
            !player.barriers?.includes(d.Barrier.BANNED) &&
            !player.barriers?.includes(d.Barrier.DISQUALIFIED)) {
            player.state = d.PlayerState.REGISTERED
        }
        return
    }

    // New player
    let state = d.PlayerState.REGISTERED
    if (tournament.state === d.TournamentState.FINALS ||
        tournament.state === d.TournamentState.FINISHED) {
        state = d.PlayerState.FINISHED
    }

    const barriers: d.Barrier[] = []
    if (tournament.decklist_required) {
        barriers.push(d.Barrier.MISSING_DECK)
    }

    tournament.players[event.player_uid] = {
        uid: event.player_uid,
        name: event.name,
        vekn: event.vekn,
        country: event.country,
        city: event.city,
        state: state,
        barriers: barriers,
        result: newScore(),
        rounds_played: 0,
        table: 0,
        seat: 0,
        seed: 0,
        toss: 0,
    }
}

function applyCancelCheckin(tournament: d.Tournament): void {
    for (const player of Object.values(tournament.players)) {
        if (player.state !== d.PlayerState.FINISHED) {
            player.state = d.PlayerState.REGISTERED
        }
    }
    tournament.state = d.TournamentState.REGISTRATION
}

function applyCheckIn(tournament: d.Tournament, event: events.CheckIn): void {
    const player = tournament.players[event.player_uid]
    if (!player) return
    if (player.barriers?.includes(d.Barrier.BANNED)) return
    if (player.barriers?.includes(d.Barrier.DISQUALIFIED)) return
    player.state = d.PlayerState.CHECKED_IN
}

function applyCheckEveryoneIn(tournament: d.Tournament): void {
    for (const player of Object.values(tournament.players)) {
        if (player.state !== d.PlayerState.REGISTERED) continue
        if (player.barriers && player.barriers.length > 0) continue
        player.state = d.PlayerState.CHECKED_IN
    }
}

function applyCheckOut(tournament: d.Tournament, event: events.CheckOut): void {
    const player = tournament.players[event.player_uid]
    if (!player) return
    if (player.state !== d.PlayerState.FINISHED) {
        player.state = d.PlayerState.REGISTERED
    }
}

function applyRoundStart(tournament: d.Tournament, event: events.RoundStart): void {
    tournament.state = d.TournamentState.PLAYING
    tournament.rounds.push(eventSeatingToRound(tournament, event.seating))
    setPlayersStatusesFromCurrentRound(tournament)
    // Reset toss values
    for (const player of Object.values(tournament.players)) {
        player.toss = 0
    }
}

function applyRoundAlter(tournament: d.Tournament, event: events.RoundAlter): void {
    const roundIdx = event.round - 1
    const oldTables = tournament.rounds[roundIdx].tables

    // Preserve results, decks, and overrides
    const results = new Map<string, { result: d.Score, deck: d.KrcgDeck | null }>()
    const overrides = new Map<number, d.ScoreOverride | null>()

    oldTables.forEach((table, i) => {
        overrides.set(i, table.override || null)
        for (const seat of table.seating) {
            results.set(seat.player_uid, {
                result: { ...seat.result },
                deck: seat.deck || null,
            })
        }
    })

    // Create new round
    tournament.rounds[roundIdx] = eventSeatingToRound(tournament, event.seating)

    // Restore overrides and results
    const isFinals = (tournament.state === d.TournamentState.FINALS ||
        tournament.state === d.TournamentState.FINISHED) &&
        event.round === tournament.rounds.length

    tournament.rounds[roundIdx].tables.forEach((table, i) => {
        table.override = overrides.get(i) || null
        for (const seat of table.seating) {
            const saved = results.get(seat.player_uid)
            if (saved) {
                seat.result = saved.result
                seat.deck = saved.deck
                results.delete(seat.player_uid)
            }
        }
        computeTableScores(table.seating)
        computeTableState(table)
    })

    // Remove results from players no longer in round
    for (const [uid, saved] of results.entries()) {
        const player = tournament.players[uid]
        if (player) {
            player.result = subScore(player.result, saved.result)
        }
    }

    // Update statuses if current round
    if (event.round === tournament.rounds.length) {
        setPlayersStatusesFromCurrentRound(tournament)
    }
}

function applyRoundFinish(tournament: d.Tournament): void {
    tournament.state = d.TournamentState.REGISTRATION
    const currentRound = tournament.rounds[tournament.rounds.length - 1]

    for (const player of Object.values(tournament.players)) {
        player.table = 0
        player.seat = 0
        if (player.state === d.PlayerState.PLAYING ||
            player.state === d.PlayerState.CHECKED_IN) {
            player.state = d.PlayerState.REGISTERED
        }
    }

    for (const table of currentRound.tables) {
        for (const seat of table.seating) {
            const player = tournament.players[seat.player_uid]
            if (player) {
                player.rounds_played = (player.rounds_played || 0) + 1
                if (tournament.max_rounds && player.rounds_played >= tournament.max_rounds) {
                    if (!player.barriers) player.barriers = []
                    if (!player.barriers.includes(d.Barrier.MAX_ROUNDS)) {
                        player.barriers.push(d.Barrier.MAX_ROUNDS)
                    }
                }
            }
        }
    }
}

function applyRoundCancel(tournament: d.Tournament): void {
    const currentRound = tournament.rounds[tournament.rounds.length - 1]

    // Subtract round results from players
    for (const table of currentRound.tables) {
        for (const seat of table.seating) {
            const player = tournament.players[seat.player_uid]
            if (player) {
                player.result = subScore(player.result, seat.result)
            }
        }
    }

    tournament.rounds.pop()
    tournament.state = d.TournamentState.WAITING
    tournament.finals_seeds = []

    for (const player of Object.values(tournament.players)) {
        player.table = 0
        player.seat = 0
        player.seed = 0
        if (player.state === d.PlayerState.PLAYING) {
            player.state = d.PlayerState.CHECKED_IN
        }
    }
}

function applySetResult(tournament: d.Tournament, event: events.SetResult): void {
    const roundIdx = event.round - 1
    const round = tournament.rounds[roundIdx]
    const player = tournament.players[event.player_uid]
    if (!player || !round) return

    let playerTable: d.Table | null = null
    let playerSeat: d.TableSeat | null = null

    for (const table of round.tables) {
        for (const seat of table.seating) {
            if (seat.player_uid === event.player_uid) {
                playerTable = table
                playerSeat = seat
                break
            }
        }
        if (playerSeat) break
    }

    if (!playerSeat || !playerTable) return

    // Subtract old result from player total
    player.result = subScore(player.result, playerSeat.result)

    // Set new VP
    playerSeat.result = newScore(0, event.vps, 0)

    // Recompute table scores
    computeTableScores(playerTable.seating)
    computeTableState(playerTable)

    // Add new result to player total
    player.result = addScore(player.result, playerSeat.result)
}

function applySetDeck(tournament: d.Tournament, event: events.SetDeck): void {
    const player = tournament.players[event.player_uid]
    if (!player) return

    // For now, just mark as having a deck (actual deck data would need parsing)
    // In offline mode we trust the deck is set
    if (player.barriers) {
        player.barriers = player.barriers.filter(b => b !== d.Barrier.MISSING_DECK)
    }

    // Store deck info (simplified - actual deck parsing would be more complex)
    player.deck = {
        crypt: { count: 0, cards: [] },
        library: { count: 0, cards: [] },
        vdb_link: event.deck.startsWith('http') ? event.deck : undefined,
    }
}

function applyDrop(tournament: d.Tournament, event: events.Drop): void {
    const player = tournament.players[event.player_uid]
    if (!player) return
    player.state = d.PlayerState.FINISHED
}

function applySanction(tournament: d.Tournament, event: events.Sanction): void {
    if (!tournament.sanctions) {
        tournament.sanctions = {}
    }
    if (!tournament.sanctions[event.player_uid]) {
        tournament.sanctions[event.player_uid] = []
    }
    tournament.sanctions[event.player_uid].push({
        uid: event.sanction_uid,
        level: event.level,
        category: event.category,
        comment: event.comment,
    })

    // Handle disqualification
    if (event.level === events.SanctionLevel.DISQUALIFICATION) {
        const player = tournament.players[event.player_uid]
        if (player) {
            if (!player.barriers) player.barriers = []
            player.barriers.push(d.Barrier.DISQUALIFIED)
            player.state = d.PlayerState.FINISHED
        }
    }
}

function applyUnsanction(tournament: d.Tournament, event: events.Unsanction): void {
    const sanctions = tournament.sanctions?.[event.player_uid]
    if (!sanctions) return

    const idx = sanctions.findIndex(s => s.uid === event.sanction_uid)
    if (idx >= 0) {
        sanctions.splice(idx, 1)
    }
}

function applyOverride(tournament: d.Tournament, event: events.Override): void {
    const table = tournament.rounds[event.round - 1]?.tables[event.table - 1]
    if (!table) return
    table.override = { comment: event.comment } as d.ScoreOverride
    table.state = d.TableState.FINISHED
}

function applyUnoverride(tournament: d.Tournament, event: events.Unoverride): void {
    const table = tournament.rounds[event.round - 1]?.tables[event.table - 1]
    if (!table) return
    table.override = null
    computeTableState(table)
}

function applySeedFinals(tournament: d.Tournament, event: events.SeedFinals): void {
    tournament.state = d.TournamentState.FINALS
    tournament.finals_seeds = event.seeds

    // Set seed and toss values on players
    event.seeds.forEach((uid, idx) => {
        const player = tournament.players[uid]
        if (player) {
            player.seed = idx + 1
            player.toss = event.toss[uid] || 0
        }
    })

    // Create finals round with empty seating (will be set by SeatFinals)
    tournament.rounds.push({
        tables: [{
            seating: event.seeds.map(uid => ({
                player_uid: uid,
                result: newScore(),
                deck: tournament.multideck ? tournament.players[uid]?.deck : null,
            })),
            state: d.TableState.IN_PROGRESS,
        }],
    })

    setPlayersStatusesFromCurrentRound(tournament)
}

function applySeatFinals(tournament: d.Tournament, event: events.SeatFinals): void {
    const finalsRound = tournament.rounds[tournament.rounds.length - 1]
    if (!finalsRound || finalsRound.tables.length === 0) return

    // Reorder seating according to event
    const table = finalsRound.tables[0]
    const oldSeating = new Map(table.seating.map(s => [s.player_uid, s]))

    table.seating = event.seating.map(uid => {
        const existing = oldSeating.get(uid)
        return existing || {
            player_uid: uid,
            result: newScore(),
            deck: tournament.multideck ? tournament.players[uid]?.deck : null,
        }
    })

    setPlayersStatusesFromCurrentRound(tournament)
}

function applyFinishTournament(tournament: d.Tournament): void {
    tournament.state = d.TournamentState.FINISHED

    // Determine winner from finals
    if (tournament.finals_seeds.length > 0 && tournament.rounds.length > 0) {
        const finalsTable = tournament.rounds[tournament.rounds.length - 1].tables[0]
        if (finalsTable && finalsTable.state === d.TableState.FINISHED) {
            // Find highest VP (or by seed if tied)
            let maxVp = -1
            let winner: d.TableSeat | null = null

            for (const seat of finalsTable.seating) {
                if (seat.result.vp > maxVp) {
                    maxVp = seat.result.vp
                    winner = seat
                } else if (seat.result.vp === maxVp && winner) {
                    // Tie - winner is higher seed (lower index in finals_seeds)
                    const seatSeedIdx = tournament.finals_seeds.indexOf(seat.player_uid)
                    const winnerSeedIdx = tournament.finals_seeds.indexOf(winner.player_uid)
                    if (seatSeedIdx < winnerSeedIdx) {
                        winner = seat
                    }
                }
            }

            if (winner) {
                tournament.winner = winner.player_uid
                winner.result.gw = 1  // Finals winner gets GW
            }
        }
    }

    // Mark all players as finished
    for (const player of Object.values(tournament.players)) {
        player.table = 0
        player.seat = 0
        if (player.state === d.PlayerState.PLAYING ||
            player.state === d.PlayerState.CHECKED_IN) {
            player.state = d.PlayerState.FINISHED
        }
    }
}

