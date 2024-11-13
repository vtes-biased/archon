import * as bootstrap from 'bootstrap'
import * as base from "./base"

function load() {
    const veknModal = new bootstrap.Modal("#veknModal")
    const claimModalButton = document.getElementById("claimModalButton") as HTMLButtonElement
    console.log("claim modal")
    if (claimModalButton) {
        console.log("yep")
        claimModalButton.addEventListener("click", () => veknModal.show())
    }
}

window.addEventListener("load", (ev) => { base.load().then() })
window.addEventListener("load", (ev) => load())
