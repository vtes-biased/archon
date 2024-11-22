// this module defines functions useful for all pages
// note it is only imported in other ts files: it is not meant to be loaded directly

import * as bootstrap from 'bootstrap'

export async function do_fetch(url: string, options: Object) {
    // fetch the given url, handle errors and display them in the toaster
    try {
        const response = await fetch(url, options)
        if (!response.ok) {
            console.log(response)
            throw new Error(JSON.stringify((await response.json())["detail"]))
        }
        return response
    }
    catch (error) {
        console.log(`Error fetching ${url}`, error.message)
        displayError(error.message)
    }
}

export function displayError(msg: string) {
    // display a message in the toaster
    const toast_div = document.getElementById('errorToast') as HTMLDivElement
    const body = toast_div.querySelector("div.toast-body") as HTMLDivElement
    body.innerText = msg
    bootstrap.Toast.getOrCreateInstance(toast_div).show()
}

export function debounce(func: Function, timeout = 300) {
    let timer: number | undefined = undefined
    return (...args: any) => {
        clearTimeout(timer)
        timer = setTimeout(() => { func.apply(this, args) }, timeout)
    }
}

export function debounce_async(func: Function, timeout = 300) {
    let timer: number | undefined = undefined
    return (...args: any) => {
        clearTimeout(timer)
        timer = setTimeout(async () => { await func.apply(this, args) }, timeout)
    }
}

export async function fetchToken(): Promise<Token | undefined> {
    // fetch the given url, handle errors and display them in the toaster
    try {
        const response = await fetch("/api/auth/token", { method: "get", credentials: "same-origin", cache: "no-cache" })
        if (!response.ok) {
            console.log("Failed to fetch user token", response)
            return
        }
        return response.json()
    }
    catch (error) {
        console.log(`Error fetching token`, error.message)
    }
}

export async function load() {
    // activate tooltips
    var tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'))
    var tooltipList = tooltipTriggerList.map(function (tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl)
    })
    // init toast
    const toastElList = document.querySelectorAll('.toast')
    const toastList = [...toastElList].map(toastEl => new bootstrap.Toast(toastEl, { autohide: false }))
}

export interface Token {
    access_token: string,
    token_type: string,
}
