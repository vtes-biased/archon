import * as base from "./base"
import * as d from "./d"


class AddClientModal extends base.Modal {
    clientNameInput: HTMLInputElement
    createBtn: HTMLButtonElement
    callback: { (name: string): Promise<void> }

    constructor(el: HTMLElement) {
        super(el)
        this.modal_title.innerText = "Add New Client"
        base.remove_children(this.modal_body)
        this.modal_body.classList.remove("d-flex", "flex-column", "align-items-center")

        const form = base.create_append(this.modal_body, "form", [], { id: "addClientForm" })
        const nameDiv = base.create_append(form, "div", ["mb-3"])
        base.create_append(nameDiv, "label", ["form-label"], { for: "clientName" }).innerText = "Client Name"
        this.clientNameInput = base.create_append(nameDiv, "input", ["form-control"], {
            type: "text",
            id: "clientName",
            required: "true"
        })
        this.clientNameInput.addEventListener("keypress", (e) => {
            if (e.key === "Enter") {
                e.preventDefault()
                this.create()
            }
        })

        const footer = base.create_append(this.modal_div.querySelector(".modal-content"), "div", ["modal-footer"])
        base.create_append(footer, "button", ["btn", "btn-secondary"], {
            "data-bs-dismiss": "modal"
        }).innerText = "Cancel"
        this.createBtn = base.create_append(footer, "button", ["btn", "btn-primary"])
        this.createBtn.innerText = "Create"
        this.createBtn.addEventListener("click", () => this.create())
    }

    create() {
        if (!this.clientNameInput.value.trim()) {
            return
        }
        this.callback(this.clientNameInput.value.trim())
    }

    show(callback: { (name: string): Promise<void> }) {
        this.clientNameInput.value = ""
        this.callback = callback
        this.modal.show()
    }
}


class SecretModal extends base.Modal {
    clientIdDisplay: HTMLInputElement
    clientSecretDisplay: HTMLInputElement

    constructor(el: HTMLElement) {
        super(el)
        this.modal_title.innerText = "Client Secret"
        base.remove_children(this.modal_body)
        this.modal_body.classList.remove("d-flex", "flex-column", "align-items-center")

        const alert = base.create_append(this.modal_body, "div", ["alert", "alert-warning"])
        alert.innerHTML = '<strong>Important:</strong> Store this secret safely. It cannot be retrieved later.'

        const idDiv = base.create_append(this.modal_body, "div", ["mb-3"])
        base.create_append(idDiv, "label", ["form-label"], { for: "clientIdDisplay" }).innerText = "Client ID"
        this.clientIdDisplay = base.create_append(idDiv, "input", ["form-control"], {
            type: "text",
            id: "clientIdDisplay",
            readonly: "true"
        })

        const secretDiv = base.create_append(this.modal_body, "div", ["mb-3"])
        base.create_append(secretDiv, "label", ["form-label"], { for: "clientSecretDisplay" }).innerText = "Client Secret"
        this.clientSecretDisplay = base.create_append(secretDiv, "input", ["form-control"], {
            type: "text",
            id: "clientSecretDisplay",
            readonly: "true"
        })

        const footer = base.create_append(this.modal_div.querySelector(".modal-content"), "div", ["modal-footer"])
        base.create_append(footer, "button", ["btn", "btn-secondary"], {
            "data-bs-dismiss": "modal"
        }).innerText = "Close"
    }

    show(clientId: string, clientSecret: string) {
        this.clientIdDisplay.value = clientId
        this.clientSecretDisplay.value = clientSecret
        this.modal.show()
    }
}


class AdminDisplay {
    root: HTMLDivElement
    token: base.Token
    clientsTable: HTMLTableElement
    clientsTableBody: HTMLTableSectionElement
    addClientBtn: HTMLButtonElement
    addClientModal: AddClientModal
    secretModal: SecretModal

    constructor(root: HTMLDivElement, token: base.Token) {
        this.root = root
        this.token = token
        this.createUI()
    }

    createUI() {
        const h1 = base.create_append(this.root, "h1")
        h1.innerText = "Admin Panel"

        const clients_card = base.create_append(this.root, "div", ["card", "mt-4"])
        const clients_header = base.create_append(clients_card, "div", ["card-header"])
        const clients_title = base.create_append(clients_header, "h5", ["mb-0"])
        base.create_append(clients_title, "i", ["bi", "bi-terminal"])
        clients_title.append(document.createTextNode(" Client Apps"))
        const clients_body = base.create_append(clients_card, "div", ["card-body"])
        // Add client button
        const buttonRow = base.create_append(clients_body, "div", ["mb-3"])
        this.addClientBtn = base.create_append(buttonRow, "button", ["btn", "btn-primary"])
        this.addClientBtn.innerHTML = '<i class="bi bi-plus-circle"></i> Add New Client'
        this.addClientBtn.addEventListener("click", () => {
            this.addClientModal.show((name) => this.createClient(name))
        })

        // Clients table
        const tableContainer = base.create_append(clients_body, "div", ["table-responsive"])
        this.clientsTable = base.create_append(tableContainer, "table", ["table", "table-striped"])
        const thead = base.create_append(this.clientsTable, "thead")
        const headerRow = base.create_append(thead, "tr")
        base.create_append(headerRow, "th", [], { scope: "col" }).innerText = "Name"
        base.create_append(headerRow, "th", [], { scope: "col" }).innerText = "Client ID"
        base.create_append(headerRow, "th", [], { scope: "col" }).innerText = "Actions"
        this.clientsTableBody = base.create_append(this.clientsTable, "tbody")

        // Modals
        this.addClientModal = new AddClientModal(this.root)
        this.secretModal = new SecretModal(this.root)
    }

    async init() {
        await this.loadClients()
    }

    async loadClients() {
        const res = await base.do_fetch("/api/admin/clients", {
            headers: {
                'Authorization': `Bearer ${this.token.access_token}`
            }
        })
        if (!res) { return }
        const clients = await res.json() as d.Client[]
        this.renderClients(clients)
    }

    renderClients(clients: d.Client[]) {
        base.remove_children(this.clientsTableBody)
        for (const client of clients) {
            const row = base.create_append(this.clientsTableBody, "tr")
            const nameCell = base.create_append(row, "td")
            nameCell.innerText = client.name
            const idCell = base.create_append(row, "td")
            const code = base.create_append(idCell, "code")
            code.innerText = client.uid
            const actionsCell = base.create_append(row, "td")
            const resetBtn = base.create_append(actionsCell, "button", [
                "btn", "btn-sm", "btn-secondary"
            ])
            resetBtn.innerText = "Reset Secret"
            resetBtn.addEventListener("click", () => this.resetSecret(client.uid))
        }
    }

    async createClient(name: string) {
        const res = await base.do_fetch("/api/admin/clients", {
            method: "POST",
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.token.access_token}`
            },
            body: JSON.stringify({ name: name })
        })
        if (!res) { return }

        const data = await res.json() as { client_id: string, client_secret: string }
        this.secretModal.show(data.client_id, data.client_secret)
        this.addClientModal.modal.hide()
        await this.loadClients()
    }

    async resetSecret(clientId: string) {
        const res = await base.do_fetch(`/api/admin/clients/${clientId}/reset-secret`, {
            method: "POST",
            headers: {
                'Authorization': `Bearer ${this.token.access_token}`
            }
        })
        if (!res) { return }

        const data = await res.json() as { client_secret: string }
        this.secretModal.show(clientId, data.client_secret)
    }
}


async function load() {
    const contentDiv = document.getElementById("contentDiv") as HTMLDivElement
    if (!contentDiv) { return }
    const token = await base.fetchToken()
    if (!token) {
        window.location.href = "/login.html"
        return
    }
    const display = new AdminDisplay(contentDiv, token)
    await display.init()
}


window.addEventListener("load", (ev) => { load() })
