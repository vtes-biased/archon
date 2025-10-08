import { PlayerDisplay } from "./tournament/display/player"
import { CreateTournament } from "./tournament/display/create"
import * as base from "./base"
import * as d from "./d"


async function load() {
    const tournamentDisplay = document.getElementById("tournamentDisplay") as HTMLDivElement
    if (!tournamentDisplay) { return }
    // fetch tournament data from the page content
    var tournament: d.Tournament | undefined
    var cutoff: d.Score | undefined
    var deck_infos: d.DeckInfo[] | undefined
    const scriptTag = document.getElementById('tournament-data')
    if (scriptTag) {
        const jsonData = JSON.parse(scriptTag.textContent || '{}')
        tournament = jsonData.tournament
        cutoff = jsonData.cutoff
        deck_infos = jsonData.deck_infos
    }
    const token = await base.fetchToken()
    if (tournament) {
        const display = new PlayerDisplay(tournamentDisplay)
        await display.init(token, cutoff, deck_infos)
        await display.display(tournament)
    } else {
        const display = new CreateTournament(tournamentDisplay)
        await display.init(token)
        display.display()
    }
}


window.addEventListener("load", (ev) => { load() })
