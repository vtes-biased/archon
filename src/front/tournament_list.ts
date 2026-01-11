import * as base from "./base"
import * as d from "./d"
import * as utils from "./utils"

class TournamentListDisplay {
    root: HTMLDivElement
    filters_row_1: HTMLDivElement
    filters_row_2: HTMLDivElement
    pagination_row: HTMLDivElement
    agenda_section: HTMLDivElement
    all_section: HTMLDivElement
    tournaments_table: HTMLTableElement
    token: base.Token
    countries: Map<string, d.Country>
    cursors: d.TournamentFilter[]
    country_filter: HTMLSelectElement
    state_filter: HTMLSelectElement
    year_filter: HTMLSelectElement
    name_filter: HTMLInputElement
    online_filter: HTMLInputElement
    personal_filter: HTMLInputElement
    agenda_mode: boolean
    constructor(root: HTMLDivElement) {
        this.root = root
        this.filters_row_1 = base.create_append(root, "div", ["d-lg-flex", "my-2", "align-items-center"])
        this.filters_row_2 = base.create_append(root, "div", ["d-sm-flex", "my-2", "align-items-center", "justify-content-start"])
        this.agenda_section = base.create_append(root, "div")
        this.all_section = base.create_append(root, "div")
        this.pagination_row = base.create_append(this.all_section, "div", ["d-lg-flex", "my-2", "align-items-center", "justify-content-end"])
        this.tournaments_table = base.create_append(this.all_section, "table", ["table", "table-striped", "table-hover", "table-responsive"])
        this.agenda_mode = false
    }
    async init(token: base.Token | undefined, url: URL | undefined, countries: d.Country[] | undefined = undefined) {
        this.token = token
        this.cursors = []
        if (!countries) {
            const res = await base.do_fetch("/api/vekn/country", {})
            countries = await res.json() as d.Country[]
        }
        this.countries = new Map(countries.map(c => [c.country, c]))
        base.remove_children(this.filters_row_1)
        base.remove_children(this.filters_row_2)
        { // Name
            const name_div = base.create_append(this.filters_row_1, "div", ["input-group", "form-floating"])
            this.name_filter = base.create_append(name_div, "input", ["form-control", "me-2", "mb-2"],
                { type: "text", name: "name", id: "nameFilter", placeholder: " " }
            )
            base.create_append(name_div, "label", ["form-label"], { for: "nameFilter" }).innerText = "Name"
            this.name_filter.addEventListener("input", base.debounce((ev) => this.filters_changed(), 500))
        }
        { // Country
            const country_div = base.create_append(this.filters_row_1, "div", ["input-group", "form-floating"])
            this.country_filter = base.create_append(country_div, "select", ["form-select", "me-2", "mb-2"],
                { name: "select_country", id: "countryFilter" }
            )
            base.create_append(country_div, "label", ["form-label"], { for: "countryFilter" }).innerText = "Country"
            const option = base.create_element("option")
            option.value = ""
            option.label = "ALL"
            this.country_filter.options.add(option)
            for (const country of this.countries.values()) {
                const option = base.create_element("option")
                option.value = country.country
                option.label = `${country.country} ${country.flag}`
                this.country_filter.options.add(option)
            }
            this.country_filter.addEventListener("change", (ev) => this.filters_changed())
        }
        { // Year
            const year_div = base.create_append(this.filters_row_1, "div", ["input-group", "form-floating"])
            this.year_filter = base.create_append(year_div, "select", ["form-select", "me-2", "mb-2"],
                { name: "select_year", id: "yearFilter" }
            )
            base.create_append(year_div, "label", ["form-label"], { for: "yearFilter" }).innerText = "Year"
            base.create_append(this.year_filter, "option", [], { value: "" }).label = "ALL"
            const current_year = new Date().getFullYear()
            for (let i = current_year; i >= 1997; i--) {
                base.create_append(this.year_filter, "option", [], { value: i.toString() }).label = i.toString()
            }
            this.year_filter.addEventListener("change", (ev) => this.filters_changed())
        }
        { // Status
            const state_div = base.create_append(this.filters_row_1, "div", ["input-group", "form-floating"])
            this.state_filter = base.create_append(state_div, "select", ["form-select", "me-2", "mb-2"],
                { name: "select_state", id: "stateFilter" }
            )
            base.create_append(state_div, "label", ["form-label"], { for: "stateFilter" }).innerText = "Status"
            base.create_append(this.state_filter, "option", [], { value: "" }).label = "ALL"
            base.create_append(this.state_filter, "option", [], { value: d.TournamentState.REGISTRATION }).label = "Upcoming"
            const ongoing_states = [d.TournamentState.WAITING, d.TournamentState.PLAYING, d.TournamentState.FINALS]
            base.create_append(this.state_filter, "option", [], { value: ongoing_states.join(',') }).label = "Ongoing"
            base.create_append(this.state_filter, "option", [], { value: d.TournamentState.FINISHED }).label = "Finished"
            this.state_filter.addEventListener("change", (ev) => this.filters_changed())
        }
        { // Online
            const field_div = base.create_append(this.filters_row_2, "div", ["form-check", "form-switch", "me-2", "mb-2"])
            this.online_filter = base.create_append(field_div, "input", ["form-check-input"],
                { type: "checkbox", name: "online", id: "switchOnline" }
            )
            base.create_append(
                field_div,
                "label",
                ["form-check-label", "text-nowrap"],
                { for: "switchOnline" }).innerText = "Include Online"
            this.online_filter.checked = true
            this.online_filter.addEventListener("change", (ev) => this.filters_changed())
        }
        { // Personal
            const field_div = base.create_append(this.filters_row_2, "div", ["form-check", "form-switch", "me-2", "mb-2"])
            this.personal_filter = base.create_append(field_div, "input", ["form-check-input"],
                { type: "checkbox", name: "personal", id: "switchPersonal" }
            )
            base.create_append(
                field_div,
                "label",
                ["form-check-label", "text-nowrap"],
                { for: "switchPersonal" }
            ).innerText = "Your Tournaments"
            this.personal_filter.checked = false
            this.personal_filter.addEventListener("change", (ev) => this.filters_changed())
        }
        this.set_filters_from_url(url)
        // Default to interesting mode when logged in and no filters set
        if (this.token && !this.has_active_filters()) {
            this.agenda_mode = true
        }
        await this.display()
    }
    has_active_filters(): boolean {
        return Boolean(
            this.country_filter.value ||
            this.state_filter.value ||
            this.year_filter.value ||
            (this.name_filter.value && this.name_filter.value.length > 2) ||
            !this.online_filter.checked ||
            this.personal_filter.checked ||
            this.cursors.length > 0
        )
    }
    async display() {
        base.remove_children(this.agenda_section)
        base.remove_children(this.pagination_row)
        base.remove_children(this.tournaments_table)
        // Interesting mode: show personal tournaments first
        if (this.agenda_mode && this.token) {
            const member_uid = base.user_uid_from_token(this.token)
            const agenda = await this.get_agenda_tournaments(member_uid)
            const header_row = base.create_append(this.agenda_section, "div", ["d-flex", "justify-content-between", "align-items-center", "mt-3", "mb-2"])
            const header = base.create_append(header_row, "h5", ["m-0"])
            header.innerText = "My Agenda"
            const toggle_btn = base.create_append(header_row, "button", ["btn", "btn-outline-secondary", "btn-sm"])
            toggle_btn.innerHTML = '<i class="bi bi-list-ul me-1"></i>Browse all'
            toggle_btn.addEventListener("click", () => {
                this.agenda_mode = false
                this.display()
            })
            if (agenda.length > 0) {
                const table = base.create_append(this.agenda_section, "table", ["table", "table-striped", "table-hover", "table-responsive"])
                this.render_tournaments_table(table, agenda)
            } else {
                const empty = base.create_append(this.agenda_section, "p", ["text-muted", "my-3"])
                empty.innerText = "No tournaments in your agenda or happening soon."
            }
            this.all_section.classList.add("d-none")
        } else {
            const header_row = base.create_append(this.agenda_section, "div", ["d-flex", "justify-content-between", "align-items-center", "mt-3", "mb-2"])
            const header = base.create_append(header_row, "h5", ["m-0"])
            header.innerText = "All Tournaments"
            if (this.token) {
                const toggle_btn = base.create_append(header_row, "button", ["btn", "btn-outline-secondary", "btn-sm"])
                toggle_btn.innerHTML = '<i class="bi bi-person me-1"></i>My agenda'
                toggle_btn.addEventListener("click", () => {
                    this.agenda_mode = true
                    this.display()
                })
            }
            this.all_section.classList.remove("d-none")
            const head = base.create_append(this.tournaments_table, "thead")
            const row = base.create_append(head, "tr", ["align-middle", "smaller-font"])
            for (const header of ["Name", "Date", "Country", "", ""]) {
                base.create_append(row, "th", [], { scope: "col" }).innerText = header
            }
            const body = base.create_append(this.tournaments_table, "tbody")
            const [filter, tournaments] = await this.get_filtered_tournaments()
            for (const tournament of tournaments) {
                this.render_tournament_row(body, tournament)
            }
            this.render_pagination(filter)
        }
    }
    async get_agenda_tournaments(member_uid: string): Promise<d.TournamentMinimal[]> {
        // Fetch personal tournaments (where user is player/judge)
        const personal_url = new URL("/api/tournaments/", window.location.origin)
        personal_url.searchParams.append("member_uid", member_uid)
        for (const state of [d.TournamentState.PLANNED, d.TournamentState.REGISTRATION, d.TournamentState.WAITING, d.TournamentState.PLAYING, d.TournamentState.FINALS]) {
            personal_url.searchParams.append("states", state)
        }
        // Fetch upcoming tournaments (next 3 days) for discovery
        const upcoming_url = new URL("/api/tournaments/", window.location.origin)
        upcoming_url.searchParams.append("states", d.TournamentState.REGISTRATION)
        // Fetch both in parallel
        const [personal_res, upcoming_res] = await Promise.all([
            base.do_fetch(personal_url.href, {}),
            base.do_fetch(upcoming_url.href, {})
        ])
        const [, personal] = await personal_res.json() as [d.TournamentFilter, d.TournamentMinimal[]]
        const [, upcoming] = await upcoming_res.json() as [d.TournamentFilter, d.TournamentMinimal[]]
        // Filter upcoming to next 3 days and merge with personal (dedupe)
        const now = new Date()
        const cutoff = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)
        const seen = new Set(personal.map(t => t.uid))
        const upcoming_soon = upcoming.filter(t => {
            if (seen.has(t.uid)) return false
            const start = new Date(t.start)
            return start <= cutoff
        })
        return [...personal, ...upcoming_soon]
    }
    render_tournaments_table(table: HTMLTableElement, tournaments: d.TournamentMinimal[]) {
        const head = base.create_append(table, "thead")
        const header_row = base.create_append(head, "tr", ["align-middle", "smaller-font"])
        for (const header of ["Name", "Date", "Country", "", ""]) {
            base.create_append(header_row, "th", [], { scope: "col" }).innerText = header
        }
        const body = base.create_append(table, "tbody")
        for (const tournament of tournaments) {
            this.render_tournament_row(body, tournament)
        }
    }
    render_tournament_row(body: HTMLTableSectionElement, tournament: d.TournamentMinimal) {
        const row = base.create_append(body, "tr", ["align-middle"])
        row.addEventListener("click", (ev) => window.location.href = `/tournament/${tournament.uid}/display.html`)
        const name = utils.constrain_string(tournament.name, 50)
        base.create_append(row, "th", ["smaller-font", "w-100"], { scope: "row" }).innerText = name
        const date = base.create_append(row, "td", ["smaller-font", "text-nowrap"])
        date.innerText = utils.date_string(tournament)
        const location = base.create_append(row, "td", ["smaller-font"])
        if (tournament.online) {
            location.innerText = "Online"
        } else if (tournament.country) {
            location.innerText = `${tournament.country} ${tournament.country_flag}`
        }
        base.create_append(row, "td", ["smaller-font"]).innerHTML = utils.tournament_rank_badge(tournament)
        const status_cell = base.create_append(row, "td", ["smaller-font"])
        const status_badge = base.create_append(status_cell, "span", ["me-2", "mb-2", "text-nowrap", "badge"])
        switch (tournament.state) {
            case d.TournamentState.PLANNED:
                status_badge.classList.add("text-bg-secondary")
                status_badge.innerText = "Planned"
                break;
            case d.TournamentState.REGISTRATION:
                status_badge.classList.add("text-bg-info")
                status_badge.innerText = "Registration"
                break;
            case d.TournamentState.FINISHED:
                status_badge.classList.add("text-bg-secondary")
                status_badge.innerText = "Finished"
                break;
            default:
                status_badge.classList.add("text-bg-warning")
                status_badge.innerText = "In Progress"
                break;
        }
    }
    render_pagination(filter: d.TournamentFilter) {
        const nav = base.create_append(this.pagination_row, "nav", [], { "aria-label": "Page navigation" })
        const ul = base.create_append(nav, "ul", ["pagination", "m-0"])
        {
            const li = base.create_append(ul, "li", ["page-item"])
            const previous_button = base.create_append(li, "button", ["page-link", "smaller-font"])
            base.create_append(previous_button, "i", ["bi", "bi-chevron-left"])
            if (this.cursors.length > 0) {
                previous_button.addEventListener("click", (ev) => this.page_change())
            } else {
                li.classList.add("disabled")
            }
        }
        {
            const li = base.create_append(ul, "li", ["page-item"])
            const next_button = base.create_append(li, "button", ["page-link", "smaller-font"])
            base.create_append(next_button, "i", ["bi", "bi-chevron-right"])
            if ((filter?.uid ?? "").length > 0) {
                next_button.addEventListener("click", (ev) => this.page_change(filter))
            } else {
                li.classList.add("disabled")
            }
        }
    }
    async get_filtered_tournaments(): Promise<[d.TournamentFilter, d.TournamentMinimal[]]> {
        const search_params = this.get_search_params()
        const url = new URL("/api/tournaments/", window.location.origin)
        if (search_params.country) {
            url.searchParams.append("country", search_params.country)
        }
        if (!search_params.online) {
            url.searchParams.append("online", "false")
        }
        if (search_params.member_uid) {
            url.searchParams.append("member_uid", search_params.member_uid)
        }
        if (search_params.year) {
            url.searchParams.append("year", search_params.year.toString())
        }
        if (search_params.name) {
            url.searchParams.append("name", search_params.name)
        }
        for (const state of search_params.states) {
            url.searchParams.append("states", state)
        }
        if (this.cursors.length > 0) {
            const cursor = this.cursors.at(-1)
            url.searchParams.append("uid", cursor.uid)
            url.searchParams.append("date", cursor.date)
        }
        const res = await base.do_fetch(url.href, {})
        const result = await res.json()
        return result
    }
    set_query_string() {
        const url = new URL(window.location.href)
        url.search = ""
        const search_params = this.get_search_params()
        for (const [key, value] of Object.entries(search_params)) {
            if (Array.isArray(value)) {
                for (const item of value) {
                    url.searchParams.append(key, item)
                }
            } else {
                url.searchParams.set(key, value)
            }
        }
        if (this.cursors.length > 0) {
            const cursor = this.cursors.at(-1)
            url.searchParams.append("uid", cursor.uid)
            url.searchParams.append("date", cursor.date)
        }
        window.history.pushState(undefined, "", url)
    }
    get_search_params(): d.TournamentFilter {
        const res = {} as d.TournamentFilter
        res.states = []
        if (this.state_filter.value) {
            res.states = this.state_filter.value.split(',') as d.TournamentState[]
        }
        if (this.online_filter.checked) {
            res.online = true
        } else {
            res.online = false
        }
        if (this.personal_filter.checked && this.token) {
            res.member_uid = base.user_uid_from_token(this.token)
        }
        if (this.year_filter.value) {
            res.year = parseInt(this.year_filter.value)
        }
        if (this.name_filter.value && this.name_filter.value.length > 2) {
            res.name = this.name_filter.value
        }
        if (this.country_filter.value && this.country_filter.value.length > 0) {
            res.country = this.country_filter.value
        }
        return res
    }
    set_filters_from_url(url: URL) {
        if (url.searchParams.has("country")) { this.country_filter.value = url.searchParams.get("country") }
        if (url.searchParams.has("online")) { this.online_filter.checked = Boolean(url.searchParams.get("online")) }
        if (url.searchParams.has("year")) { this.year_filter.value = url.searchParams.get("year") }
        if (url.searchParams.has("name")) { this.name_filter.value = url.searchParams.get("name") }
        if (url.searchParams.has("states")) {
            const states = url.searchParams.getAll("states").sort().join(',')
            for (const option of this.state_filter.options) {
                if (option.value.split(',').sort().join(',') == states) {
                    this.state_filter.value = option.value
                    break
                }
            }
        }
        if (this.token && url.searchParams.get("member_uid") == base.user_uid_from_token(this.token)) {
            this.personal_filter.checked = true
        }
        if (url.searchParams.has("uid")) {
            this.cursors.push({
                country: url.searchParams.get("country") ?? "",
                online: this.online_filter.checked,
                states: url.searchParams.getAll("states") as d.TournamentState[],
                date: url.searchParams.get("date"),
                uid: url.searchParams.get("uid"),
                member_uid: url.searchParams.get("member_uid"),
                year: parseInt(url.searchParams.get("year")),
                name: url.searchParams.get("name"),
            })
        }
    }
    filters_changed() {
        this.cursors = []
        this.agenda_mode = false  // Exit interesting mode when filters change
        this.set_query_string()
        this.display()
    }
    page_change(next: d.TournamentFilter | undefined = undefined) {
        if (next) {
            this.cursors.push(next)
        } else {
            this.cursors.pop()
        }
        this.set_query_string()
        this.display()
    }
}


async function load() {
    const contentDiv = document.getElementById("contentDiv") as HTMLDivElement
    if (!contentDiv) { return }
    const display = new TournamentListDisplay(contentDiv)
    const token = await base.fetchToken()
    await display.init(token, new URL(window.location.href))
}


window.addEventListener("load", (ev) => { load() })
