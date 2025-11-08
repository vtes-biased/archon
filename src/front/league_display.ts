import { LeagueDisplay } from "./league"
import * as base from "./base"
import * as d from "./d"


async function load() {
    const leagueDisplay = document.getElementById("leagueDisplay") as HTMLDivElement
    if (leagueDisplay) {
        const display = new LeagueDisplay(leagueDisplay)
        var league_uid: string | undefined
        if (leagueDisplay.dataset.leagueUid) {
            league_uid = leagueDisplay.dataset.leagueUid
        }
        const token = await base.fetchToken()
        await display.init(token, undefined, undefined, league_uid)
        if (league_uid) {
            await display.display()
        } else {
            display.display_form()
        }
    }
}


window.addEventListener("load", (ev) => { load() })
