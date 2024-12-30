import * as bootstrap from 'bootstrap'

function load() {
    const veknModal = new bootstrap.Modal("#veknModal")
    const claimModalButton = document.getElementById("claimModalButton") as HTMLButtonElement
    console.log("claim modal")
    if (claimModalButton) {
        console.log("yep")
        claimModalButton.addEventListener("click", () => veknModal.show())
    }
}

window.addEventListener("load", (ev) => load())
