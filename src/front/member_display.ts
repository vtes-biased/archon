import * as base from "./base"
import * as d from "./d"
import * as m from "./member"
import * as events from "./events"
import { score_string } from "./tournament_display"
import { DateTime, DateTimeFormatOptions } from 'luxon'


function tournament_result_string(result: d.TournamentRating): string {
    return (
        `<strong>${result.rank}.</strong> `
        + `${score_string(result.result)} `
        + `<span class="badge text-bg-secondary align-text-top">${result.result.tp}TPs</span>`
    )
}

class MemberDisplay {
    root: HTMLDivElement
    token: base.Token
    member: d.Member | undefined
    target: d.Member | undefined
    countries: Map<string, d.Country>
    cities: Map<string, d.City>
    members_map: m.MemberMap
    // form
    country_select: HTMLSelectElement
    city_select: HTMLSelectElement
    constructor(root: HTMLDivElement, page_size: number = 100) {
        this.root = root
    }
    async init(token: base.Token, url: URL | undefined, countries: d.Country[] | undefined = undefined) {
        this.token = token
        this.members_map = new m.MemberMap()
        const promises = []
        promises.push(this.members_map.init(this.token))
        if (countries) {
            this.countries = new Map(countries.map(c => [c.country, c]))
        } else {
            promises.push(base.do_fetch("/api/vekn/country", {}).then(
                r => r.json().then(
                    countries => this.countries = new Map(countries.map(c => [c.country, c]))
                )
            ))
        }
        const user_id = JSON.parse(window.atob(token.access_token.split(".")[1]))["sub"]
        const member_fetch = base.do_fetch_with_token(`/api/vekn/members/${user_id}`, token, {}).then(
            r => r.json().then(d => this.member = d)
        )
        if (url.pathname.endsWith("display.html")) {
            const uid = url.pathname.split("/")[2]
            const res = await base.do_fetch_with_token(`/api/vekn/members/${uid}`, token, {})
            this.target = await res.json()
        } else {
            await member_fetch
            this.target = this.member
        }
        if (this.target.country) {
            promises.push(this.load_cities())
        }
        await Promise.all(promises)
        this.display()
    }
    display() {
        base.remove_children(this.root)
        const header = base.create_append(this.root, "h1", ["my-4", "d-flex", "align-items-center"])
        header.append(document.createTextNode(`${this.target.name} `))
        if (this.target.vekn && this.target.vekn.length > 0) {
            const vekn_badge = base.create_append(header, "span", ["badge", "ms-2", "fs-5", "text-bg-secondary"])
            base.create_append(vekn_badge, "i", ["bi", "bi-person-check"])
            vekn_badge.append(document.createTextNode(` ${this.target.vekn}`))
            if (m.can_change_info(this.member, this.target)) {
                const remove = base.create_append(vekn_badge, "button", ["btn", "ms-2", "btn-danger", "rounded-pill", "px-1", "py-0", "border-0"],
                    { role: "button" }
                )
                base.create_append(remove, "i", ["bi", "bi-x"])
            }
        } else if (m.can_sponsor(this.member)) {
            const sponsor = base.create_append(header, "button", ["btn", "ms-2", "btn-success"], { role: "button" })
            base.create_append(sponsor, "i", ["bi", "bi-person-check"])
            sponsor.append(document.createTextNode("Add VEKN#"))
        }
        const badges_row = base.create_append(this.root, "div", ["d-md-flex", "align-items-center"])
        for (const role of this.target.roles) {
            const role_badge = base.create_append(badges_row, "div", ["badge", "me-2", "mb-2", "d-flex", "align-items-center"])
            if (m.can_edit_role(this.member, this.target, role)) {
                role_badge.append(document.createTextNode(`${role} `))
                const remove = base.create_append(role_badge, "button",
                    ["btn", "ms-1", "p-0", "border-0"],
                    { role: "button" }
                )
                base.create_append(remove, "i", ["bi", "bi-x-circle-fill"])
            } else {
                role_badge.innerText = role
            }
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
        const addable_roles = [...Object.values(d.MemberRole).filter(
            r => !this.target.roles.includes(r) && m.can_edit_role(this.member, this.target, r))
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
                const action = base.create_append(li, "a", ["dropdown-item"], { href: "#" })
                action.innerText = role
            }
        }
        const form = base.create_append(this.root, "form")
        // ________________________________________________________________________________________ Row 1: Personal info
        const row_1 = base.create_append(form, "div", ["d-md-flex"])
        // ________________________________________________________________________________________________________ Name
        {
            const div = base.create_append(row_1, "div", ["input-group", "form-floating", "me-2", "mb-2"])
            const name = base.create_append(div, "input", ["form-control"],
                { type: "text", id: "memberFormName", name: "name", "aria-label": "Name", autocomplete: "name" }
            )
            base.create_append(div, "label", ["form-label"], { for: "memberFormName" }).innerText = "Name"
            name.spellcheck = false
            name.value = this.target.name
        }
        // _____________________________________________________________________________________________________ Country
        {
            const div = base.create_append(row_1, "div", ["input-group", "form-floating", "me-2", "mb-2"])
            this.country_select = base.create_append(div, "select", ["form-select"],
                { name: "country", id: "selectCountry", "aria-label": "Country", autocomplete: "country-name" }
            )
            base.create_append(div, "label", ["form-label"], { for: "selectCountry" }).innerText = "Country"
            for (const country of this.countries.values()) {
                const option = base.create_element("option")
                option.value = country.country
                option.label = `${country.country} ${country.flag}`
                if (this.target.country == country.country) {
                    option.selected = true
                }
                this.country_select.options.add(option)
            }
            this.country_select.addEventListener("change", (ev) => {
                this.target.country = this.country_select.value
                this.target.city = undefined
                this.load_cities().then(() => this.display())
            })
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
        }
        // _________________________________________________________________________________________ Row 2: Contact info
        if (m.can_contact(this.member, this.target)) {
            const row_2 = base.create_append(form, "div", ["d-md-flex"])
            // __________________________________________________________________________________________________ E-mail
            if (this.target.email) {
                const div = base.create_append(row_2, "div", ["input-group", "me-2", "mb-2"])
                base.create_append(div, "span", ["input-group-text"]).innerHTML = '<i class="bi bi-envelope"></i>'
                const email = base.create_append(div, "input", ["form-control"],
                    { type: "text", placeholder: "Email", name: "email", "aria-label": "Email", autocomplete: "email" }
                )
                email.spellcheck = false
                email.value = this.target.email
                if (!m.can_change_info(this.member, this.target)) {
                    email.disabled = true
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
                    discord.disabled = true
                }
            } else if (this.target.discord?.id) {
                const discord = base.create_append(row_2, "a", ["btn", "btn-discord", "me-2", "mb-2"],
                    { role: "button", target: "_blank", rel: "noopener noreferrer" }
                )
                discord.href = `https://discordapp.com/channels/@me/${this.target.discord.id}/`
                discord.innerHTML = '<i class="bi bi-discord"></i> Discord'
            }
            // ________________________________________________________________________________________________ Whatsapp
            if (this.member.uid == this.target.uid) {
                const div = base.create_append(row_2, "div", ["input-group", "me-2", "mb-2"])
                base.create_append(div, "span", ["input-group-text"]).innerHTML = '<i class="bi bi-whatsapp"></i>'
                const whatsapp = base.create_append(div, "input", ["form-control"], {
                    type: "text",
                    placeholder: "WhatsApp",
                    name: "whatsapp",
                    "aria-label": "Phone",
                    autocomplete: "mobile tel"
                })
                whatsapp.spellcheck = false
                whatsapp.value = this.target.whatsapp ?? ""
            } else if (this.target.whatsapp) {
                const whatsapp = base.create_append(row_2, "a", ["btn", "btn-whatsapp", "me-2", "mb-2"],
                    { role: "button", target: "_blank", rel: "noopener noreferrer" }
                )
                whatsapp.href = "https://wa.me/" + this.target.whatsapp.replaceAll("-", "").replace(/^[0|\D]*/, "")
                whatsapp.innerHTML = '<i class="bi bi-whatsapp"></i> WhatsApp'
            }
        }
        // ___________________________________________________________________________________________________ Sanctions
        if (m.can_admin(this.member) || (this.target.sanctions && this.target.sanctions.length > 0)) {
            base.create_append(this.root, "h2", ["mt-4"]).innerText = "Sanctions"
        }
        if (this.target.sanctions && this.target.sanctions.length > 0) {
            const sanctions_accordion = base.create_append(this.root, "div", ["accordion"], { id: "sanctionAccordion" })
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
                if (Object.hasOwn(sanction, "tournament_name")) {
                    const rsanction = sanction as d.RegisteredSanction
                    const timestamp = DateTime.fromFormat(
                        `${rsanction.tournament_start} ${rsanction.tournament_timezone}`,
                        "yyyy-MM-dd'T'HH:mm:ss z",
                        { setZone: true }
                    ).toLocal().toLocaleString(DateTime.DATE_SHORT)
                    button.innerText = `(${timestamp}: ${rsanction.tournament_name})`
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
                const listed_judge = this.members_map.by_uid.get(sanction.judge_uid)
                if (listed_judge) {
                    const author = base.create_append(prefix, "div", ["me-2"])
                    author.innerText = `Issued by ${listed_judge.name}`
                }
                // Remove button only for current tournament sanctions
                if (m.can_admin(this.member)) {
                    const remove_button = base.create_append(prefix, "div", ["btn", "badge", "btn-danger"])
                    remove_button.innerHTML = '<i class="bi bi-trash"></i>'
                }
            }
        }
        // ___________________________________________________________________________________________ Add Sanction Form
        if (m.can_admin(this.member)) {
            // Add existing sanctions in display()
            const form = base.create_append(this.root, "form")
            const comment = base.create_append(form, "textarea", ["form-control", "my-2"],
                { type: "text", autocomplete: "new-comment", rows: 3, maxlength: 500, name: "new-comment" }
            )
            comment.ariaAutoComplete = "none"
            comment.spellcheck = false
            comment.placeholder = "Comment"
            const select_div = base.create_append(form, "div", ["d-flex", "gap-1"])
            // ____________________________________________________________________________________________ Level Select
            {
                const level_div = base.create_append(select_div, "div", ["form-floating"])
                const level_select = base.create_append(level_div, "select", ["form-select", "my-2"],
                    { id: "sanctionFormLevel" }
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
                    { id: "sanctionFormCategory" }
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
        }
        // _____________________________________________________________________________________________________ Results
        if (this.target.ratings && Object.keys(this.target.ratings).length > 0) {
            base.create_append(this.root, "h2", ["mt-4"]).innerText = "Events"
            const results_table = base.create_append(this.root, "table",
                ["my-2", "table", "table-striped", "table-hover"]
            )
            const head = base.create_append(results_table, "thead")
            const row = base.create_append(head, "tr", ["align-middle"])
            for (const header of ["Tournament", "Date", "Rank", "Result", "RTPs"]) {
                base.create_append(row, "th", [], { scope: "col" }).innerText = header
            }
            const body = base.create_append(results_table, "tbody")
            for (const rating of Object.values(this.target.ratings)) {
                const row = base.create_append(body, "tr", ["align-middle"])
                base.create_append(row, "th", [], { scope: "row" }).innerText = rating.tournament.name
                const start = DateTime.fromFormat(
                    `${rating.tournament.start} ${rating.tournament.timezone}`,
                    "yyyy-MM-dd'T'HH:mm:ss z",
                    { setZone: true }
                ).toLocal().toLocal().toLocaleString()
                base.create_append(row, "td").innerText = start
                base.create_append(row, "td").innerText = rating.tournament.rank
                base.create_append(row, "td").innerHTML = tournament_result_string(rating)
                base.create_append(row, "td").innerText = rating.rating_points.toString()
            }
        }
    }
    async load_cities() {
        const res = await base.do_fetch(`/api/vekn/country/${this.target.country}/city`, {})
        this.cities = new Map(Object.entries(await res.json()))
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
