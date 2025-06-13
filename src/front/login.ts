import * as bootstrap from 'bootstrap'

function setup_login_form(loginForm: HTMLFormElement) {
    loginForm.addEventListener('submit', (ev) => {
        if (!loginForm.checkValidity()) {
            ev.preventDefault()
            ev.stopPropagation()
        }

        loginForm.classList.add('was-validated')
    })
    const loginEmail = loginForm.querySelector("input[name='email']") as HTMLInputElement
    const loginPassword = loginForm.querySelector("input[name='password']") as HTMLInputElement
    const loginLogin = loginForm.querySelector("button.btn-primary") as HTMLButtonElement
    const loginReset = loginForm.querySelector("button.btn-secondary") as HTMLButtonElement
    const handle_validity = (ev: Event) => {
        if (loginEmail.validity.valid) {
            if (loginPassword.value.length > 0) {
                loginLogin.disabled = false
                loginReset.disabled = true
            } else {
                loginLogin.disabled = true
                loginReset.disabled = false
            }
        } else {
            loginLogin.disabled = true
            loginReset.disabled = true
        }
    }
    loginEmail.addEventListener("input", handle_validity)
    loginPassword.addEventListener("input", handle_validity)
    loginEmail.addEventListener("change", (ev) => { loginForm.classList.add("was-validated") })
    loginPassword.addEventListener("change", (ev) => { loginForm.classList.add("was-validated") })
}

function loginManagement() {
    const loginModal = new bootstrap.Modal("#loginModal")
    const loginButton = document.getElementById('loginButton') as HTMLButtonElement

    if (loginButton) {
        loginButton.addEventListener("click", () => loginModal.show())
    }

    // Modal form validation
    const loginModalForm = document.getElementById('loginModalForm') as HTMLFormElement
    if (loginModalForm) {
        setup_login_form(loginModalForm)
    }
    // Main form validation (login page only
    const loginForm = document.getElementById('loginForm') as HTMLFormElement
    if (loginForm) {
        setup_login_form(loginForm)
    }
}

window.addEventListener("load", (ev) => { loginManagement() })
