import { TournamentDisplay } from "./tournament_display"
import * as base from "./base"
import * as d from "./d"


async function load() {
    const tournamentDisplay = document.getElementById("tournamentDisplay") as HTMLDivElement
    if (tournamentDisplay) {
        const display = new TournamentDisplay(tournamentDisplay)
        var tournament: d.Tournament | undefined
        if (tournamentDisplay.dataset.tournament) {
            tournament = JSON.parse(tournamentDisplay.dataset.tournament)
        }
        const token = await base.fetchToken()
        await display.init(token, undefined)
        if (tournament) {
            await display.display(tournament)
        } else {
            await display.display_form(tournament)
        }
    }
}


window.addEventListener("load", (ev) => { load() })
