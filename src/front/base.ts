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

export class TooltipManager {
    tooltips: Map<bootstrap.Tooltip, HTMLElement>
    constructor() {
        this.tooltips = new Map()
    }
    add(el: HTMLElement, tip: string, keep: boolean = false): bootstrap.Tooltip {
        el.dataset.bsToggle = "tooltip"
        el.dataset.bsTitle = tip
        const tooltip = bootstrap.Tooltip.getInstance(el)
        if (tooltip) { return tooltip }
        const new_tooltip = new bootstrap.Tooltip(el, { trigger: "hover focus", container: el.parentElement })
        // careful to properly hide the tooltip on interaction for interactive elements
        if (el instanceof HTMLButtonElement || el instanceof HTMLAnchorElement || el instanceof HTMLSelectElement) {
            el.addEventListener("click", () => new_tooltip.hide())
        }
        if (!keep) {
            this.tooltips.set(new_tooltip, el)
        }
        return new_tooltip
    }
    dispose() {
        for (const tooltip of this.tooltips.keys()) {
            tooltip.dispose()
        }
        this.tooltips.clear()
    }
    partial_dispose(el: HTMLElement) {
        for (const [tooltip, element] of this.tooltips.entries()) {
            if (el.contains(element)) {
                tooltip.dispose()
                this.tooltips.delete(tooltip)
            }
        }
    }
    remove(tooltip: bootstrap.Tooltip) {
        this.tooltips.delete(tooltip)
        tooltip.dispose()
    }
}

export async function do_fetch(url: string, options: Object) {
    // fetch the given url, handle errors and display them in the toaster
    try {
        const response = await fetch(url, options)
        if (!response.ok && response.status != 304) {
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
        // Prevent "Blocked aria-hidden" warning by using the inert attribute properly
        this.modal_div.addEventListener("hide.bs.modal", () => {
            this.modal_div.setAttribute("inert", "")
        })
        this.modal_div.addEventListener("show.bs.modal", () => {
            this.modal_div.removeAttribute("inert")
        })
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

export abstract class Completion<T> {
    input: HTMLInputElement
    dropdown_menu: HTMLUListElement
    dropdown: bootstrap.Dropdown
    focus: HTMLLIElement | undefined
    private debounced_show: (ev: Event) => void
    private keydown_handler: (ev: KeyboardEvent) => void
    // abstract methods
    abstract complete_input(value: string): Promise<T[]>
    abstract item_label(item: T): string
    // optional method for additional automation
    item_selected(item: T): void { }
    constructor(input: HTMLInputElement) {
        this.focus = undefined
        this.input = input
        this.dropdown_menu = create_append(input, "ul", ["dropdown-menu"])
        create_append(this.dropdown_menu, "li", ["dropdown-item", "disabled"], { type: "button" }
        ).innerText = "Start typing..."
        this.debounced_show = debounce_async(async (ev) => this._show())
        this.keydown_handler = (ev) => this._keydown(ev)
        this.input.addEventListener("input", this.debounced_show)
        this.dropdown = bootstrap.Dropdown.getOrCreateInstance(this.input)
        this.input.parentElement.addEventListener("keydown", this.keydown_handler)
    }
    dispose() {
        this.input.removeEventListener("input", this.debounced_show)
        this.input.parentElement.removeEventListener("keydown", this.keydown_handler)
        this.dropdown.dispose()
    }
    async _show() {
        remove_children(this.dropdown_menu)
        this._reset_focus()
        if (this.input.value.length < 1) {
            create_append(this.dropdown_menu, "li", ["dropdown-item", "disabled"],
                { type: "button" }).innerText = "Start typing..."
            return
        }
        if (this.input.value.length < 3) {
            create_append(this.dropdown_menu, "li", ["dropdown-item", "disabled"],
                { type: "button" }).innerText = "Type some more..."
            return
        }
        const items = await this.complete_input(this.input.value)
        if (!items || items.length < 1) {
            create_append(this.dropdown_menu, "li", ["dropdown-item", "disabled"],
                { type: "button" }).innerText = "No result"
            return
        }
        for (const item of items.slice(0, 10)) {
            const li = create_append(this.dropdown_menu, "li")
            const button = create_append(li, "button", ["dropdown-item"],
                { type: "button", "data-item": JSON.stringify(item) }
            )
            button.innerText = this.item_label(item)
            button.addEventListener("click", (ev) => this._select_item(ev))
        }
        this.dropdown.show()
    }
    _reset_focus(new_focus: HTMLLIElement | undefined = undefined) {
        if (new_focus === this.focus) { return }
        if (this.focus && this.focus.firstElementChild) {
            this.focus.firstElementChild.classList.remove("active")
        }
        this.focus = new_focus
        if (this.focus && this.focus.firstElementChild) {
            this.focus.firstElementChild.classList.add("active")
        }
    }
    _select_item(ev: Event) {
        const button = ev.currentTarget as HTMLButtonElement
        const item = JSON.parse(button.dataset.item) as T
        this.input.value = this.item_label(item)
        this.item_selected(item)
        this._reset_focus()
        this.input.dispatchEvent(new Event("change", { bubbles: true }))
        this.dropdown.hide()
    }
    _keydown(ev: KeyboardEvent) {
        var next_focus: HTMLLIElement | undefined = undefined
        switch (ev.key) {
            case "ArrowDown": {
                if (this.focus) {
                    next_focus = this.focus.nextElementSibling as HTMLLIElement
                } else {
                    next_focus = this.dropdown_menu.firstElementChild as HTMLLIElement
                }
                if (next_focus === null) {
                    next_focus = this.focus
                }
                break
            }
            case "ArrowUp": {
                if (this.focus) {
                    next_focus = this.focus.previousElementSibling as HTMLLIElement
                } else {
                    next_focus = this.dropdown_menu.lastElementChild as HTMLLIElement
                }
                if (next_focus === null) {
                    next_focus = this.focus
                }
                break
            }
            case "Escape": {
                break
            }
            case "Enter": {
                if (this.focus) {
                    this.focus.firstElementChild.dispatchEvent(new Event("click"))
                } else {
                    return
                }
                break
            }
            default: return
        }
        ev.stopPropagation()
        ev.preventDefault()
        this._reset_focus(next_focus)
    }
}