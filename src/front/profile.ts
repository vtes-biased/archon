import * as bootstrap from 'bootstrap'

function load() {
    const veknModal = new bootstrap.Modal("#veknModal")
    const claimModalButton = document.getElementById("claimModalButton") as HTMLButtonElement
    if (claimModalButton) {
        claimModalButton.addEventListener("click", () => veknModal.show())
    }
}

window.addEventListener("load", (ev) => load())
