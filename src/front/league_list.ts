import * as base from "./base"
import * as d from "./d"
import * as utils from "./utils"

class LeagueListDisplay {
    root: HTMLDivElement
    filters_row: HTMLDivElement
    buttons_row: HTMLDivElement
    pagination_row: HTMLDivElement
    leagues_table: HTMLTableElement
    countries: Map<string, d.Country>
    cursors: d.LeagueFilter[]
    country_filter: HTMLSelectElement
    online_filter: HTMLInputElement
    constructor(root: HTMLDivElement) {
        this.root = root
        this.filters_row = base.create_append(root, "div", ["d-md-flex", "my-2", "align-items-center"])
        const controls_row = base.create_append(root, "div", ["d-lg-flex", "align-items-center", "justify-content-between"])
        this.buttons_row = base.create_append(controls_row, "div", ["d-lg-flex", "my-2", "align-items-center"])
        this.pagination_row = base.create_append(controls_row, "div", ["d-lg-flex", "my-2", "align-items-center", "justify-content-end"])
        this.leagues_table = base.create_append(root, "table", ["table", "table-striped", "table-hover", "table-responsive"])
    }
    async init(url: URL | undefined, countries: d.Country[] | undefined = undefined) {
        this.cursors = []
        if (!countries) {
            const res = await base.do_fetch("/api/vekn/country", {})
            countries = await res.json() as d.Country[]
        }
        this.countries = new Map(countries.map(c => [c.country, c]))
        base.remove_children(this.filters_row)
        { // Country
            const country_div = base.create_append(this.filters_row, "div", ["input-group", "form-floating"])
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
        { // Online
            const field_div = base.create_append(this.filters_row, "div", ["form-check", "form-switch", "w-100"])
            this.online_filter = base.create_append(field_div, "input", ["form-check-input"],
                { type: "checkbox", name: "online", id: "switchOnline" }
            )
            const online_label = base.create_append(field_div, "label", ["form-check-label"], { for: "switchOnline" })
            online_label.innerText = "Include Online"
            this.online_filter.checked = true
            this.online_filter.addEventListener("change", (ev) => this.filters_changed())
        }
        this.set_filters_from_url(url)
        await this.display()
    }
    async display() {
        base.remove_children(this.pagination_row)
        base.remove_children(this.leagues_table)
        const head = base.create_append(this.leagues_table, "thead")
        const row = base.create_append(head, "tr", ["align-middle", "smaller-font"])
        for (const header of ["Name", "Date", "Country", ""]) {
            base.create_append(row, "th", [], { scope: "col" }).innerText = header
        }
        const body = base.create_append(this.leagues_table, "tbody")
        const [filter, leagues] = await this.get_filtered_leagues()
        for (const league of leagues) {
            const row = base.create_append(body, "tr", ["align-middle"])
            row.addEventListener("click", (ev) => { window.location.assign(`/league/${league.uid}/display.html`) })
            const name = utils.constrain_string(league.name, 50)
            base.create_append(row, "th", ["smaller-font", "w-100"], { scope: "row" }).innerText = name
            const date = base.create_append(row, "td", ["smaller-font", "text-nowrap"])
            date.innerText = utils.date_string(league)
            if (league.finish) {
                date.innerText += ` → ${utils.date_string_finish(league)}`
            }
            const location = base.create_append(row, "td", ["smaller-font"])
            if (league.online) {
                location.innerText = "Online"
            } else if (league.country) {
                location.innerText = `${league.country} ${league.country_flag}`
            } else {
                location.innerText = "Worldwide 🌍"
            }
            const badges = base.create_append(row, "td", ["smaller-font"])
            badges.innerHTML += utils.format_badge(league)
        }
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
    async get_filtered_leagues(): Promise<[d.LeagueFilter, d.League[]]> {
        const search_params = this.get_search_params()
        const url = new URL("/api/leagues/", window.location.origin)
        if (search_params.country) {
            url.searchParams.append("country", search_params.country)
        }
        if (!search_params.online) {
            url.searchParams.append("online", "false")
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
    get_search_params(): d.LeagueFilter {
        const res = {} as d.LeagueFilter
        if (this.online_filter.checked) {
            res.online = true
        } else {
            res.online = false
        }
        if (this.country_filter.value && this.country_filter.value.length > 0) {
            res.country = this.country_filter.value
        }
        return res
    }
    set_filters_from_url(url: URL) {
        if (url.searchParams.has("country")) { this.country_filter.value = url.searchParams.get("country") }
        if (url.searchParams.has("online")) { this.online_filter.checked = Boolean(url.searchParams.get("online")) }
        if (url.searchParams.has("uid")) {
            this.cursors.push({
                country: url.searchParams.get("country") ?? "",
                online: this.online_filter.checked,
                date: url.searchParams.get("date"),
                uid: url.searchParams.get("uid")
            })
        }
    }
    filters_changed() {
        this.cursors = []
        this.set_query_string()
        this.display()
    }
    page_change(next: d.LeagueFilter | undefined = undefined) {
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
    const display = new LeagueListDisplay(contentDiv)
    await display.init(new URL(window.location.href))
}


window.addEventListener("load", (ev) => { load() })
