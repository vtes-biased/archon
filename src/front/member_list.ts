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
    add_member_modal: m.AddMemberModal
    page_size: number
    filters_row: HTMLDivElement
    roles_row: HTMLDivElement
    buttons_row: HTMLDivElement
    pagination_row: HTMLDivElement
    members_table: HTMLTableElement
    token: base.Token
    member: d.Person | undefined
    countries: Map<string, d.Country>
    members_map: m.MembersDB
    country_filter: HTMLSelectElement
    vekn_filter: HTMLInputElement
    name_filter: HTMLInputElement
    page: number
    constructor(root: HTMLDivElement, token: base.Token, page_size: number = 100) {
        this.root = root
        this.token = token
        this.members_map = new m.MembersDB(this.token, root)
        this.add_member_modal = new m.AddMemberModal(root, this.members_map, (member) => this.member_added(member))
        this.page_size = page_size
        this.filters_row = base.create_append(root, "div", ["d-md-flex", "my-2", "align-items-center"])
        this.roles_row = base.create_append(root, "div", ["d-md-flex", "my-2", "align-items-center"])
        const controls_row = base.create_append(root, "div", ["d-lg-flex", "align-items-center", "justify-content-between"])
        this.buttons_row = base.create_append(controls_row, "div", ["d-lg-flex", "my-2", "align-items-center"])
        this.pagination_row = base.create_append(controls_row, "div", ["d-lg-flex", "my-2", "align-items-center", "justify-content-end"])
        this.members_table = base.create_append(root, "table", ["table", "table-striped", "table-hover", "table-responsive"])
    }
    async init(url: URL | undefined, countries: d.Country[] | undefined = undefined) {
        this.page = 0
        await this.members_map.init()
        if (!countries) {
            const res = await base.do_fetch("/api/vekn/country", {})
            countries = await res.json() as d.Country[]
        }
        await this.add_member_modal.init(this.token, countries)
        this.member = await m.get_user(this.token)
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
        base.create_append(name_div, "label", ["form-label"], { for: "newNameFilter" }).innerText = "Name"
        this.name_filter.addEventListener("input", base.debounce((ev) => this.filters_changed()))
        // Roles
        this._add_role_checkbox(d.MemberRole.NC)
        this._add_role_checkbox(d.MemberRole.PRINCE)
        this._add_role_checkbox(d.MemberRole.JUDGE)
        if (m.can_playtest(this.member)) {
            this._add_role_checkbox(d.MemberRole.PLAYTESTER)
        }
        if (m.can_organize(this.member)) {
            this._add_role_checkbox(d.MemberFilter.MY_RECRUITS)
            this._add_role_checkbox(d.MemberRole.ADMIN)
            this._add_role_checkbox(d.MemberFilter.NO_SPONSOR)
        }
        if (this.member.roles.includes(d.MemberRole.ADMIN)) {
            this._add_role_checkbox(d.MemberFilter.NO_VEKN)
        }
        const add_member_button = base.create_append(this.buttons_row, "button", ["btn", "btn-primary", "me-2", "mb-2"])
        add_member_button.innerHTML = '<i class="bi bi-person-fill-add"></i> Add Member'
        add_member_button.addEventListener("click", (ev) => this.add_member_modal.show())
        const reload_button = base.create_append(this.buttons_row, "button", ["btn", "btn-secondary", "me-2", "mb-2"])
        reload_button.innerHTML = '<i class="bi bi-arrow-clockwise"></i> Reload'
        reload_button.addEventListener("click", async (ev) => {
            base.remove_children(this.members_table)
            reload_button.disabled = true
            await this.members_map.reload()
            reload_button.disabled = false
            await this.display()
        })

        this.set_filters_from_url(url)
        this.display()
    }
    member_added(member: d.Person) {
        const url = new URL(`/member/${member.uid}/display.html`, window.location.origin)
        window.location.href = url.href
    }
    _add_role_checkbox(role: d.MemberRole | d.MemberFilter) {
        const div = base.create_append(this.roles_row, "div", ["form-check", "form-check-inline"])
        const checkbox = base.create_append(div, "input", ["form-check-input"],
            { type: "checkbox", id: `role${role}`, value: role, name: role }
        )
        checkbox.addEventListener("change", (ev) => this.filters_changed())
        base.create_append(div, "label", ["form-check-label"], { for: `role${role}` }).innerText = role
    }
    async display() {
        base.remove_children(this.pagination_row)
        base.remove_children(this.members_table)
        const head = base.create_append(this.members_table, "thead")
        const row = base.create_append(head, "tr", ["align-middle", "smaller-font"])
        for (const header of ["VEKN#", "Name", "Roles", "Country"]) {
            base.create_append(row, "th", [], { scope: "col" }).innerText = header
        }
        base.create_append(row, "th", ["sm-hide"], { scope: "col" }).innerText = "City"
        const body = base.create_append(this.members_table, "tbody")
        var [total, skipped, displayed] = [0, 0, 0]
        const [search_params, members] = await this.get_filtered_members()
        for (const member of members) {
            total += 1
            if (search_params.page && total <= search_params.page * this.page_size) {
                skipped += 1
                continue
            }
            if (total - ((search_params.page ?? 0) * this.page_size) > 100) {
                continue
            }
            displayed += 1
            const row = base.create_append(body, "tr", ["align-middle"])
            row.addEventListener("click", (ev) => { window.location.assign(`/member/${member.uid}/display.html`) })
            base.create_append(row, "th", ["smaller-font"], { scope: "row" }).innerText = member.vekn
            base.create_append(row, "td", ["smaller-font"]).innerText = member.name
            const roles = base.create_append(row, "td", ["smaller-font"])
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
                    case d.MemberRole.RULEMONGER:
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
            const country = base.create_append(row, "td", ["text-nowrap", "smaller-font"])
            if (member.country) {
                country.innerText = `${member.country_flag} ${member.country}`
            }
            const city = base.create_append(row, "td", ["sm-hide"])
            if (member.city) {
                city.innerText = `${member.city}`
            }
        }
        const count = base.create_append(this.pagination_row, "div", ["me-2"])
        if (total > displayed) {
            count.innerText = `${skipped + 1}-${skipped + displayed}/${total}`
        } else {
            count.innerText = total.toString()
        }
        const pages_total = Math.ceil(total / this.page_size)
        var pages_to_display: Array<number> = []
        // so let's make it nice :-)
        // for a lot of pages, we want always 7 cells
        // [first] [...] [page-1][page][page+1] [...] [last]
        // so if there's 7 pages or less, we just display them all, no ellipsis
        if (pages_total < 8) {
            pages_to_display = [...Array(pages_total).keys()]

        } else {
            // always display the first page
            pages_to_display = [0]
            // compute how many pages we display left and right of the active page
            // we always display the active page except if it's the first or last
            var [add_left, add_right] = [0, 0]
            // display page-1 if we're not the first two pages
            if (this.page > 1) {
                add_left += 1
            }
            // symmetric at the end: display page+1 if we're not the last two pages
            if (this.page < pages_total - 2) {
                add_right += 1
            }
            // if we're not at least 3 pages away (first page, ellipsis, page -1)
            // we have less than 3 cells on the left, we need to compensate on the right
            // that's possible because we know we have at least 8 pages
            add_right += 3 - Math.min(3, this.page)
            // symmetrically from the end
            add_left += 3 - Math.min(3, pages_total - 1 - this.page)
            // now the ellipsis exception: we do not use the ellipsis if we're just
            // a single page away: in that exact case, the ellipsis is replaced
            // by the real page number (page - 2)
            if (this.page == 3) {
                add_left += 1
            }
            if (this.page > 3) {
                pages_to_display.push(NaN)
            }
            // display what we computed on the left
            for (var i = add_left; i > 0; i--) {
                pages_to_display.push(this.page - i)
            }
            // display the active page if it's not first or last
            if (this.page > 0 && this.page < pages_total - 1) {
                pages_to_display.push(this.page)
            }
            // ellipsis exception (symmetrically to the left side)
            if (this.page == pages_total - 4) {
                add_right += 1
            }
            // what we need on the right
            for (var i = 1; i <= add_right; i++) {
                pages_to_display.push(this.page + i)
            }
            if (this.page < pages_total - 4) {
                pages_to_display.push(NaN)
            }
            // always display the last page
            pages_to_display.push(pages_total - 1)
        }
        const nav = base.create_append(this.pagination_row, "nav", [], { "aria-label": "Page navigation" })
        const ul = base.create_append(nav, "ul", ["pagination", "m-0"])
        {
            const li = base.create_append(ul, "li", ["page-item"])
            const previous_button = base.create_append(li, "button", ["page-link", "smaller-font"])
            base.create_append(previous_button, "i", ["bi", "bi-chevron-left"])
            if (this.page > 0) {
                previous_button.addEventListener("click", (ev) => this.page_changed(this.page - 1))
            } else {
                li.classList.add("disabled")
            }
        }
        const pad_size = pages_total.toString().length
        for (const page_index of pages_to_display) {
            const li = base.create_append(ul, "li", ["page-item"])
            const button = base.create_append(li, "button", ["page-link", "smaller-font"])
            if (Number.isNaN(page_index)) {
                base.create_append(button, "i", ["bi", "bi-three-dots"])
                li.classList.add("disabled")
                continue
            }
            button.innerText = (page_index + 1).toString().padStart(pad_size, "0")
            button.addEventListener("click", (ev) => this.page_changed(page_index))
            if (page_index == this.page) {
                li.classList.add("active")
            }
        }
        {
            const li = base.create_append(ul, "li", ["page-item"])
            const next_button = base.create_append(li, "button", ["page-link", "smaller-font"])
            base.create_append(next_button, "i", ["bi", "bi-chevron-right"])
            if (this.page < pages_total - 1) {
                next_button.addEventListener("click", (ev) => this.page_changed(this.page + 1))
            } else {
                li.classList.add("disabled")
            }
        }
    }
    async get_filtered_members(): Promise<[MemberSearchParams, d.Person[]]> {
        var members: d.Person[] = await this.members_map.getAll()
        const search_params = this.get_search_params()
        if (search_params.name) {
            const candidates = new Set()
            this.members_map.complete_name(search_params.name).map(r => candidates.add(r.uid))
            members = members.filter(m => candidates.has(m.uid))
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
                        roles.add(d.MemberRole.RULEMONGER)
                        roles.add(d.MemberRole.JUDGE)
                        roles.add(d.MemberRole.JUDGEKIN)
                        break
                    case d.MemberRole.PLAYTESTER:
                        if (m.can_playtest(this.member)) {
                            roles.add(d.MemberRole.PTC)
                            roles.add(d.MemberRole.PLAYTESTER)
                        }
                        break
                    case d.MemberFilter.MY_RECRUITS:
                        if (m.can_organize(this.member)) {
                            members = members.filter(m => m.sponsor == this.member.uid)
                        }
                        break
                    case d.MemberFilter.NO_SPONSOR:
                        if (m.can_organize(this.member)) {
                            members = members.filter(m => !(m.sponsor && m.sponsor.length > 0))
                        }
                        break
                    case d.MemberFilter.NO_VEKN:
                        if (this.member.roles.includes(d.MemberRole.ADMIN)) {
                            members = members.filter(m => !(m.vekn && m.vekn.length > 0))
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
        return [search_params, members]
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
        if (url.searchParams.has("page")) { this.page = parseInt(url.searchParams.get("page")) }
    }
    filters_changed() {
        this.page = 0
        this.set_query_string()
        this.display()
    }
    page_changed(page: number) {
        this.page = page
        this.set_query_string()
        this.display()
    }
}


async function load() {
    const contentDiv = document.getElementById("contentDiv") as HTMLDivElement
    if (!contentDiv) { return }
    const token = await base.fetchToken()
    const display = new MemberListDisplay(contentDiv, token)
    await display.init(new URL(window.location.href))
}


window.addEventListener("load", (ev) => { load() })
