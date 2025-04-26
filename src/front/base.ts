// this module defines functions useful for all pages
// note it is only imported in other ts files: it is not meant to be loaded directly

import * as bootstrap from 'bootstrap'
import * as uuid from 'uuid'


export function create_element<K extends keyof HTMLElementTagNameMap>(
    tag_name: K,
    classes: string[] = [],
    init: Object = {}
): HTMLElementTagNameMap[K] {
    const ret = document.createElement(tag_name)
    ret.classList.add(...classes)
    for (const [attribute, value] of Object.entries(init)) {
        ret.setAttribute(attribute, value)
    }
    return ret
}

export function create_append<K extends keyof HTMLElementTagNameMap>(
    el: HTMLElement,
    tag_name: K,
    classes: string[] = [],
    init: Object = {}
): HTMLElementTagNameMap[K] {
    const ret = create_element(tag_name, classes, init)
    el.append(ret)
    return ret
}

export function create_prepend<K extends keyof HTMLElementTagNameMap>(
    el: HTMLElement,
    tag_name: K,
    classes: string[] = [],
    init: Object = {}
): HTMLElementTagNameMap[K] {
    const ret = create_element(tag_name, classes, init)
    el.prepend(ret)
    return ret
}

export function remove_children(el: HTMLElement) {
    while (el.lastElementChild) {
        el.removeChild(el.lastElementChild)
    }
}

export function remove_but_one_children(el: HTMLElement) {
    while (el.childElementCount > 1) {
        el.removeChild(el.lastElementChild)
    }
}

export function add_tooltip(el: HTMLElement, tip: string): bootstrap.Tooltip {
    el.dataset.bsToggle = "tooltip"
    el.dataset.bsTitle = tip
    return bootstrap.Tooltip.getOrCreateInstance(el, { trigger: "hover" })
}

export async function do_fetch(url: string, options: Object) {
    // fetch the given url, handle errors and display them in the toaster
    try {
        const response = await fetch(url, options)
        if (!response.ok) {
            console.log(response)
            var message = await response.text()
            try {
                message = JSON.parse(message)["detail"]
            }
            catch (error) { }
            throw new Error(message)
        }
        return response
    }
    catch (error) {
        console.log(`Error fetching ${url}`, error.message)
        displayError(error.message)
    }
}

export async function do_fetch_with_token(url: string, token: Token, options: Object) {
    options["headers"] = {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token.access_token}`
    }
    return do_fetch(url, options)
}

export function displayError(msg: string) {
    // display a message in the toaster
    const toast_div = document.getElementById('errorToast') as HTMLDivElement
    const body = toast_div.querySelector("div.toast-body") as HTMLDivElement
    body.innerText = msg
    bootstrap.Toast.getOrCreateInstance(toast_div).show()
}

export function debounce(func: Function, timeout = 300) {
    let timer: NodeJS.Timeout | undefined = undefined
    return (...args: any) => {
        clearTimeout(timer)
        timer = setTimeout(() => { func.apply(this, args) }, timeout)
    }
}

export function debounce_async(func: Function, timeout = 300) {
    let timer: NodeJS.Timeout | undefined = undefined
    return (...args: any) => {
        clearTimeout(timer)
        timer = setTimeout(async () => { await func.apply(this, args) }, timeout)
    }
}

export async function fetchToken(): Promise<Token | undefined> {
    // fetch the given url, handle errors and display them in the toaster
    try {
        const response = await fetch("/auth/token", { method: "get", credentials: "same-origin", cache: "no-cache" })
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

export function user_uid_from_token(token: Token) {
    return JSON.parse(window.atob(token.access_token.split(".")[1]))["sub"]
}

export interface Token {
    access_token: string,
    token_type: string,
}


export class Modal {
    modal_div: HTMLDivElement
    modal: bootstrap.Modal
    modal_title: HTMLHeadingElement
    modal_body: HTMLDivElement
    constructor(el: HTMLElement) {
        const label_id = uuid.v4()
        this.modal_div = create_append(el, "div", ["modal", "fade"],
            { tabindex: "-1", "aria-hidden": "true", "aria-labelledby": label_id }
        )
        const dialog = create_append(this.modal_div, "div", ["modal-dialog"])
        const content = create_append(dialog, "div", ["modal-content"])
        const header = create_append(content, "div", ["modal-header"])
        this.modal_title = create_append(header, "h1", ["modal-title", "fs-5"], { id: label_id })
        create_append(header, "button", ["btn-close"], { "data-bs-dismiss": "modal", "aria-label": "Close" })
        this.modal_body = create_append(content, "div", ["modal-body", "d-flex", "flex-column", "align-items-center"])
        this.modal = new bootstrap.Modal(this.modal_div)
    }
}


export class ConfirmationModal extends Modal {
    message: HTMLDivElement
    callback: { (): void }
    constructor(el: HTMLDivElement) {
        super(el)
        this.modal_title.innerText = "Are you sure?"
        this.message = create_append(this.modal_body, "div", ["d-flex", "flex-column", "align-items-center"])
        const row = create_append(this.modal_body, "div", ["mt-4", "d-flex", "flex-row", "align-items-center"])
        const confirm = create_append(row, "button", ["btn", "btn-danger", "me-1", "mb-1"], { type: "button" })
        confirm.innerText = "Confirm"
        confirm.addEventListener("click", (ev) => this.confirm())
        const cancel = create_append(row, "button", ["btn", "btn-secondary", "me-1", "mb-1"], { type: "button" })
        cancel.innerText = "Cancel"
        cancel.addEventListener("click", (ev) => this.modal.hide())
    }

    confirm() {
        this.modal.hide()
        this.callback()
    }

    show(message: string, callback: { (): void }) {
        this.message.innerHTML = message
        this.callback = callback
        this.modal.show()
    }
}
