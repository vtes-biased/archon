// this module defines functions useful for all pages
// note it is only imported in other ts files: it is not meant to be loaded directly

import * as bootstrap from 'bootstrap'

export async function do_fetch(url: string, options: Object) {
    // fetch the given url, handle errors and display them in the toaster
    try {
        const response = await fetch(url, options)
        if (!response.ok) {
            throw new Error((await response.json())[0])
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