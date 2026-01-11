import OPTIMAL_SEATING from "./optimal_seating_3r.json"

export enum RULE {
    R1_PREDATOR_PREY = 0,
    R2_OPPONENT_ALWAYS = 1,
    R3_AVAILABLE_VPS = 2,
    R4_OPPONENT_TWICE = 3,
    R5_FIFTH_SEAT = 4,
    R6_SAME_POSITION = 5,
    R7_SAME_SEAT = 6,
    R8_STARTING_TRANSFERS = 7,
    R9_SAME_POSITION_GROUP = 8,
}

enum IDX {
    // relationship
    OPPONENT = 0,
    PREY = 1,
    PREDATOR = 2,
    GRAND_PREY = 3,
    GRAND_PREDATOR = 4,
    CROSS_TABLE = 5,
    NEIGHBOUR = 6,
    NON_NEIGHBOUR = 7,
    // position (own index)
    ROUNDS_PLAYED = 0,
    VPS = 1,
    TRS = 2,
    SEAT_1 = 3,
    SEAT_2 = 4,
    SEAT_3 = 5,
    SEAT_4 = 6,
    SEAT_5 = 7,
}

// Measure
// To measure a seating "value", we use an N x N x 8 triangular matrix of integers, N being the number of players.
// For each couple of players, it records their successive relationships,
// A value of zero means they've never been in that position, otherwise it's the number of time it happened
// as per the IDX enum above:
// [opponent, prey, grand_prey, grand_pred, pred, cross, neighbour, non_neighbour]
// Because of the symmetry in relationships, we need only a triangular matrix and don't set half the values.
//
// The [i][i] diagonal of the matrix is special: a player has no relationship with themsleves,
// so instead it records their successive positions, again as per the IDX enum above: 
// [rounds_played, vps_available, first_turn_transfers, seat_1, seat2, seat3, seat4, seat5]
//
// The beauty of it is we can compute a round's matrix very quickly by copying the standard vectors below,
// and we can simply add the rounds matrixes successively to get our final matrix.
// Computing a "score" vector counting the seating rules "violations" from the matrix is relatively straightforward.

const OPPONENTS = new Map(
    // for each pair of players
    // 0: opponents
    // 1: prey
    // 2: grand-prey (5 seats only)
    // 3: grand-predator (5 seats only)
    // 4: predator
    // 5: cross-table (4 seats only)
    // 6: neighbours
    // 7: non-neighbours
    [[4,
        [
            [],
            [1, 1, 0, 0, 0, 0, 1, 0],
            [1, 0, 0, 0, 0, 1, 0, 1],
            [1, 0, 1, 0, 0, 0, 1, 0],
        ]
    ],
    [5,
        [
            [],
            [1, 1, 0, 0, 0, 0, 1, 0],
            [1, 0, 0, 1, 0, 0, 0, 1],
            [1, 0, 0, 0, 1, 0, 0, 1],
            [1, 0, 1, 0, 0, 0, 1, 0],
        ]
    ]]
)

const POSITIONS = new Map(
    // for each player
    // 0: playing
    // 1: vps opportunity 
    // 2: first turn transfers
    // 3: seat 1
    // 4: seat 2
    // 5: seat 3
    // 6: seat 4
    // 7: seat 5
    [[4,
        [
            [1, 4, 1, 1, 0, 0, 0, 0],
            [1, 4, 2, 0, 1, 0, 0, 0],
            [1, 4, 3, 0, 0, 1, 0, 0],
            [1, 4, 4, 0, 0, 0, 1, 0],
        ]
    ],
    [5,
        [
            [1, 5, 1, 1, 0, 0, 0, 0],
            [1, 5, 2, 0, 1, 0, 0, 0],
            [1, 5, 3, 0, 0, 1, 0, 0],
            [1, 5, 4, 0, 0, 0, 1, 0],
            [1, 5, 4, 0, 0, 0, 0, 1],
        ]
    ]]
)


// function add1(lhs: number[], rhs: number[]): number[] {
//     return lhs.map((x, i) => x + rhs[i])
// }

// function add2(lhs: number[][], rhs: number[][]): number[][] {
//     return lhs.map((x, i) => x.map((y, j) => y + rhs[i][j]))
// }

function add3(lhs: number[][][], rhs: number[][][]): number[][][] {
    // add two 3D measures together
    return lhs.map((x, i) => x.map((y, j) => y.map((z, k) => z + rhs[i][j][k])))
}

class Evaluator {
    mapping: Map<string, number> = new Map()
    reverse: Map<number, string> = new Map()
    constructor(ids: Iterable<string>) {
        var i = 0
        for (const uid of ids) {
            if (!this.mapping.has(uid)) {
                this.reverse.set(i, uid)
                this.mapping.set(uid, i++)
            }
        }
    }

    measure(round_: string[][], hints: number[] | undefined = undefined): number[][][] {
        // careful on the init, we need distinct arrays (no fill() with Array instances)
        const measure = Array.from(
            { length: this.mapping.size },
            (e) => Array.from(
                { length: this.mapping.size },
                (e) => new Array(8).fill(0)
            )
        )
        for (const [idx_t, table] of round_.entries()) {
            if (hints && !hints.includes(idx_t)) { continue }
            if (!POSITIONS.has(table.length)) { continue }
            for (const [idx_p, player] of table.entries()) {
                const index = this.mapping.get(player)
                measure[index][index] = POSITIONS.get(table.length)[idx_p].slice()
                for (var idx_r = 1; idx_r < table.length; idx_r++) {
                    // We skip when opponent index > player index to do 1/2 less copies (symmetry)
                    const opponent_index = this.mapping.get(table[(idx_p + idx_r) % table.length])
                    if (opponent_index > index) { continue }
                    measure[index][opponent_index] = OPPONENTS.get(table.length)[idx_r].slice()
                }
            }
        }
        return measure
    }

    measure_rounds(rounds: string[][][]): number[][][] {
        var result = undefined
        for (const round of rounds) {
            const M = this.measure(round)
            if (result) {
                result = add3(result, M)
            } else {
                result = M
            }
        }
        return result
    }

    issues(M: number[][][]): string[][][] {
        // returns the faulty indexes for each rule
        const result = Array.from({ length: 9 }, (e) => new Array())
        // compute some global values
        var mean_vps = 0  // average possible vp per round overall
        var mean_trs = 0  // average first-turn transfers per round overall
        var playing = 0  // number of players playing in total
        var rounds = 0  // rounds played (the max number of rounds played by a player)
        for (const [i, measure] of M.entries()) {
            const position = measure[i]
            const rounds_played = position[IDX.ROUNDS_PLAYED]
            if (rounds_played > 0) {
                mean_vps += position[IDX.VPS] / rounds_played
                mean_trs += position[IDX.TRS] / rounds_played
                playing++
                rounds = rounds < rounds_played ? rounds_played : rounds
            }
        }
        mean_vps = mean_vps / playing
        mean_trs = mean_trs / playing
        for (const [i, measure] of M.entries()) {
            for (const [j, relationship] of measure.entries()) {
                if (j > i) { break }
                if (j === i) {
                    // vps and tps outliers
                    // the base is 1 for vps (4 or 5) and 2 for transfers (1, 2, 3 or 4)
                    // this "allowed" deviation is *divided* by the number of rounds: 
                    // more rounds played by a player, more opportunities to fix it
                    const rounds_played = relationship[IDX.ROUNDS_PLAYED]
                    if (Math.abs(mean_vps - relationship[IDX.VPS] / rounds_played) > 1 / rounds_played) {
                        result[RULE.R3_AVAILABLE_VPS].push([this.reverse.get(i)])
                    }
                    if (Math.abs(mean_trs - relationship[IDX.TRS] / rounds_played) > 2 / rounds_played) {
                        result[RULE.R8_STARTING_TRANSFERS].push([this.reverse.get(i)])
                    }
                    if (relationship[IDX.SEAT_1] > 1) {
                        result[RULE.R7_SAME_SEAT].push([this.reverse.get(i)])
                    }
                    if (relationship[IDX.SEAT_2] > 1) {
                        result[RULE.R7_SAME_SEAT].push([this.reverse.get(i)])
                    }
                    if (relationship[IDX.SEAT_3] > 1) {
                        result[RULE.R7_SAME_SEAT].push([this.reverse.get(i)])
                    }
                    if (relationship[IDX.SEAT_4] > 1) {
                        result[RULE.R7_SAME_SEAT].push([this.reverse.get(i)])
                    }
                    if (relationship[IDX.SEAT_5] > 1) {
                        result[RULE.R7_SAME_SEAT].push([this.reverse.get(i)])
                        result[RULE.R5_FIFTH_SEAT].push([this.reverse.get(i)])
                    }
                } else {
                    for (const [k, value] of relationship.entries()) {
                        if (value > 1) {
                            if (k == IDX.OPPONENT) {
                                if (playing > 20) {
                                    result[RULE.R4_OPPONENT_TWICE].push([this.reverse.get(i), this.reverse.get(j)])
                                }
                                if (value >= rounds && rounds > 2) {
                                    result[RULE.R2_OPPONENT_ALWAYS].push([this.reverse.get(i), this.reverse.get(j)])
                                }
                            } else if (k <= IDX.PREDATOR) { // predator or prey twice
                                result[RULE.R1_PREDATOR_PREY].push([this.reverse.get(i), this.reverse.get(j)])
                                result[RULE.R6_SAME_POSITION].push([this.reverse.get(i), this.reverse.get(j)])
                            } else if (k <= IDX.CROSS_TABLE) {
                                result[RULE.R6_SAME_POSITION].push([this.reverse.get(i), this.reverse.get(j)])
                            } else if (playing > 20) {
                                result[RULE.R9_SAME_POSITION_GROUP].push([this.reverse.get(i), this.reverse.get(j)])
                            }
                        }
                    }
                }
            }
        }
        return result
    }

    fast_score(M: number[][][]) {
        // A score vector indicating the number of issues per rule
        const result = new Array(9).fill(0)
        var mean_vps = 0
        var mean_trs = 0
        var playing = 0
        var rounds = 0
        for (const [i, measure] of M.entries()) {
            const position = measure[i]
            const rounds_played = position[IDX.ROUNDS_PLAYED]
            if (rounds_played > 0) {
                mean_vps += position[IDX.VPS] / rounds_played
                mean_trs += position[IDX.TRS] / rounds_played
                playing++
                rounds = rounds < rounds_played ? rounds_played : rounds
            }
        }
        mean_vps = mean_vps / playing
        mean_trs = mean_trs / playing
        for (const [i, measure] of M.entries()) {
            for (const [j, relationship] of measure.entries()) {
                if (j > i) { break }
                if (j === i) {
                    const rounds_played = relationship[IDX.ROUNDS_PLAYED]
                    if (Math.abs(mean_vps - relationship[IDX.VPS] / rounds_played) > 1 / rounds_played) {
                        result[RULE.R3_AVAILABLE_VPS]++
                    }
                    if (Math.abs(mean_trs - relationship[IDX.TRS] / rounds_played) > 2 / rounds_played) {
                        result[RULE.R8_STARTING_TRANSFERS]++
                    }
                    if (relationship[IDX.SEAT_1] > 1) {
                        result[RULE.R7_SAME_SEAT]++
                    }
                    if (relationship[IDX.SEAT_2] > 1) {
                        result[RULE.R7_SAME_SEAT]++
                    }
                    if (relationship[IDX.SEAT_3] > 1) {
                        result[RULE.R7_SAME_SEAT]++
                    }
                    if (relationship[IDX.SEAT_4] > 1) {
                        result[RULE.R7_SAME_SEAT]++
                    }
                    if (relationship[IDX.SEAT_5] > 1) {
                        result[RULE.R7_SAME_SEAT]++
                        result[RULE.R5_FIFTH_SEAT]++
                    }
                } else {
                    for (const [k, value] of relationship.entries()) {
                        if (value > 1) {
                            if (k == IDX.OPPONENT) {
                                result[RULE.R4_OPPONENT_TWICE]++
                                if (value >= rounds) {
                                    result[RULE.R2_OPPONENT_ALWAYS]++
                                }
                            } else if (k <= IDX.PREDATOR) {
                                result[RULE.R1_PREDATOR_PREY]++
                                result[RULE.R6_SAME_POSITION]++
                            } else if (k <= IDX.CROSS_TABLE) {
                                result[RULE.R6_SAME_POSITION]++
                            } else {
                                result[RULE.R9_SAME_POSITION_GROUP]++
                            }
                        }
                    }
                }
            }
        }
        return result
    }
}

export function shuffle_array(array: any[]) {
    for (let i = array.length - 1; i >= 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

function default_seating(players: string[]) {
    const seat_in_fives = players.length - 4 * (5 - (players.length % 5 || 5))
    var seated = 0
    const res: string[][] = []
    while (seated < players.length) {
        const seats = seated < seat_in_fives ? 5 : 4
        const slice = players.slice(seated, seated + seats)
        if (slice.length < 4) {
            throw new Error("Invalid players count")
        }
        res.push(slice)
        seated += seats
    }
    return res
}

function compare_issues(lhs: string[][][], rhs: string[][][]): number {
    const length = lhs.length < rhs.length ? lhs.length : rhs.length
    for (var i = 0; i < length; i++) {
        const cmp_l = lhs[i].length
        const cmp_r = rhs[i].length
        if (cmp_l < cmp_r) {
            return -1
        }
        if (cmp_l > cmp_r) {
            return 1
        }
    }
    return 0
}

function zero_issues(issues: string[][][]) {
    return !issues.some(x => x.length > 0)
}

class Seating {
    seat_index: Map<number, number[]> = new Map()  // seat number to [table, seat] indexes
    player_index: Map<string, number> = new Map()  // player string to seat number
    seating: string[][]
    constructor(seating: string[][]) {
        this.seating = seating.map(s => s.slice())  // copy seating
        var x = 0
        for (const [i, table] of seating.entries()) {
            for (const [j, player] of table.entries()) {
                this.player_index.set(player, x)
                this.seat_index.set(x, [i, j])
                x++
            }
        }
    }

    random_swap(player: string) {
        const x = this.player_index.get(player)
        var y = x
        while (y == x) {
            y = Math.floor(Math.random() * this.seat_index.size)
        }
        this.swap(x, y)
    }

    shuffle() {
        for (var i = this.seat_index.size - 1; i >= 0; i--) {
            const a = i
            const b = Math.floor(Math.random() * (i + 1))
            this.swap(a, b)
        }
    }

    swap(a: number, b: number) {
        const [x, y] = [this.seat_index.get(a), this.seat_index.get(b)]
        const [player_a, player_b] = [this.seating[x[0]][x[1]], this.seating[y[0]][y[1]]]
        this.seating[x[0]][x[1]] = player_b
        this.seating[y[0]][y[1]] = player_a
        this.player_index.set(player_a, b)
        this.player_index.set(player_b, a)
    }
}

function temperate(min: number, max: number, temperature: number): number {
    // interpolation between min and max following temperature rule
    return min + Math.round((max - min) * temperature)
}

function get_optimal_seating(
    players: string[],
    round_index: number,
    previous_rounds: string[][][]
): string[][] | undefined {
    // Try to use pre-computed optimal seating for 3-round tournaments
    // round_index: 0 = round 1, 1 = round 2, 2 = round 3
    if (round_index < 0 || round_index > 2) return undefined
    const optimal = OPTIMAL_SEATING[players.length.toString()] as number[][][] | undefined
    if (!optimal) return undefined

    if (round_index === 0) {
        // Round 1 optimal is always sequential [1,2,3,4,5], [6,7,8,9], ...
        // Players should be pre-shuffled, then seated sequentially
        return default_seating(players)
    }

    // For rounds 2-3: recover player→number mapping from round 1
    if (previous_rounds.length === 0) return undefined
    const round1 = previous_rounds[0]

    // Build mapping: number → player from round 1 (sequential numbering)
    const number_to_player = new Map<number, string>()
    let num = 1
    for (const table of round1) {
        for (const player of table) {
            number_to_player.set(num++, player)
        }
    }

    // Check all current players were in round 1 and no new players joined
    const present = new Set(players)
    for (const player of number_to_player.values()) {
        if (!present.has(player)) return undefined  // player dropped
    }
    if (players.length !== number_to_player.size) return undefined  // player joined

    // Apply the round template
    const round_template = optimal[round_index]
    return round_template.map(table =>
        table.map(n => number_to_player.get(n)!)
    )
}

export function initial_seating(previous_rounds: string[][][], players: string[]): string[][] {
    players = players.slice()
    const round_index = previous_rounds.length
    // Round 1: any seating works, just shuffle
    if (round_index === 0) {
        shuffle_array(players)
        return default_seating(players)
    }
    // Rounds 2-3: try optimal seating if same players as round 1
    const optimal = get_optimal_seating(players, round_index, previous_rounds)
    if (optimal) {
        console.log(`using optimal seating for round ${round_index + 1}`)
        return optimal
    }
    // Fallback: optimization algorithm (players dropped or joined)
    const present_players = new Set(players)
    const all_players = new Set(players)
    for (const round_ of previous_rounds) {
        for (const table of round_) {
            for (const player of table) {
                all_players.add(player)
            }
        }
    }
    const E = new Evaluator(all_players)
    const base_measure = E.measure_rounds(previous_rounds)
    if (players.length < 1) {
        return default_seating(players)
    }
    // experimentally, 4 parallel computations yield stable results
    const parallels_inital_count = 4
    const parallels = new Array(parallels_inital_count)
    for (var i = 0; i < parallels.length; i++) {
        shuffle_array(players)
        const seating = new Seating(default_seating(players))
        parallels[i] = [
            seating,
            E.issues(add3(base_measure, E.measure(seating.seating)))
        ]
    }
    // simulated annealing
    const max_switches = Math.floor(players.length / 2)
    const max_iterations = 3000
    for (var it = 0; it < max_iterations; it++) {
        // temperature starts hot (1) and decreases to cold (0) logarithmically
        const temperature = 1 - Math.log(it + 1) / Math.log(max_iterations)
        // logarithmic decay from max_switches to 1
        var target_switches = temperate(1, max_switches, temperature)
        // adding some noise at minimum yield the best results
        // although keeping the occasional single switch matters too
        if (target_switches < 2 && Math.random() > 0.5) {
            target_switches += 1
        }
        for (var p = 0; p < parallels.length; p++) {
            var seating = new Seating(parallels[p][0].seating)
            const players_to_switch: Set<string> = new Set()
            for (const rule of parallels[p][1]) {
                for (const players of rule) {
                    const switchable = players.filter(p => present_players.has(p))
                    if (switchable.length < 1) {
                        continue
                    }
                    if (switchable.length < 2) {
                        players_to_switch.add(switchable[0])
                    } else {
                        // if it's an issue concerning two players, switching one suffices
                        players_to_switch.add(switchable[Math.floor(Math.random() * switchable.length)])
                    }
                    if (players_to_switch.size >= target_switches) {
                        break
                    }
                }
                // don't switch too many players at once, respect temperature
                if (players_to_switch.size >= target_switches) {
                    break
                }
            }
            // add random players as needed to reach temperature-based target
            const all_switchable = Array.from(present_players).filter(p => !players_to_switch.has(p))
            while (players_to_switch.size < target_switches && all_switchable.length > 0) {
                players_to_switch.add(all_switchable.splice(Math.floor(Math.random() * all_switchable.length), 1)[0])
            }
            for (const player of players_to_switch) {
                seating.random_swap(player)
            }
            const new_issues = E.issues(add3(base_measure, E.measure(seating.seating)))
            if (compare_issues(new_issues, parallels[p][1]) < 0) {
                parallels[p] = [seating, new_issues]
            }
            if (zero_issues(parallels[p][1])) {
                console.log(`optimal found after ${it} iterations`)
                return parallels[p][0].seating
            }
        }
    }
    parallels.sort((a, b) => compare_issues(a[1], b[1]))
    const result = parallels[0]
    console.log("best seating found", result[1].map(x => x.length).join(", "))
    return result[0].seating
}

export function compute_issues(rounds: string[][][]): string[][][] {
    const all_players = new Set<string>()
    for (const round_ of rounds) {
        for (const table of round_) {
            for (const player of table) {
                all_players.add(player)
            }
        }
    }
    const evaluator = new Evaluator(all_players)
    const measure = evaluator.measure_rounds(rounds)
    return evaluator.issues(measure)
}
