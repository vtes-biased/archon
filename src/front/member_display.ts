import * as base from "./base"
import * as d from "./d"
import * as m from "./member"
import * as events from "./events"
import * as utils from "./utils"
import * as bootstrap from 'bootstrap'
import { DateTime } from 'luxon'


class PasswordModal extends base.Modal {
    token: base.Token
    email: HTMLInputElement
    password: HTMLInputElement
    constructor(el: HTMLElement) {
        super(el)
        this.modal_title.innerText = "Set your password"
        const form = base.create_append(this.modal_body, "form", ["w-100"])
        this.email = base.create_append(form, "input", ["form-control", "me-2", "mb-2"], { name: "username" })
        this.email.disabled = true
        this.password = base.create_append(form, "input", ["form-control", "me-2", "mb-2"],
            { type: "password", name: "new-password", autocomplete: "new-password", placeholder: "New Password" }
        )
        base.create_append(form, "button", ["btn", "btn-primary"], { type: "submit" }).innerText = "Submit"
        form.addEventListener("submit", async (ev) => { ev.preventDefault(); await this.submit() })
    }
    show(token: base.Token, email: string) {
        this.token = token
        this.email.value = email
        this.modal.show()
    }
    async submit() {
        const res = await base.do_fetch_with_token(
            "/api/vekn/members/password", this.token,
            { method: "post", body: JSON.stringify({ password: this.password.value }) }
        )
        if (res) {
            this.modal.hide()
        }
    }
}

class MemberDisplay {
    root: HTMLDivElement
    token: base.Token
    member: d.Member | undefined
    target: d.Member | undefined
    countries: Map<string, d.Country>
    cities: Map<string, d.City>
    vekn_modal: m.ExistingVeknModal
    password_modal: PasswordModal
    // form
    name: HTMLInputElement
    email: HTMLInputElement
    whatsapp: HTMLInputElement
    country_select: HTMLSelectElement
    city_select: HTMLSelectElement
    constructor(root: HTMLDivElement) {
        this.root = root
        this.vekn_modal = new m.ExistingVeknModal(root, (member) => this.reload_target(member))
        this.password_modal = new PasswordModal(root)
    }
    async init(token: base.Token, url: URL | undefined, countries: d.Country[] | undefined = undefined) {
        this.token = token
        if (countries) {
            this.countries = new Map(countries.map(c => [c.country, c]))
        } else {
            const res = await base.do_fetch("/api/vekn/country", {})
            const countries = await res.json() as d.Country[]
            this.countries = new Map(countries.map(c => [c.country, c]))
        }
        const user_id = base.user_uid_from_token(token)
        const member_fetch = await base.do_fetch_with_token(`/api/vekn/members/${user_id}`, token, {})
        this.member = await member_fetch.json()
        if (url.pathname.endsWith("display.html")) {
            const uid = url.pathname.split("/")[2]
            const res = await base.do_fetch_with_token(`/api/vekn/members/${uid}`, token, {})
            this.target = await res.json()
        } else {
            this.target = this.member
        }
        if (this.target.country) {
            await this.load_cities()
        } else {
            this.cities = new Map<string, d.City>()
        }
        await this.vekn_modal.init(this.token, user_id, this.target.uid)
        this.display()
    }
    display() {
        base.remove_children(this.root)
        const header = base.create_append(this.root, "h1", ["mt-4", "mb-2", "d-md-flex", "align-items-center"])
        base.create_append(header, "div", ["me-2", "mb-2"]).innerText = `${this.target.name}`
        if (this.target.vekn && this.target.vekn.length > 0) {
            const vekn_badge = base.create_append(header, "span",
                ["badge", "me-2", "mb-2", "fs-5", "align-text-top", "text-bg-secondary"]
            )
            base.create_append(vekn_badge, "i", ["bi", "bi-person-check"])
            vekn_badge.append(document.createTextNode(` ${this.target.vekn}`))
            if (m.can_change_vekn(this.member, this.target)) {
                const remove = base.create_append(vekn_badge, "button",
                    ["btn", "ms-2", "btn-danger", "rounded-pill", "px-1", "py-0", "border-0"],
                    { role: "button" }
                )
                base.create_append(remove, "i", ["bi", "bi-x"])
                const tooltip = base.add_tooltip(remove, "Disassociate VEKN ID#")
                remove.addEventListener("click", (ev) => { tooltip.hide(); this.remove_vekn() })
            }
        } else {
            if (m.can_organize(this.member)) {
                const sponsor = base.create_append(header, "button", ["btn", "me-2", "mb-2", "btn-success"],
                    { role: "button" }
                )
                base.create_append(sponsor, "i", ["bi", "bi-person-check"])
                sponsor.append(document.createTextNode(" New VEKN#"))
                sponsor.addEventListener("click", (ev) => this.new_vekn())
            }
            if (m.can_change_vekn(this.member, this.target)) {
                const assign = base.create_append(header, "button", ["btn", "me-2", "mb-2", "btn-warning"],
                    { role: "button" }
                )
                base.create_append(assign, "i", ["bi", "bi-person-check"])
                assign.append(document.createTextNode(" Existing VEKN#"))
                assign.addEventListener("click",
                    (ev) => this.vekn_modal
                        .init(this.token, this.member.uid, this.target.uid)
                        .then(() => this.vekn_modal.show())
                )
            }
        }
        if (this.target.uid == this.member.uid && this.target.email) {
            const logout = base.create_append(header, "a", ["btn", "me-2", "mb-2", "btn-secondary", "align-text-top"],
                { role: "button", href: "/auth/logout/" }
            )
            base.create_append(logout, "i", ["bi", "bi-box-arrow-left"])
            logout.append(document.createTextNode(" Logout"))
            const reset_password = base.create_append(header, "button",
                ["btn", "me-2", "mb-2", "btn-secondary", "align-text-top"]
            )
            reset_password.innerText = "Set Password"
            reset_password.addEventListener("click", (ev) => this.password_modal.show(this.token, this.target.email))
        }

        const badges_row = base.create_append(this.root, "div", ["d-md-flex", "align-items-center"])
        for (const role of this.target.roles) {
            const role_badge = base.create_append(badges_row, "div", ["badge", "me-2", "mb-2"])
            var remove_button: HTMLButtonElement | undefined
            if (m.can_change_role(this.member, this.target, role)) {
                role_badge.append(document.createTextNode(`${role} `))
                remove_button = base.create_append(role_badge, "button",
                    ["btn", "ms-1", "p-0", "border-0"],
                    { role: "button" }
                )
                base.create_append(remove_button, "i", ["bi", "bi-x-circle-fill"])
                const tooltip = base.add_tooltip(remove_button, "Remove role")
                remove_button.addEventListener("click", (ev) => { tooltip.hide(); this.remove_role(role) })
            } else {
                role_badge.innerText = role
            }
            switch (role) {
                case d.MemberRole.ADMIN:
                    role_badge.classList.add("text-bg-primary")
                    if (remove_button) { remove_button.classList.add("text-light") }
                    break
                case d.MemberRole.NC:
                    role_badge.classList.add("text-bg-success")
                    if (remove_button) { remove_button.classList.add("text-light") }
                    break
                case d.MemberRole.JUDGE:
                    role_badge.classList.add("text-bg-warning")
                    break
                case d.MemberRole.PRINCE:
                    role_badge.classList.add("text-bg-info")
                    break
                default:
                    role_badge.classList.add("text-bg-secondary")
                    if (remove_button) { remove_button.classList.add("text-light") }
                    break
            }
        }
        const addable_roles = [...Object.values(d.MemberRole).filter(
            r => !this.target.roles.includes(r) && m.can_change_role(this.member, this.target, r))
        ]
        if (addable_roles.length > 0) {
            const div = base.create_append(badges_row, "div", ["dropdown"])
            const button = base.create_append(div, "button", ["btn", "btn-primary", "dropdown-toggle", "me-2", "mb-2"],
                { type: "button", "data-bs-toggle": "dropdown", "aria-expanded": "false" }
            )
            base.create_append(button, "i", ["bi", "bi-plus"])
            const list = base.create_append(div, "ul", ["dropdown-menu"])
            for (const role of addable_roles) {
                const li = base.create_append(list, "li")
                const action = base.create_append(li, "a", ["dropdown-item"], { href: "#", role: "button" })
                action.addEventListener("click", (ev) => { ev.preventDefault(); this.add_role(role) })
                action.innerText = role
            }
        }
        const form = base.create_append(this.root, "form")
        const cci = m.can_change_info(this.member, this.target)
        // ________________________________________________________________________________________ Row 1: Personal info
        const row_1 = base.create_append(form, "div", ["d-md-flex"])
        // ________________________________________________________________________________________________________ Name
        {
            const div = base.create_append(row_1, "div", ["input-group", "form-floating", "me-2", "mb-2"])
            this.name = base.create_append(div, "input", ["form-control"],
                { type: "text", id: "memberFormName", name: "name", "aria-label": "Name", autocomplete: "name" }
            )
            base.create_append(div, "label", ["form-label"], { for: "memberFormName" }).innerText = "Name"
            this.name.spellcheck = false
            this.name.value = this.target.name
            if (cci) {
                this.name.addEventListener("change", base.debounce((ev) => this.change_info()))
            } else {
                this.name.disabled = true
            }
        }
        // _____________________________________________________________________________________________________ Country
        {
            const div = base.create_append(row_1, "div", ["input-group", "form-floating", "me-2", "mb-2"])
            this.country_select = base.create_append(div, "select", ["form-select"],
                { name: "country", id: "selectCountry", "aria-label": "Country", autocomplete: "country-name" }
            )
            base.create_append(div, "label", ["form-label"], { for: "selectCountry" }).innerText = "Country"
            const option = base.create_element("option")
            option.value = ""
            option.label = ""
            this.country_select.options.add(option)
            for (const country of this.countries.values()) {
                const option = base.create_element("option")
                option.value = country.country
                option.label = `${country.country} ${country.flag}`
                if (this.target.country == country.country) {
                    option.selected = true
                }
                this.country_select.options.add(option)
            }
            if (cci) {
                this.country_select.addEventListener("change", base.debounce((ev) => this.change_info()))
            } else {
                this.country_select.disabled = true
            }
        }
        // ________________________________________________________________________________________________________ City
        {
            const div = base.create_append(row_1, "div", ["input-group", "form-floating", "me-2", "mb-2"])
            this.city_select = base.create_append(div, "select", ["form-select"],
                { name: "city", id: "selectCity", "aria-label": "City", autocomplete: "address-level2" }
            )
            base.create_append(div, "label", ["form-label"], { for: "selectCity" }).innerText = "City"
            const option = base.create_element("option")
            option.value = ""
            option.label = ""
            this.city_select.options.add(option)
            for (const city of this.cities.values()) {
                const option = base.create_element("option")
                option.value = city.unique_name
                option.label = city.unique_name
                if (this.target.city == city.unique_name) {
                    option.selected = true
                }
                this.city_select.options.add(option)
            }
            if (cci && this.cities.size > 0) {
                this.city_select.addEventListener("change", base.debounce((ev) => this.change_info()))
            } else {
                this.city_select.disabled = true
            }
        }
        // _________________________________________________________________________________________ Row 2: Contact info
        if (m.can_contact(this.member, this.target)) {
            const row_2 = base.create_append(form, "div", ["d-md-flex"])
            // __________________________________________________________________________________________________ E-mail
            if (this.target.email || cci) {
                const div = base.create_append(row_2, "div", ["input-group", "me-2", "mb-2"])
                base.create_append(div, "span", ["input-group-text"]).innerHTML = '<i class="bi bi-envelope"></i>'
                this.email = base.create_append(div, "input", ["form-control"],
                    { type: "text", placeholder: "Email", name: "email", "aria-label": "Email", autocomplete: "email" }
                )
                this.email.spellcheck = false
                this.email.value = this.target.email
                if (cci) {
                    this.email.addEventListener("change", base.debounce((ev) => this.change_info()))
                } else {
                    this.email.disabled = true
                }
                if (cci && this.email.value && this.member.uid != this.target.uid) {
                    const reset_button = base.create_append(row_2, "button",
                        ["btn", "btn-primary", "me-2", "mb-2", "text-nowrap"],
                        { type: "button" },
                    )
                    reset_button.innerText = "Reset password"
                    const form_data = new FormData()
                    form_data.set("email", this.email.value)
                    reset_button.addEventListener("click", (ev) => {
                        ev.preventDefault()
                        const res = base.do_fetch("/auth/email/reset", { method: "post", body: form_data })
                        if (res) {
                            reset_button.innerText = "Reset email sent"
                            reset_button.disabled = true
                        }

                    })
                }
            }
            // _________________________________________________________________________________________________ Discord
            if (this.member.uid == this.target.uid) {
                // TODO add 'link/unlink discord" buttons. But only once we have a clean email login
                if (this.target.discord?.id) {
                    const discord = base.create_append(row_2, "button",
                        ["btn", "btn-discord", "me-2", "mb-2", "text-nowrap"],
                        { role: "button" }
                    )
                    discord.innerHTML = '<i class="bi bi-discord"></i> Unlink Discord'
                    if (this.member.email) {
                        discord.addEventListener("click", async (ev) => {
                            ev.preventDefault()
                            await this.unlink_discord()
                        })
                    } else {
                        discord.disabled = true
                    }
                } else {
                    const discord = base.create_append(row_2, "button",
                        ["btn", "btn-discord", "me-2", "mb-2", "text-nowrap"],
                        { role: "button" }
                    )
                    discord.innerHTML = '<i class="bi bi-discord"></i> Link Discord'
                    const meta = document.querySelector("meta[name='login-data']") as HTMLMetaElement
                    discord.addEventListener("click", async (ev) => {
                        ev.preventDefault()
                        window.location.assign(meta.dataset.discordOauth)
                    })
                }
            } else if (this.target.discord?.id) {
                const discord = base.create_append(row_2, "a", ["btn", "btn-discord", "me-2", "mb-2", "text-nowrap"],
                    { role: "button", target: "_blank", rel: "noopener noreferrer" }
                )
                discord.href = `https://discordapp.com/users/${this.target.discord.id}/`
                discord.innerHTML = '<i class="bi bi-discord"></i> Discord'
            }
            // ________________________________________________________________________________________________ Whatsapp
            if (cci) {
                const div = base.create_append(row_2, "div", ["input-group", "me-2", "mb-2"])
                base.create_append(div, "span", ["input-group-text"]).innerHTML = '<i class="bi bi-whatsapp"></i>'
                this.whatsapp = base.create_append(div, "input", ["form-control"], {
                    type: "text",
                    placeholder: "WhatsApp",
                    name: "whatsapp",
                    "aria-label": "Phone",
                    autocomplete: "mobile tel"
                })
                this.whatsapp.spellcheck = false
                this.whatsapp.value = this.target.whatsapp ?? ""
                this.whatsapp.addEventListener("change", base.debounce((ev) => this.change_info()))
            } else if (this.target.whatsapp) {
                this.whatsapp = undefined
                const whatsapp = base.create_append(row_2, "a", ["btn", "btn-whatsapp", "me-2", "mb-2", "text-nowrap"],
                    { role: "button", target: "_blank", rel: "noopener noreferrer" }
                )
                whatsapp.href = "https://wa.me/" + this.target.whatsapp.replaceAll("-", "").replace(/^[0|\D]*/, "")
                whatsapp.innerHTML = '<i class="bi bi-whatsapp"></i> WhatsApp'
            }
        }
        // ___________________________________________________________________________________________________ Sanctions
        var sanction_div: HTMLDivElement
        if (m.can_sanction(this.member) || (this.target.sanctions && this.target.sanctions.length > 0)) {
            base.create_append(this.root, "h2", ["mt-4"]).innerText = "Sanctions"
            sanction_div = base.create_append(this.root, "div", ["d-xl-flex", "gap-2"])
        }
        if (this.target.sanctions && this.target.sanctions.length > 0) {
            const sanctions_accordion = base.create_append(sanction_div, "div", ["accordion", "w-100", "mb-4"],
                { id: "sanctionAccordion" }
            )
            for (const [idx, sanction] of Object.entries(this.target.sanctions)) {
                const id = `sanction-col-item-${idx}`
                const head_id = `sanction-col-head-${idx}`
                const item = base.create_append(sanctions_accordion, "div", ["accordion-item"])
                item.dataset.uid = sanction.uid
                const header = base.create_append(item, "h2", ["accordion-header"], { id: head_id })
                const button = base.create_append(header, "button", ["accordion-button", "collapsed"], {
                    type: "button",
                    "data-bs-toggle": "collapse",
                    "data-bs-target": `#${id}`,
                    "aria-expanded": "false",
                    "aria-controls": id,
                })
                // additional display for RegisteredSanction from previous tournaments
                if (sanction.tournament) {
                    const rsanction = sanction as d.RegisteredSanction
                    const timestamp = utils.date_string(rsanction.tournament)
                    button.innerText = `(${timestamp}: ${rsanction.tournament?.name})`
                }
                const level_badge = base.create_append(button, "div", ["badge", "mx-1"])
                level_badge.innerText = sanction.level
                switch (sanction.level) {
                    case events.SanctionLevel.CAUTION:
                        level_badge.classList.add("text-bg-secondary")
                        break;
                    case events.SanctionLevel.WARNING:
                        level_badge.classList.add("text-bg-warning")
                        break;
                    case events.SanctionLevel.DISQUALIFICATION:
                        level_badge.classList.add("text-bg-danger")
                        break;
                }
                if (sanction.category != events.SanctionCategory.NONE) {
                    const category_badge = base.create_append(button, "div", ["badge", "mx-1", "text-bg-secondary"])
                    category_badge.innerText = sanction.category
                }
                const collapse = base.create_append(item, "div", ["accordion-collapse", "collapse"], {
                    "aria-labelledby": head_id, "data-bs-parent": "#sanctionAccordion"
                })
                collapse.id = id
                const body = base.create_append(collapse, "div", ["accordion-body"])
                body.innerText = sanction.comment
                const prefix = base.create_prepend(body, "div",
                    ["border-top", "border-bottom", "border-info", "bg-info", "bg-opacity-10", "d-flex", "p-1", "mb-2"]
                )
                if (sanction.judge) {
                    const author = base.create_append(prefix, "div", ["me-2"])
                    author.innerText = `Issued by ${sanction.judge.name}`
                }
                // Remove button only for members who can sanction
                if (m.can_sanction(this.member)) {
                    const remove_button = base.create_append(prefix, "div", ["btn", "badge", "btn-danger"])
                    remove_button.innerHTML = '<i class="bi bi-trash"></i>'
                    remove_button.addEventListener("click", (ev) => this.remove_sanction(sanction))
                }
            }
        }
        // ___________________________________________________________________________________________ Add Sanction Form
        if (m.can_sanction(this.member)) {
            // Add existing sanctions in display()
            const form = base.create_append(sanction_div, "form", ["w-100"])
            const comment = base.create_append(form, "textarea", ["form-control", "mb-2"],
                { type: "text", autocomplete: "none", rows: 3, maxlength: 500, name: "comment" }
            )
            comment.ariaAutoComplete = "none"
            comment.spellcheck = false
            comment.placeholder = "Comment"
            const select_div = base.create_append(form, "div", ["d-flex", "gap-1"])
            // ____________________________________________________________________________________________ Level Select
            {
                const level_div = base.create_append(select_div, "div", ["form-floating"])
                const level_select = base.create_append(level_div, "select", ["form-select", "my-2"],
                    { id: "sanctionFormLevel", name: "level" }
                )
                level_select.ariaLabel = "Level"
                base.create_append(level_div, "label", [], { for: "sanctionFormLevel" }).innerText = "Level"
                for (const level of Object.values(events.SanctionLevel)) {
                    level_select.options.add(base.create_element("option", [], { value: level, label: level }))
                }
                level_select.required = true
            }
            // _________________________________________________________________________________________ Category Select
            {
                const category_div = base.create_append(select_div, "div", ["form-floating"])
                const category_select = base.create_append(category_div, "select", ["form-select", "my-2"],
                    { id: "sanctionFormCategory", name: "category" }
                )
                category_select.ariaLabel = "Category"
                base.create_append(category_div, "label", [], { for: "sanctionFormCategory" }).innerText = "Category"
                category_select.options.add(base.create_element("option", [], { value: "", label: "N/A" }))
                for (const category of Object.values(events.SanctionCategory)) {
                    category_select.options.add(base.create_element("option", [], { value: category, label: category }))
                }
                category_select.required = false
            }
            const buttons_div = base.create_append(form, "div", ["d-flex", "my-2"])
            const submit_button = base.create_append(buttons_div, "button", ["btn", "btn-primary", "me-2"],
                { type: "submit" }
            )
            submit_button.innerText = "Add Sanction"
            form.addEventListener("submit", (ev) => { ev.preventDefault(); this.add_sanction(new FormData(form)) })
        }
        // _____________________________________________________________________________________________________ Results
        if (this.target.ratings && Object.keys(this.target.ratings).length > 0) {
            base.create_append(this.root, "h2", ["mt-4"]).innerText = "Events"
            const nav = base.create_append(this.root, "nav")
            const nav_div = base.create_append(nav, "div", ["nav", "nav-tabs"], { role: "tablist" })
            const ratings = Object.values(this.target.ratings)
            const categories = new Set(ratings.map(r => utils.ranking_category(r.tournament)))
            for (const category of categories) {
                const category_str = category.replaceAll(" ", "")
                const nav_tab = base.create_append(nav_div, "button", ["nav-link"], {
                    id: `navTab${category_str}`,
                    "data-bs-toggle": "tab",
                    "data-bs-target": `#nav${category_str}`,
                    type: "button",
                    role: "tab",
                    "aria-controls": `nav${category_str}`,
                    "aria-selected": "false",
                })
                console.log()
                nav_tab.innerHTML = (category + " " +
                    `<span class="badge text-bg-primary align-text-top">${this.target.ranking[category] ?? 0}</span>`
                )
            }
            const first_tab = nav_div.querySelector("button")
            first_tab.ariaSelected = "true"
            first_tab.classList.add("active")
            const tabs = base.create_append(this.root, "div", ["tab-content"])
            const cutoff = DateTime.now().set({ hour: 0, minute: 0, millisecond: 0 }).minus({ months: 18 })
            for (const category of categories) {
                const category_str = category.replaceAll(" ", "")
                const tab = base.create_append(tabs, "div", ["tab-pane", "fade"], {
                    id: `nav${category_str}`,
                    role: "tabpanel",
                    "aria-labelledby": `navTab${category_str}`,
                    tabindex: "0",
                })
                const results_table = base.create_append(tab, "table",
                    ["my-2", "table", "table-striped", "table-hover"]
                )
                const head = base.create_append(results_table, "thead")
                const row = base.create_append(head, "tr", ["align-middle"])
                for (const header of ["Tournament", "Date", "Rank", "Result", "RTPs"]) {
                    base.create_append(row, "th", [], { scope: "col" }).innerText = header
                }
                const body = base.create_append(results_table, "tbody")
                const category_ratings = ratings.filter(r => utils.ranking_category(r.tournament) == category)
                category_ratings.sort(
                    (a, b) => utils.datetime(b.tournament).toMillis() - utils.datetime(a.tournament).toMillis()
                )
                const top_8 = (category_ratings
                    .filter(r => utils.datetime(r.tournament) > cutoff)
                    .sort((a, b) => b.rating_points - a.rating_points)
                    .slice(0, 8)
                    .map(r => r.tournament.uid)
                )
                for (const rating of category_ratings) {
                    const row = base.create_append(body, "tr", ["align-middle"])
                    const name_cell = base.create_append(row, "th", [], { scope: "row" })
                    const link = base.create_append(name_cell, "a", [],
                        { href: `/tournament/${rating.tournament.uid}/display.html` }
                    )
                    var name = rating.tournament.name
                    if (name.length > 50) {
                        name = name.slice(0, 49) + "…"
                    }
                    link.innerText = name
                    const start = utils.date_string(rating.tournament)
                    base.create_append(row, "td").innerText = start
                    base.create_append(row, "td").innerHTML = utils.tournament_rank_badge(rating.tournament)
                    base.create_append(row, "td").innerHTML = utils.tournament_result_string(rating)
                    if (top_8.includes(rating.tournament.uid)) {
                        base.create_append(row, "td").innerHTML = (
                            `<span class="badge text-bg-primary align-text-top">${rating.rating_points}</span>`
                        )
                    } else {
                        base.create_append(row, "td").innerHTML = (
                            `<span class="badge text-bg-secondary align-text-top">${rating.rating_points}</span>`
                        )
                    }
                }
            }
            tabs.querySelector("div").classList.add("show", "active")
            nav_div.querySelectorAll('button').forEach(triggerEl => {
                const tabTrigger = new bootstrap.Tab(triggerEl)
                triggerEl.addEventListener('click', event => {
                    event.preventDefault()
                    tabTrigger.show()
                })
            })
        }
    }
    async load_cities() {
        if (!this.target.country || this.target.country.length < 1) {
            this.cities = new Map()
            return
        }
        const res = await base.do_fetch(`/api/vekn/country/${this.target.country}/city`, {})
        this.cities = new Map(Object.entries(await res.json()))
    }
    async reload_target(target: d.Member) {
        this.target = target
        await this.load_cities()
        await this.vekn_modal.init(this.token, this.member.uid, this.target.uid)
        this.display()
    }
    async remove_vekn() {
        if (this.member.uid == this.target.uid) {
            // reload required, because we need to change the session's token
            window.location.href = "/vekn/abandon"
        } else {
            const res = await base.do_fetch_with_token(`/api/vekn/members/${this.target.uid}/vekn`, this.token,
                { method: "delete" }
            )
            if (res) {
                await this.reload_target(await res.json())
            }
        }
    }
    async new_vekn() {
        const res = await base.do_fetch_with_token(`/api/vekn/members/${this.target.uid}/sponsor`, this.token,
            { method: "post" }
        )
        if (res) {
            await this.reload_target(await res.json())
        }
    }
    async remove_role(role: d.MemberRole) {
        const res = await base.do_fetch_with_token(`/api/vekn/members/${this.target.uid}/remove_role`, this.token,
            { method: "post", body: JSON.stringify({ role: role }) }
        )
        if (res) {
            await this.reload_target(await res.json())
        }
    }
    async add_role(role: d.MemberRole) {
        const res = await base.do_fetch_with_token(`/api/vekn/members/${this.target.uid}/add_role`, this.token,
            { method: "post", body: JSON.stringify({ role: role }) }
        )
        if (res) {
            await this.reload_target(await res.json())
        }
    }
    async change_info() {
        const info: d.MemberInfo = {
            name: null,
            country: null,
            city: null,
            nickname: null,
            email: null,
            whatsapp: null,
        }
        if (this.name.value != this.target.name) { info.name = this.name.value }
        if (this.email.value != this.target.email) { info.email = this.email.value }
        if (this.whatsapp.value != this.target.whatsapp) { info.whatsapp = this.whatsapp.value }
        const selected_country = this.country_select.options[this.country_select.selectedIndex].value
        if (selected_country != this.target.country) { info.country = selected_country }
        if (this.city_select.value != this.target.city) { info.city = this.city_select.value }
        // TODO add the nickname field
        const res = await base.do_fetch_with_token(`/api/vekn/members/${this.target.uid}/info`, this.token,
            { method: "post", body: JSON.stringify(info) }
        )
        if (res) {
            await this.reload_target(await res.json())
        }
    }
    async unlink_discord() {
        const res = await base.do_fetch_with_token(`/api/vekn/members/unlink_discord`, this.token,
            { method: "post" }
        )
        if (res) {
            await this.reload_target(await res.json())
        }
    }
    async remove_sanction(sanction: d.Sanction) {
        const res = await base.do_fetch_with_token(`/api/vekn/members/${this.target.uid}/sanction/${sanction.uid}`,
            this.token, { method: "delete" }
        )
        if (res) {
            await this.reload_target(await res.json())
        }
    }
    async add_sanction(data: FormData) {
        const res = await base.do_fetch_with_token(`/api/vekn/members/${this.target.uid}/sanction`,
            this.token, { method: "post", body: JSON.stringify(Object.fromEntries(data.entries())) }
        )
        if (res) {
            await this.reload_target(await res.json())
        }
    }
}

async function load() {
    const contentDiv = document.getElementById("contentDiv") as HTMLDivElement
    if (!contentDiv) { return }
    const display = new MemberDisplay(contentDiv)
    const token = await base.fetchToken()
    await display.init(token, new URL(window.location.href))
}


window.addEventListener("load", (ev) => { load() })
