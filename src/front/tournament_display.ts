import * as base from "./base"
import DOMPurify from 'isomorphic-dompurify'
import { marked } from 'marked'

async function load() {
    const tournamentDescription = document.getElementById("tournamentDescription")
    if (tournamentDescription) {
        tournamentDescription.innerHTML = DOMPurify.sanitize(await marked.parse(tournamentDescription.dataset.markdown))
    }
}

window.addEventListener("load", (ev) => { base.load() })
window.addEventListener("load", (ev) => { load() })
