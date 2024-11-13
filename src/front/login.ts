import * as bootstrap from 'bootstrap'

function loginManagement() {
    const loginModal = new bootstrap.Modal("#loginModal")
    const loginButton = document.getElementById('loginButton') as HTMLButtonElement
    if (loginButton) {
        loginButton.addEventListener("click", () => loginModal.show())
    }
}

window.addEventListener("load", (ev) => { loginManagement() })
