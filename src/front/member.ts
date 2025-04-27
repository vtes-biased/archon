import * as d from "./d"
import * as base from "./base"
import * as bootstrap from 'bootstrap'
import * as idb from 'idb'
import * as uuid from 'uuid'
import unidecode from 'unidecode'
import { DateTime } from 'luxon'

// Increment this number if/when the person model changes
const VERSION = 1

export interface LookupInfo {
    name: string,
    uid: string,
    vekn: string,
    country: string,
    country_flag: string,
}

function normalize_string(s: string) {
    var res = unidecode(s).toLowerCase()
    // remove non-letters non-numbers
    res.replace(/[^\p{L}\p{N}\s]/gu, "")
    // remove spurious spaces
    res.replace(/\s{2,}/g, " ");
    return res
}

export class MembersDB {
    token: base.Token
    db: idb.IDBPDatabase
    trie: Map<string, Map<string, LookupInfo>>
    constructor(token: base.Token) {
        this.token = token
    }

    async init() {
        this.trie = new Map()
        var trigger_refresh = false
        const perf_nav = window.performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming
        if (perf_nav.type == "reload") {
            trigger_refresh = true
            console.log("trigger refresh from reload")
        }
        const last_update_str = sessionStorage.getItem("members_refresh")
        if (last_update_str) {
            const last_update = DateTime.fromISO(last_update_str)
            if (DateTime.now().minus({ hours: 1 }) > last_update) {
                trigger_refresh = true
                console.log("trigger refresh from expiry")
            }
        } else {
            trigger_refresh = true
        }
        this.db = await idb.openDB("VEKN", VERSION, {
            upgrade(db, oldVersion, newVersion, transaction, event) {
                const membersStore = db.createObjectStore("members", { keyPath: "uid" })
                membersStore.createIndex("vekn", "vekn", { unique: false })
                trigger_refresh = true
                console.log("re-created members db")
            },
            blocked(currentVersion, blockedVersion, event) {
                window.location.reload()
            },
            blocking(currentVersion, blockedVersion, event) {
                window.location.reload()
            },
            terminated() {
                window.location.reload()
            },
        })
        if (trigger_refresh) {
            await this.refresh()
        } else {
            await this.build_trie()
        }
    }

    async refresh() {
        console.log("refreshing db")
        const res = await base.do_fetch_with_token("/api/vekn/members", this.token, {})
        if (!res) { return }
        if (res.headers.get("content-type") == "application/jsonl") {
            // wait for the whole stream: we can refine later if needed
            // but we cannot wait on the stream during the IndexDB transaction anyway
            const data = await res.bytes()
            const str = new TextDecoder().decode(data);
            const tr = this.db.transaction("members", "readwrite")
            await tr.store.clear()
            var count = 0
            for (const dic of str.split("\n")) {
                if (dic === "") { break }
                const member = JSON.parse(dic) as d.Person
                tr.store.put(member)
                count += 1
            }
            await tr.done
        } else if (res.headers.get("content-type") == "application/json") {
            const members = await res.json() as d.Person[]
            const tr = this.db.transaction("members", "readwrite")
            await tr.store.clear()
            for (const member of members) {
                tr.store.put(member)
            }
            await tr.done
        }
        await this.build_trie()
        sessionStorage.setItem("members_refresh", DateTime.now().toISO())
    }

    async build_trie() {
        this.trie.clear()
        for (const person of await this.db.getAll("members")) {
            const parts = normalize_string(person.name).split(" ")
            for (const part of parts) {
                for (var i = 1; i < part.length + 1; i++) {
                    const piece = part.slice(0, i)
                    if (!this.trie.has(piece)) {
                        this.trie.set(piece, new Map())
                    }
                    this.trie.get(piece).set(person.uid, {
                        name: person.name,
                        uid: person.uid,
                        vekn: person.vekn,
                        country: person.country,
                        country_flag: person.country_flag,
                    })
                }
            }
        }
    }

    async get_by_uid(uid: string) {
        return await this.db.get("members", uid)
    }

    async get_by_vekn(vekn: string) {
        return await this.db.getFromIndex("members", "vekn", vekn)
    }

    complete_name(s: string): LookupInfo[] {
        var members_list: LookupInfo[] | undefined = undefined
        for (const part of normalize_string(s).toLowerCase().split(" ")) {
            const lookup = this.trie.get(part)
            if (lookup) {
                if (members_list) {
                    members_list = members_list.filter(m => lookup.has(m.uid))
                } else {
                    members_list = [...lookup.values()]
                }
            }
        }
        return members_list ? members_list : []
    }

    async add_online(member: d.Person): Promise<d.Person | void> {
        const res = await base.do_fetch_with_token("/api/vekn/members", this.token,
            { method: "post", body: JSON.stringify(member) }
        )
        if (res) {
            const ret = await res.json()
            await this.db.put("members", ret)
            return ret
        }
    }

    async getAll() {
        return await this.db.getAll("members")
    }

    async assign_vekn(uid: string): Promise<d.Person | void> {
        const res = await base.do_fetch_with_token(`/api/vekn/members/${uid}/sponsor`, this.token, { method: "post" })
        if (res) {
            return await res.json()
        }
    }
}

export async function get_user(token: base.Token) {
    const uid = base.user_uid_from_token(token)
    const res = await base.do_fetch_with_token(`/api/vekn/members/${uid}`, token, {})
    if (res) {
        return await res.json()
    }
}

export function to_public_person(person: d.Person): d.PublicPerson {
    return {
        uid: person.uid,
        name: person.name,
        vekn: person.vekn,
        country: person.country,
        country_flag: person.country_flag,
        city: person.city,
    }
}

export class PersonLookup {
    form: HTMLFormElement
    input_vekn_id: HTMLInputElement
    input_name: HTMLInputElement
    dropdown_menu: HTMLUListElement
    button: HTMLButtonElement
    dropdown: bootstrap.Dropdown
    membersDB: MembersDB
    person: d.Person | undefined
    focus: HTMLLIElement | undefined
    constructor(members_db: MembersDB, root: HTMLElement, label: string, inline: boolean = false) {
        this.membersDB = members_db
        const form_uid = uuid.v4()
        // create an empty form on top of the body, so it can be used inside a "real" form
        this.form = base.create_prepend(document.body, "form", [], { id: form_uid })
        const top_div = base.create_append(root, "div", ["d-sm-flex"])
        if (inline) {
            top_div.classList.add("flex-row", "align-items-center")
        } else {
            top_div.classList.add("flex-column")
        }
        const vekn_div = base.create_append(top_div, "div", ["me-2", "mb-2"])
        this.input_vekn_id = base.create_append(vekn_div, "input", ["form-control"],
            { type: "text", placeholder: "VEKN ID number", autocomplete: "off", form: form_uid, name: "new-vekn-id" }
        )
        this.input_vekn_id.ariaAutoComplete = "none"
        this.input_vekn_id.spellcheck = false
        const dropdown_div = base.create_append(top_div, "div", ["me-2", "mb-2", "dropdown"])
        this.input_name = base.create_append(dropdown_div, "input", ["form-control", "dropdown-toggle"], {
            type: "text",
            placeholder: "Name",
            autocomplete: "off",
            form: form_uid,
            name: "new-name",
            "data-bs-toggle": "dropdown"
        })
        this.input_name.ariaAutoComplete = "none"
        this.input_name.spellcheck = false
        this.dropdown_menu = base.create_append(dropdown_div, "ul", ["dropdown-menu"])
        base.create_append(this.dropdown_menu, "li", ["dropdown-item", "disabled"],
            { type: "button" }).innerText = "Start typing..."
        const button_div = base.create_append(top_div, "div", ["me-2", "mb-2"])
        this.button = base.create_append(button_div, "button", ["btn", "btn-primary"],
            { type: "submit", form: form_uid }
        )
        this.button.innerText = label
        this.button.disabled = true
        this.dropdown = bootstrap.Dropdown.getOrCreateInstance(this.input_name)
        this.input_vekn_id.addEventListener("input", (ev) => this.select_member_by_vekn())
        this.input_name.addEventListener("input", base.debounce((ev) => this.complete_member_name()))
        dropdown_div.addEventListener("keydown", (ev) => this.keydown(ev))
    }

    reset_focus(new_focus: HTMLLIElement | undefined = undefined) {
        if (this.focus && this.focus.firstElementChild) {
            this.focus.firstElementChild.classList.remove("active")
        }
        this.focus = new_focus
        if (this.focus && this.focus.firstElementChild) {
            this.focus.firstElementChild.classList.add("active")
        }
    }

    reset() {
        this.person = undefined
        this.input_vekn_id.value = ""
        this.input_name.value = ""
        this.button.disabled = true
        this.reset_focus()
    }

    async select_member_by_vekn() {
        this.person = await this.membersDB.get_by_vekn(this.input_vekn_id.value)
        if (this.person) {
            this.input_name.value = this.person.name
            this.button.disabled = false
        }
        else {
            this.input_name.value = ""
            this.button.disabled = true
        }
    }

    async select_member_name(ev: Event) {
        const button = ev.currentTarget as HTMLButtonElement
        this.person = await this.membersDB.get_by_uid(button.dataset.memberUid)
        if (this.person) {
            this.input_vekn_id.value = this.person.vekn
            this.input_name.value = this.person.name
            this.button.disabled = false
        }
        else {
            this.input_vekn_id.value = ""
            this.input_name.value = ""
            this.button.disabled = true
        }
        this.reset_focus()
        this.dropdown.hide()
    }

    complete_member_name() {
        while (this.dropdown_menu.lastElementChild) {
            this.dropdown_menu.removeChild(this.dropdown_menu.lastElementChild)
        }
        this.reset_focus()
        this.input_vekn_id.value = ""
        this.button.disabled = true
        if (this.input_name.value.length < 1) {
            base.create_append(this.dropdown_menu, "li", ["dropdown-item", "disabled"],
                { type: "button" }).innerText = "Start typing..."
            return
        }
        if (this.input_name.value.length < 3) {
            base.create_append(this.dropdown_menu, "li", ["dropdown-item", "disabled"],
                { type: "button" }).innerText = "Type some more..."
            return
        }
        const persons_list = this.membersDB.complete_name(this.input_name.value)
        if (!persons_list || persons_list.length < 1) {
            base.create_append(this.dropdown_menu, "li", ["dropdown-item", "disabled"],
                { type: "button" }).innerText = "No result"
            return
        }
        for (const person of persons_list.slice(0, 10)) {
            const li = base.create_append(this.dropdown_menu, "li")
            const button = base.create_append(li, "button", ["dropdown-item"],
                { type: "button", "data-member-uid": person.uid }
            )
            button.innerText = person.name
            if (person.country) {
                button.innerText += ` (${person.country_flag} ${person.country})`
            }
            button.addEventListener("click", (ev) => this.select_member_name(ev))
        }
        this.dropdown.show()
    }

    keydown(ev: KeyboardEvent) {
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
        if (next_focus === this.focus) { return }
        if (this.focus && this.focus.firstElementChild) {
            this.focus.firstElementChild.classList.remove("active")
        }
        this.focus = next_focus
        if (this.focus && this.focus.firstElementChild) {
            this.focus.firstElementChild.classList.add("active")
        }
    }
}

export function can_change_role(member: d.Person, target: d.Person, role: d.MemberRole): boolean {
    if (member.roles.includes(d.MemberRole.ADMIN)) { return true }
    switch (role) {
        case d.MemberRole.PRINCE:
            if (member.roles.includes(d.MemberRole.NC) && member.country == target.country) {
                return true
            }
            return false
        case d.MemberRole.PLAYTESTER:
            if (member.roles.includes(d.MemberRole.PTC)) { return true }
            return false
        default:
            return false
    }
}

export function can_organize(member: d.Person): boolean {
    if (member.roles.includes(d.MemberRole.ADMIN)) { return true }
    if (member.roles.includes(d.MemberRole.NC)) { return true }
    if (member.roles.includes(d.MemberRole.PRINCE)) { return true }
    return false
}

export function can_admin_tournament(member: d.Person, tournament: d.TournamentConfig): boolean {
    if (member.roles.includes(d.MemberRole.ADMIN)) { return true }
    if (member.roles.includes(d.MemberRole.NC) && member.country == tournament.country) { return true }
    if (tournament.judges.find(j => j.uid == member.uid)) { return true }
    return false
}

export function can_admin_league(member: d.Person, league: d.League): boolean {
    if (member.roles.includes(d.MemberRole.ADMIN)) { return true }
    if (member.roles.includes(d.MemberRole.NC) && member.country == league.country) { return true }
    if (league.organizers.find(j => j.uid == member.uid)) { return true }
    return false
}

export function can_change_info(member: d.Person, target: d.Person): boolean {
    if (member.uid == target.uid) { return true }
    const member_roles = new Set(member.roles)
    if (member_roles.has(d.MemberRole.ADMIN)) { return true }
    const target_roles = new Set(target.roles)
    if (target_roles.has(d.MemberRole.ADMIN)) { return false }
    if (target_roles.has(d.MemberRole.NC)) { return false }

    if (
        target_roles.has(d.MemberRole.PRINCE) ||
        target_roles.has(d.MemberRole.PTC) ||
        target_roles.has(d.MemberRole.ETHICS)
    ) {
        if (member.roles.includes(d.MemberRole.NC) && member.country == target.country) { return true }
        return false
    }
    if (
        member_roles.has(d.MemberRole.NC) ||
        member_roles.has(d.MemberRole.PTC) ||
        member_roles.has(d.MemberRole.ETHICS)
    ) {
        return true
    }
    if (member_roles.has(d.MemberRole.PRINCE) && member.country == target.country) {
        return true
    }
    return false
}

export function can_sanction(member: d.Person): boolean {
    if (member.roles.includes(d.MemberRole.ADMIN)) { return true }
    if (member.roles.includes(d.MemberRole.JUDGE)) { return true }
    if (member.roles.includes(d.MemberRole.ETHICS)) { return true }
    return false
}

export function can_change_vekn(member: d.Person, target: d.Person): boolean {
    if (member.uid == target.uid) { return true }
    if (member.roles.includes(d.MemberRole.ADMIN)) { return true }
    if (member.roles.includes(d.MemberRole.NC) && member.country == target.country) { return true }
    return false
}

export function can_playtest(member: d.Person): boolean {
    if (member && member.roles && (
        member.roles.includes(d.MemberRole.ADMIN) ||
        member.roles.includes(d.MemberRole.PTC) ||
        member.roles.includes(d.MemberRole.PLAYTESTER)
    )) {
        return true
    }
    return false
}

export function can_contact(member: d.Person, target: d.Person): boolean {
    if (!(member && member.roles && target)) {
        return false
    }
    if (member.uid == target.uid || member.roles.includes(d.MemberRole.ADMIN)) {
        return true
    }
    if (target.roles.includes(d.MemberRole.NC)) {
        return true
    }
    if (member.country == target.country && target.roles.includes(d.MemberRole.PRINCE)) {
        return true
    }
    if (member.country == target.country && (
        member.roles.includes(d.MemberRole.PRINCE) ||
        member.roles.includes(d.MemberRole.NC)
    )) {
        return true
    }
    if (member.roles.includes(d.MemberRole.NC) && target.roles.includes(d.MemberRole.ADMIN)) {
        return true
    }
    return false
}

export class AddMemberModal extends base.Modal {
    token: base.Token | undefined
    members_map: MembersDB
    countries: d.Country[] | undefined
    form: HTMLFormElement
    name: HTMLInputElement
    country: HTMLSelectElement
    city: HTMLSelectElement
    email: HTMLInputElement
    submit_button: HTMLButtonElement
    callback: { (member: d.Person): void }
    assign_vekn: boolean
    constructor(el: HTMLElement, members_map: MembersDB, callback: { (member: d.Person): void }) {
        super(el)
        this.members_map = members_map
        this.callback = callback
        this.modal_div = base.create_append(el, "div", ["modal", "fade"],
            { tabindex: "-1", "aria-hidden": "true", "aria-labelledby": "AddMemberModalLabel" }
        )
        this.modal_title.innerText = "Add Member"
        this.form = base.create_append(this.modal_body, "form")
        this.name = base.create_append(this.form, "input", ["form-control", "my-2"],
            { type: "text", autocomplete: "new-name", name: "new-name" }
        )
        this.name.ariaAutoComplete = "none"
        this.name.spellcheck = false
        this.name.placeholder = "Name"
        this.country = base.create_append(this.form, "select", ["form-select", "my-2"],
            { name: "country", autocomplete: "none" }
        )
        this.city = base.create_append(this.form, "select", ["form-select", "my-2"], { name: "city" })
        this.email = base.create_append(this.form, "input", ["form-control", "my-2"],
            { type: "text", autocomplete: "new-email", name: "new-email" }
        )
        this.email.placeholder = "E-mail"
        this.email.ariaAutoComplete = "none"
        this.email.spellcheck = false
        this.submit_button = base.create_append(this.form, "button", ["btn", "btn-primary", "my-2"], { type: "submit" })
        this.submit_button.innerText = "Submit"
        this.country.ariaLabel = "Country"
        this.country.options.add(base.create_element("option", [], { value: "", label: "Country" }))
        this.country.required = true
        this.city.options.add(base.create_element("option", [], { value: "", label: "City" }))
        this.city.required = false
        this.country.addEventListener("change", (ev) => this.change_country())
        this.form.addEventListener("submit", (ev) => this.submit(ev))
    }

    async init(token: base.Token | undefined = undefined, countries: d.Country[] | undefined = undefined, assign_vekn: boolean = false) {
        if (token) {
            this.token = token
        } else {
            this.token = await base.fetchToken()
        }
        if (countries) {
            this.countries = countries
        } else {
            const res = await base.do_fetch("/api/vekn/country", {})
            this.countries = await res.json() as d.Country[]
        }
        for (const country of this.countries) {
            const option = document.createElement("option")
            option.value = country.country
            option.label = country.country
            this.country.options.add(option)
        }
        this.assign_vekn = assign_vekn
    }

    show() {
        this.name.value = ""
        this.email.value = ""
        this.country.selectedIndex = 0
        this.city.selectedIndex = 0
        this.city.disabled = true
        this.modal.show()
    }

    async change_country() {
        while (this.city.options.length > 1) {
            this.city.options.remove(1)
        }
        if (this.country.selectedIndex < 1) {
            this.city.disabled = true
        } else {
            // TODO deactivate this or something for offline mode
            const res = await base.do_fetch(`/api/vekn/country/${this.country.value}/city`, {})
            const cities = await res.json() as d.City[]
            for (const city of cities) {
                const option = document.createElement("option")
                option.value = city.unique_name
                option.label = city.unique_name
                this.city.options.add(option)
            }
            this.city.disabled = false
        }
    }

    async submit(ev: SubmitEvent) {
        ev.preventDefault()
        const member = {
            uid: uuid.v4(),
            name: this.name.value,
            vekn: "",
            country: this.country.value,
            city: this.city.value,
            email: this.email.value
        } as d.Member
        var person = await this.members_map.add_online(member)
        if (person && this.assign_vekn) {
            person = await this.members_map.assign_vekn(person.uid) || person
        }
        if (person) {
            this.callback(person)
        }
        this.modal.hide()
    }
}

export class ExistingVeknModal extends base.Modal {
    token: base.Token | undefined
    user_uid: string
    target_uid: string
    form: HTMLFormElement
    vekn_input: HTMLInputElement
    submit_button: HTMLButtonElement
    callback: { (member: d.Member): Promise<void> }
    constructor(el: HTMLElement, callback: { (member: d.Member): Promise<void> }) {
        super(el)
        this.callback = callback
        this.form = base.create_append(this.modal_body, "form")
        this.vekn_input = base.create_append(this.form, "input", ["form-control", "mb-2"],
            { type: "text", name: "new-vekn", placeholder: "VEKN# ID", autocomplete: "new-vekn" }
        )
        this.vekn_input.spellcheck = false
        this.vekn_input.ariaAutoComplete = "none"
        this.submit_button = base.create_append(this.form, "button", ["btn", "btn-primary", "me-2", "mb-2"], { type: "submit" })
        this.form.addEventListener("submit", (ev) => this.submit(ev).then())
    }
    async init(
        token: base.Token | undefined = undefined,
        user_uid: string | undefined = undefined,
        target_uid: string | undefined = undefined,
    ) {
        if (token) {
            this.token = token
        } else {
            this.token = await base.fetchToken()
        }
        if (user_uid) {
            this.user_uid = user_uid
        } else {
            this.user_uid = base.user_uid_from_token(token)
        }
        if (target_uid) {
            this.target_uid = target_uid
        } else {
            this.target_uid = this.user_uid
        }
        if (this.target_uid == this.user_uid) {
            this.modal_title.innerText = "Claim VEKN ID"
            this.submit_button.innerText = "Claim"
        } else {
            this.modal_title.innerText = "Assign existing VEKN ID"
            this.submit_button.innerText = "Assign"
        }
    }
    async submit(ev: SubmitEvent) {
        ev.preventDefault()
        if (this.target_uid == this.user_uid) {
            // reload required, because we need to change the session's token
            const url = new URL("/vekn/claim", window.location.origin)
            url.searchParams.set("vekn", this.vekn_input.value)
            window.location.href = url.href
        } else {
            const options = { method: "post", body: JSON.stringify({ vekn: this.vekn_input.value }) }
            const res = await base.do_fetch_with_token(`/api/vekn/members/${this.target_uid}/vekn`, this.token, options)
            this.callback(await res.json())
        }
        this.modal.hide()
    }
    show() {
        this.modal.show()
    }
}
