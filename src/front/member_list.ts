import * as base from "./base"
import * as d from "./d"
import * as m from "./member"


interface MemberSearchParams {
    name: string | undefined,
    vekn: string | undefined,
    country: string | undefined,
    city: string | undefined,
    roles: (d.MemberRole | d.MemberFilter)[] | undefined
    page: number | undefined,
}


class MemberListDisplay {
    root: HTMLDivElement
    page_size: number
    filters_row: HTMLDivElement
    roles_row: HTMLDivElement
    members_table: HTMLTableElement
    token: base.Token
    member: d.Member | undefined
    countries: Map<string, d.Country>
    members_map: m.MemberMap
    country_filter: HTMLSelectElement
    vekn_filter: HTMLInputElement
    name_filter: HTMLInputElement
    page: number
    constructor(root: HTMLDivElement, page_size: number = 100) {
        this.root = root
        this.page_size = page_size
        this.filters_row = base.create_append(root, "div", ["d-md-flex", "my-2"])
        this.roles_row = base.create_append(root, "div", ["d-md-flex", "my-2"])
        this.members_table = base.create_append(root, "table", ["my-2", "table", "table-striped", "table-hover"])
    }
    async init(token: base.Token, url: URL | undefined, countries: d.Country[] | undefined = undefined) {
        this.token = token
        this.page = 0
        this.members_map = new m.MemberMap()
        await this.members_map.init(this.token)
        if (!countries) {
            const res = await base.do_fetch("/api/vekn/country", {})
            countries = await res.json() as d.Country[]
        }
        const user_id = JSON.parse(window.atob(token.access_token.split(".")[1]))["sub"]
        this.member = this.members_map.by_uid.get(user_id)
        this.countries = new Map(countries.map(c => [c.country, c]))
        base.remove_children(this.filters_row)
        const country_div = base.create_append(this.filters_row, "div", ["input-group", "form-floating"])
        this.country_filter = base.create_append(country_div, "select", ["form-select", "me-2", "mb-2"],
            { name: "select_country", id: "countryFilter" }
        )
        base.create_append(country_div, "label", ["form-label"], { for: "countryFilter" }).innerText = "Country"
        const option = base.create_element("option")
        option.value = ""
        option.label = ""
        this.country_filter.options.add(option)
        for (const country of this.countries.values()) {
            const option = base.create_element("option")
            option.value = country.country
            option.label = `${country.country} ${country.flag}`
            this.country_filter.options.add(option)
        }
        this.country_filter.addEventListener("change", (ev) => this.filters_changed())
        const vekn_div = base.create_append(this.filters_row, "div", ["input-group", "form-floating"])
        this.vekn_filter = base.create_append(vekn_div, "input", ["form-control", "me-2", "mb-2"],
            { name: "new-vekn", type: "text", id: "veknFilter", autocomplete: "new-vekn" }
        )
        this.vekn_filter.ariaAutoComplete = "none"
        this.vekn_filter.spellcheck = false
        base.create_append(vekn_div, "label", ["form-label"], { for: "veknFilter" }).innerText = "VEKN#"
        this.vekn_filter.addEventListener("input", base.debounce((ev) => this.filters_changed()))
        const name_div = base.create_append(this.filters_row, "div", ["input-group", "form-floating"])
        this.name_filter = base.create_append(name_div, "input", ["form-control", "me-2", "mb-2"],
            { name: "new-name", type: "text", id: "newNameFilter", autocomplete: "new-name" }
        )
        this.name_filter.ariaAutoComplete = "none"
        this.name_filter.spellcheck = false
        base.create_append(name_div, "label", ["form-label"], { for: "nameFilter" }).innerText = "Name"
        this.name_filter.addEventListener("input", base.debounce((ev) => this.filters_changed()))
        // Roles
        this._add_role_checkbox(d.MemberRole.NC)
        this._add_role_checkbox(d.MemberRole.PRINCE)
        this._add_role_checkbox(d.MemberRole.JUDGE)
        if (m.can_playtest(this.member)) {
            this._add_role_checkbox(d.MemberRole.PLAYTESTER)
        }
        if (m.can_sponsor(this.member)) {
            this._add_role_checkbox(d.MemberFilter.MY_RECRUITS)
        }
        if (m.can_make_prince(this.member)) {
            this._add_role_checkbox(d.MemberRole.ADMIN)
            this._add_role_checkbox(d.MemberFilter.NO_SPONSOR)
        }
        this.set_filters_from_url(url)
        this.display()
    }
    _add_role_checkbox(role: d.MemberRole | d.MemberFilter) {
        const div = base.create_append(this.roles_row, "div", ["form-check", "form-check-inline"])
        const checkbox = base.create_append(div, "input", ["form-check-input"],
            { type: "checkbox", id: `role${role}`, value: role, name: role }
        )
        checkbox.addEventListener("change", (ev) => this.filters_changed())
        base.create_append(div, "label", ["form-check-label"], { for: `role${role}` }).innerText = role
    }
    display() {
        base.remove_children(this.members_table)
        const head = base.create_append(this.members_table, "thead")
        const row = base.create_append(head, "tr", ["align-middle"])
        for (const header of ["VEKN#", "Name", "Roles", "Country", "City"]) {
            base.create_append(row, "th", [], { scope: "col" }).innerText = header
        }
        const body = base.create_append(this.members_table, "tbody")
        for (const member of this.get_filtered_members()) {
            const row = base.create_append(body, "tr", ["align-middle"])
            row.addEventListener("click", (ev) => { window.location.assign(`/member/${member.uid}/display.html`) })
            base.create_append(row, "th", [], { scope: "row" }).innerText = member.vekn
            base.create_append(row, "td").innerText = member.name
            const roles = base.create_append(row, "td")
            for (const role of member.roles) {
                const role_badge = base.create_append(roles, "span", ["badge", "me-1"])
                role_badge.innerText = role
                switch (role) {
                    case d.MemberRole.ADMIN:
                        role_badge.classList.add("text-bg-primary")
                        break
                    case d.MemberRole.NC:
                        role_badge.classList.add("text-bg-success")
                        break
                    case d.MemberRole.JUDGE:
                        role_badge.classList.add("text-bg-warning")
                        break
                    case d.MemberRole.PRINCE:
                        role_badge.classList.add("text-bg-info")
                        break
                    default:
                        role_badge.classList.add("text-bg-secondary")
                        break
                }
            }
            const country = base.create_append(row, "td")
            if (member.country) {
                country.innerText = `${member.country_flag} ${member.country}`
            }
            const city = base.create_append(row, "td")
            if (member.city) {
                city.innerText = `${member.city}`
            }
        }
    }
    get_filtered_members(): IteratorObject<d.Member> {
        var members: ArrayIterator<d.Member> = this.members_map.by_uid.values()
        const search_params = this.get_search_params()
        if (search_params.name) {
            members = this.members_map.complete_name(search_params.name)[Symbol.iterator]()
        }
        if (search_params.vekn) {
            members = members.filter(m => m.vekn.startsWith(search_params.vekn))
        }
        if (search_params.country) {
            members = members.filter(m => m.country == search_params.country)
        }
        if (search_params.roles && search_params.roles.length > 0) {
            const roles = new Set()
            for (const role of search_params.roles) {
                switch (role) {
                    case d.MemberRole.JUDGE:
                        roles.add(d.MemberRole.JUDGE)
                        roles.add(d.MemberRole.ANC_JUDGE)
                        roles.add(d.MemberRole.NEO_JUDGE)
                        break
                    case d.MemberRole.PLAYTESTER:
                        if (m.can_playtest(this.member)) {
                            roles.add(d.MemberRole.PTC)
                            roles.add(d.MemberRole.PLAYTESTER)
                        }
                        break
                    case d.MemberFilter.MY_RECRUITS:
                        if (m.can_sponsor(this.member)) {
                            members = members.filter(m => m.sponsor == this.member.uid)
                        }
                        break
                    case d.MemberFilter.NO_SPONSOR:
                        if (m.can_make_prince(this.member)) {
                            members = members.filter(m => !(m.sponsor && m.sponsor.length > 0 && this.members_map.by_uid.get(m.sponsor)))
                        }
                        break
                    default:  // d.MemberRole.ADMIN, d.MemberRole.NC, d.MemberRole.PRINCE
                        roles.add(role)
                        break
                }
            }
            if (roles.size > 0) {
                members = members.filter(m => m.roles.some(r => roles.has(r)))
            }
        }
        if (search_params.page) {
            members = members.drop(search_params.page * this.page_size)
        }
        return members.take(this.page_size)
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
        window.history.pushState(undefined, "", url)
    }
    get_search_params(): MemberSearchParams {
        const res = {} as MemberSearchParams
        res.roles = []
        if (this.name_filter.value && this.name_filter.value.length > 2) {
            res.name = this.name_filter.value
        }
        if (this.vekn_filter.value && this.vekn_filter.value.length > 0) {
            res.vekn = this.vekn_filter.value
        }
        if (this.country_filter.value && this.country_filter.value.length > 0) {
            res.country = this.country_filter.value
        }
        for (const checkbox of this.roles_row.querySelectorAll("input")) {
            if (!checkbox.checked) { continue }
            res.roles.push(checkbox.name as d.MemberFilter | d.MemberRole)
        }
        if (this.page && this.page > 0) {
            res.page = this.page
        }
        return res
    }
    set_filters_from_url(url: URL) {
        if (url.searchParams.has("name")) { this.name_filter.value = url.searchParams.get("name") }
        if (url.searchParams.has("vekn")) { this.vekn_filter.value = url.searchParams.get("vekn") }
        if (url.searchParams.has("country")) { this.country_filter.value = url.searchParams.get("country") }
        if (url.searchParams.has("roles")) {
            const roles = url.searchParams.getAll("roles")
            for (const checkbox of this.roles_row.querySelectorAll("input")) {
                if (roles.includes(checkbox.name)) {
                    checkbox.checked = true
                } else {
                    checkbox.checked = false
                }
            }
        }
        if (url.searchParams.has("page")) { this.page = parseInt(url.searchParams.get("country")) }
    }
    filters_changed() {
        this.page = 0
        this.set_query_string()
        this.display()
    }
}


async function load() {
    const contentDiv = document.getElementById("contentDiv") as HTMLDivElement
    if (!contentDiv) { return }
    const display = new MemberListDisplay(contentDiv)
    const token = await base.fetchToken()
    await display.init(token, new URL(window.location.href))
}


window.addEventListener("load", (ev) => { load() })
