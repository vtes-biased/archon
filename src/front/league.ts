import * as d from "./d"
import * as base from "./base"
import * as member from "./member"
import * as utils from "./utils"
import * as bootstrap from 'bootstrap'
import DOMPurify from 'isomorphic-dompurify'
import { marked, Tokens } from 'marked'
import * as tempusDominus from '@eonasdan/tempus-dominus'
import { biOneIcons } from '@eonasdan/tempus-dominus/dist/plugins/bi-one'
import { DateTime } from "luxon"


export class LeagueDisplay {
    root: HTMLDivElement
    confirmation_modal: base.ConfirmationModal
    countries: Map<string, d.Country>
    token: base.Token
    user: d.Person
    members_map: member.MembersDB
    league: d.LeagueWithTournaments
    alert: HTMLDivElement
    // form inputs
    name: HTMLInputElement
    format: HTMLSelectElement
    ranking: HTMLSelectElement
    online: HTMLInputElement
    country: HTMLSelectElement
    start: HTMLInputElement
    finish: HTMLInputElement
    timezone: HTMLSelectElement
    description: HTMLTextAreaElement
    organizers: d.PublicPerson[]
    constructor(root: HTMLDivElement) {
        this.root = base.create_append(root, "div")
        this.confirmation_modal = new base.ConfirmationModal(root)
    }
    async init(
        token: base.Token | undefined = undefined,
        members_map: member.MembersDB | undefined = undefined,
        countries: d.Country[] | undefined = undefined,
        league_uid: string | undefined = undefined,
    ) {
        this.token = token
        var user_id: string
        if (this.token) {
            user_id = base.user_uid_from_token(token)
        }
        if (!countries) {
            const res = await base.do_fetch("/api/vekn/country", {})
            countries = await res.json() as d.Country[]
        }
        this.countries = new Map(countries.map(c => [c.country, c]))
        if (members_map) {
            this.members_map = members_map
        } else if (user_id) {
            this.members_map = new member.MembersDB(token)
            await this.members_map.init()
        }
        if (user_id) {
            this.user = await this.members_map.get_by_uid(user_id)
            this.organizers = [member.to_public_person(this.user)]
        }
        if (league_uid) {
            const res = await base.do_fetch_with_token(`/api/leagues/${league_uid}`, this.token, {})
            if (res) {
                this.league = await res.json()
                this.organizers = this.league.organizers
            }
        }
    }
    set_alert(message: string, level: d.AlertLevel) {
        if (!this.alert) { return }
        this.alert.innerHTML = message
        this.alert.classList.remove("alert-info", "alert-success", "alert-warning", "alert-danger")
        switch (level) {
            case d.AlertLevel.INFO:
                this.alert.classList.add("alert-info")
                break;
            case d.AlertLevel.SUCCESS:
                this.alert.classList.add("alert-success")
                break;
            case d.AlertLevel.WARNING:
                this.alert.classList.add("alert-warning")
                break;
            case d.AlertLevel.DANGER:
                this.alert.classList.add("alert-sanger")
                break;
            default:
                break;
        }
    }
    async display() {
        if (this.league) {
            this.organizers = this.league.organizers
        } else {
            this.display_form()
            return
        }
        base.remove_children(this.root)
        this.alert = base.create_append(this.root, "div", ["alert"], { role: "alert" })
        // ------------------------------------------------------------------------------------------------------- Title
        base.create_append(this.root, "h1", ["mb-2"]).innerText = this.league.name
        // ----------------------------------------------------------------------------------------------------- Buttons
        if (member.can_admin_league(this.user, this.league)) {
            const buttons_div = base.create_append(this.root, "div", ["d-sm-flex", "mt-4", "mb-2"])
            const edit_button = base.create_append(buttons_div, "button", ["btn", "btn-primary", "me-2", "mb-2"])
            edit_button.innerHTML = '<i class="bi bi-pencil"></i> Edit'
            edit_button.addEventListener("click", (ev) => this.display_form())
            if (this.user.roles.includes(d.MemberRole.ADMIN)) {
                const delete_button = base.create_append(buttons_div, "a",
                    ["btn", "btn-danger", "text-nowrap", "me-2", "mb-2"],
                    { role: "button" }
                )
                delete_button.innerHTML = '<i class="bi bi-trash"></i> Delete'
                delete_button.addEventListener("click", (ev) => this.confirmation_modal.show(
                    "This will permanently and officially delete this league<br>" +
                    "<em>Tournaments will be kept</em>",
                    () => this.delete_league()
                ))
            }
            this.set_alert("To add a tournament, set the league in the tournament info page.", d.AlertLevel.INFO)
        }
        // ------------------------------------------------------------------------------------------------------ Badges
        const badges_div = base.create_append(this.root, "div", ["mt-2", "d-md-flex"])
        const format_badge = base.create_append(badges_div, "span", ["me-2", "mb-2", "text-nowrap", "badge"])
        format_badge.innerText = this.league.format
        switch (this.league.format) {
            case d.TournamentFormat.Standard:
                format_badge.classList.add("text-bg-secondary")
                break;
            case d.TournamentFormat.Limited:
                format_badge.classList.add("text-bg-warning")
                break;
            case d.TournamentFormat.Draft:
                format_badge.classList.add("text-bg-info")
                break;
        }
        const ranking_badge = base.create_append(badges_div, "span", ["me-2", "mb-2", "text-nowrap", "badge"])
        ranking_badge.innerText = this.league.ranking
        switch (this.league.ranking) {
            case d.LeagueRanking.RTP:
                ranking_badge.classList.add("text-bg-primary")
                break;
            case d.LeagueRanking.GP:
                ranking_badge.classList.add("text-bg-warning")
                break;
            case d.LeagueRanking.Score:
                ranking_badge.classList.add("text-bg-secondary")
                break;
        }
        if (this.league.online) {
            base.create_append(badges_div, "span",
                ["me-2", "mb-2", "text-nowrap", "badge", "text-bg-info"]
            ).innerText = "Online"
        }
        // ------------------------------------------------------------------------------------------------- Date & Time
        const datetime_div = base.create_append(badges_div, "div", ["d-md-flex", "mb-2"])
        const start = base.create_append(datetime_div, "div", ["me-2"])
        start.innerText = utils.date_string(this.league)
        if (this.league.finish && this.league.finish.length > 0) {
            base.create_append(datetime_div, "div", ["me-2"]).innerHTML = '<i class="bi bi-arrow-right"></i>'
            const finish = base.create_append(datetime_div, "div", ["me-2"])
            finish.innerText = utils.date_string_finish(this.league)
        }
        // -------------------------------------------------------------------------------------------------- Contenders
        if (this.league.rankings.length > 0) {
            base.create_append(this.root, "div", ["d-md-flex", "mb-2"]).innerText = (
                `${this.league.rankings.length} contenders`
            )
        }
        // -------------------------------------------------------------------------------------------------- Organizers
        if (this.user) {
            const table = base.create_append(this.root, "table", ["table", "table-striped", "my-2"])
            const head = base.create_append(table, "thead")
            const row = base.create_append(head, "tr", ["align-middle"])
            base.create_append(row, "th", [], { scope: "col", colspan: "3" }).innerText = "Organizers"
            const body = base.create_append(table, "tbody")
            for (const person of this.organizers.values()) {
                body.append(this.create_organizer_row(person, false))
            }
        }
        // ------------------------------------------------------------------------------------------------- Description
        if (this.league.description) {
            const description_div = base.create_append(this.root, "div", ["mt-5", "mb-1"])
            const renderer = new marked.Renderer();
            const linkRenderer = renderer.link;
            renderer.link = ({ href, title, tokens }: Tokens.Link): string => {
                const html = linkRenderer.call(renderer, { href, title, tokens });
                return html.replace(/^<a /, '<a target="_blank" rel="nofollow noreferrer" ');
            };
            description_div.innerHTML = DOMPurify.sanitize(
                await marked(this.league.description, { renderer: renderer }),
                { ADD_ATTR: ['target'] }
            )
        }
        // ------------------------------------------------------------------------------------------------- Tournaments
        if (this.league.tournaments) {
            base.create_append(this.root, "h3").innerText = "Tournaments"
            const table = base.create_append(this.root, "table",
                ["table", "table-striped", "table-hover", "table-responsive", "mb-2"]
            )
            const head = base.create_append(table, "thead")
            const row = base.create_append(head, "tr", ["align-middle"])
            const headers = ["Name", "Date"]
            if (!this.league.online) {
                headers.push("Location")
            }
            headers.push("")  // status
            for (const header of headers) {
                base.create_append(row, "th", [], { scope: "col" }).innerText = header
            }
            const body = base.create_append(table, "tbody")
            for (const tournament of this.league.tournaments) {
                const row = base.create_append(body, "tr")
                row.addEventListener("click", (ev) => {
                    window.location.assign(`/tournament/${tournament.uid}/display.html`)
                })
                var name = tournament.name
                if (name.length > 50) {
                    name = name.slice(0, 49) + "…"
                }
                base.create_append(row, "th", ["smaller-font"], { scope: "row" }).innerText = name
                const date = base.create_append(row, "td", ["smaller-font"])
                date.innerText = utils.datetime_string(tournament)
                const location = base.create_append(row, "td", ["smaller-font"])
                if (tournament.online) {
                    location.innerText = "Online"
                } else if (this.league.country) {
                    location.innerText = tournament.venue
                } else {
                    location.innerText = `${tournament.country} ${tournament.country_flag}`
                }
                const status_cell = base.create_append(row, "td", ["smaller-font"])
                const status_badge = base.create_append(status_cell, "span", ["me-2", "mb-2", "text-nowrap", "badge"])
                switch (tournament.state) {
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
        }
        // ----------------------------------------------------------------------------------------------------- Ranking
        if (this.user) {
            base.create_append(this.root, "h3").innerText = "Rankings"
            const table = base.create_append(this.root, "table", ["table", "table-striped"])
            const thead = base.create_append(table, "thead")
            const tr = base.create_append(thead, "tr", ["align-middle"])
            for (const header of ["Rank", "VEKN #", "Name", "City", "Country", "Result"]) {
                base.create_append(tr, "th", [], { scope: "col" }).innerText = header
            }
            const tbody = base.create_append(table, "tbody")
            for (const [rank, player] of this.league.rankings) {
                const tr = base.create_append(tbody, "tr", ["align-middle"])
                const classes = ["text-nowrap"]
                if (rank == 1 && utils.datetime_finish(this.league) < DateTime.now()) {
                    classes.push("bg-warning-subtle")
                } else if (player.uid == this.user.uid) {
                    classes.push("bg-primary-subtle")
                }
                base.create_append(tr, "th", classes, { scope: "row" }).innerText = rank.toString()
                base.create_append(tr, "td", classes).innerText = player.vekn
                base.create_append(tr, "td", classes).innerText = player.name
                base.create_append(tr, "td", classes).innerText = player.city
                base.create_append(tr, "td", classes).innerText = `${player.country} ${player.country_flag}`
                if (this.league.ranking == d.LeagueRanking.Score) {
                    base.create_append(tr, "td", classes).innerHTML = (
                        `${utils.score_string_with_tp_badge(player.score)} / ${player.tournaments.length}`
                    )
                } else {
                    base.create_append(tr, "td", classes).innerText = (
                        `${player.points} (${utils.score_string(player.score)} / ${player.tournaments.length})`
                    )
                }
            }
        }
    }
    async delete_league() {
        const res = await base.do_fetch_with_token(
            `/api/leagues/${this.league.uid}`,
            this.token,
            { method: "delete" }
        )
        if (!res) { return }
        window.location.href = "/league/list.html"
    }
    display_form() {
        base.remove_children(this.root)
        const form = base.create_append(this.root, "form", ["row", "g-3", "mt-3", "needs-validation"])
        form.noValidate = true
        form.addEventListener("submit", (ev) => this.submit_league(ev))
        // ------------------------------------------------------------------------------------------------------ line 1
        { // name
            const div = base.create_append(form, "div", ["col-md-6"])
            const group = base.create_append(div, "div", ["input-group", "form-floating", "has-validation"])
            this.name = base.create_append(group, "input", ["form-control", "z-1"], {
                id: "tournamentName",
                type: "text",
                name: "name",
                placeholder: "Tournament Name",
                autocomplete: "new-name",
                spellcheck: "false",
            })
            if (this.league?.name && this.league.name.length > 0) {
                this.name.value = this.league.name
            }
            this.name.ariaAutoComplete = "none"
            this.name.required = true
            this.name.addEventListener("change", (ev) => { this.name.form.classList.add("was-validated") })
            base.create_append(group, "div", ["invalid-feedback"]).innerText = "Choose a name for your league"
            base.create_append(group, "label", ["form-label"], { for: "leagueName" }).innerText = "League name"
        }
        { // format
            const div = base.create_append(form, "div", ["col-md-3"])
            const group = base.create_append(div, "div", ["input-group", "form-floating", "has-validation"])
            this.format = base.create_append(group, "select", ["form-select", "z-1"],
                { name: "format", id: "selectFormat" }
            )
            this.format.required = true
            for (const value of Object.values(d.TournamentFormat)) {
                const option = base.create_append(this.format, "option")
                option.innerText = value
                option.value = value
            }
            if (this.league) {
                this.format.value = this.league.format
            } else {
                this.format.value = d.TournamentFormat.Standard
            }
            base.create_append(group, "label", ["form-label"], { for: "selectFormat" }).innerText = "Format"
        }
        { // ranking
            const div = base.create_append(form, "div", ["col-md-3"])
            const group = base.create_append(div, "div", ["input-group", "form-floating", "has-validation"])
            this.ranking = base.create_append(group, "select", ["form-select", "z-1"],
                { name: "ranking", id: "selectRanking" }
            )
            for (const value of Object.values(d.LeagueRanking)) {
                const option = base.create_append(this.ranking, "option")
                option.innerText = value
                option.value = value
                if (this.league?.ranking == value) {
                    option.selected = true
                } else {
                    option.selected = false
                }
            }
            if (this.league) {
                this.ranking.value = this.league.ranking
            } else {
                this.ranking.value = d.LeagueRanking.RTP
            }
            base.create_append(group, "label", ["form-label"], { for: "selectRanking" }).innerText = "Ranking"
        }
        // ------------------------------------------------------------------------------------------------------ line 2
        { // online
            const div = base.create_append(form, "div", ["col-md-2", "d-flex", "align-items-center"])
            const field_div = base.create_append(div, "div", ["form-check", "form-switch"])
            this.online = base.create_append(field_div, "input", ["form-check-input"],
                { type: "checkbox", name: "online", id: "switchOnline" }
            )
            base.create_append(field_div, "label", ["form-check-label"], { for: "switchOnline" }).innerText = "Online"
            this.online.addEventListener("change", (ev) => this.switch_online())
            if (this.league?.online) {
                this.online.checked = true
            } else {
                this.online.checked = false
            }
        }
        { // country
            const div = base.create_append(form, "div", ["col-md-4"])
            this.country = base.create_append(div, "select", ["form-select"], { name: "country" })
            this.country.ariaLabel = "Country"
            this.country.required = false
            this.country.options.add(base.create_element("option", [], { value: "", label: "Worldwide 🌍" }))
            for (const country of this.countries.values()) {
                const option = document.createElement("option")
                option.value = country.country
                option.label = `${country.country} ${country.flag}`
                this.country.options.add(option)
                if (this.league?.country == country.country) {
                    option.selected = true
                }
            }
            if (this.league?.online) {
                this.country.selectedIndex = 0
                this.country.disabled = true
            }
        }
        // filler
        base.create_append(form, "div", ["w-100"])
        // ------------------------------------------------------------------------------------------------------ line 5
        var start_week: number = 1  // Monday
        if (["en-US", "pt-BR"].includes(
            (navigator.languages && navigator.languages.length) ? navigator.languages[0] : ""
        )) {
            start_week = 7
        }
        { // start
            const div = base.create_append(form, "div", ["col-md-4"])
            const group = base.create_append(div, "div",
                ["input-group", "form-floating", "has-validation"],
                { id: "pickerStart" }
            )
            group.dataset.tdTargetInput = "nearest"
            group.dataset.tdTargetToggle = "nearest"
            this.start = base.create_append(group, "input", ["form-control", "z-1"], {
                id: "leagueStart",
                type: "text",
                name: "start",
                autocomplete: "off",
                spellcheck: "false"
            })
            this.start.ariaLabel = "Start"
            this.start.ariaAutoComplete = "none"
            this.start.dataset.tdTarget = "#pickerStart"
            this.start.required = true
            this.start.pattern = /\d{4}\-\d{2}\-\d{2}\s\d{2}:\d{2}/.source
            base.create_append(group, "label", ["form-label"], { for: "tournamentStart" }).innerText = "Start"
            const span = base.create_append(group, "span", ["input-group-text"])
            span.dataset.tdTarget = "#pickerStart"
            span.dataset.tdToggle = "datetimepicker"
            base.create_append(span, "i", ["bi", "bi-calendar"])
            if (this.league?.start && this.league.start.length > 0) {
                this.start.value = this.league.start
            }
            new tempusDominus.TempusDominus(group, {
                display: { icons: biOneIcons },
                localization: { format: "yyyy-MM-dd HH:mm", hourCycle: "h23", startOfTheWeek: start_week },
                stepping: 15,
                promptTimeOnDateChange: true
            })
            base.create_append(group, "div", ["invalid-feedback"]).innerText = "A start date is required"
        }
        { // finish
            const div = base.create_append(form, "div", ["col-md-4"])
            const group = base.create_append(div, "div",
                ["input-group", "form-floating", "has-validation"],
                { id: "pickerFinish" }
            )
            group.dataset.tdTargetInput = "nearest"
            group.dataset.tdTargetToggle = "nearest"
            this.finish = base.create_append(group, "input", ["form-control", "z-1"], {
                id: "tournamentFinish",
                type: "text",
                name: "finish",
                autocomplete: "off",
                spellcheck: "false"
            })
            this.finish.ariaLabel = "Finish"
            this.finish.ariaAutoComplete = "none"
            this.finish.dataset.tdTarget = "#pickerFinish"
            this.finish.pattern = /\d{4}\-\d{2}\-\d{2}\s\d{2}:\d{2}/.source
            base.create_append(group, "label", ["form-label"], { for: "tournamentFinish" }).innerText = "Finish"
            const span = base.create_append(group, "span", ["input-group-text"])
            span.dataset.tdTarget = "#pickerFinish"
            span.dataset.tdToggle = "datetimepicker"
            base.create_append(span, "i", ["bi", "bi-calendar"])
            if (this.league?.finish && this.league.finish.length > 0) {
                this.finish.value = this.league.finish
            }
            new tempusDominus.TempusDominus(group, {
                display: { icons: biOneIcons },
                localization: { format: "yyyy-MM-dd HH:mm", hourCycle: "h23", startOfTheWeek: start_week },
                stepping: 15,
                promptTimeOnDateChange: true
            })
            base.create_append(group, "div", ["valid-feedback"]).innerText = "Optional finish date/time"
        }
        { // timezone
            const div = base.create_append(form, "div", ["col-md-4"])
            const group = base.create_append(div, "div", ["input-group", "form-floating"])
            this.timezone = base.create_append(group, "select", ["form-select"],
                { id: "timezoneSelect", name: "timezone" }
            )
            this.timezone.ariaLabel = "Timezone"
            this.timezone.required = true
            base.create_append(group, "label", ["form-label"], { for: "timezoneSelect" }).innerText = "Timezone"
            const browser_timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
            for (const tz of Intl.supportedValuesOf('timeZone')) {
                const option = document.createElement("option") as HTMLOptionElement
                option.value = tz
                option.label = tz
                if (this.league?.timezone && this.league.timezone.length > 0) {
                    if (tz == this.league.timezone) {
                        option.selected = true
                    }
                }
                else if (tz == browser_timezone) {
                    option.selected = true
                }
                this.timezone.append(option)
            }
        }
        // ------------------------------------------------------------------------------------------------------ line 6
        {
            const div = base.create_append(form, "div", ["position-relative", "col-12"])
            this.description = base.create_append(div, "textarea", ["form-control"],
                { rows: "8", name: "description", placeholder: "Description" }
            )
            const mardown_link = base.create_append(div, "a",
                ["btn", "btn-sm", "btn-outline-primary", "mb-2", "me-3", "position-absolute", "bottom-0", "end-0"],
                { href: "https://www.markdownguide.org/basic-syntax/", target: "_blank" }
            )
            mardown_link.innerText = "Markdown"
            base.create_append(mardown_link, "i", ["bi", "bi-question-circle-fill"])
            if (this.league?.description && this.league.description.length > 0) {
                this.description.value = this.league.description
            }
        }
        // -------------------------------------------------------------------------------------------------- Organizers
        {
            const table = base.create_append(form, "table", ["table", "table-striped", "my-2"])
            const head = base.create_append(table, "thead")
            const row = base.create_append(head, "tr", ["align-middle"])
            base.create_append(row, "th", [], { scope: "col", colspan: "3" }).innerText = "Organizers"
            const body = base.create_append(table, "tbody")
            for (const organizer of this.organizers.values()) {
                body.append(this.create_organizer_row(organizer, true))
            }
            const lookup_row = base.create_append(body, "tr", ["align-middle"])
            const lookup_cell = base.create_append(body, "td", [], { colspan: "3" })
            const lookup = new member.PersonLookup(this.members_map, lookup_cell, "Add Judge", true)
            lookup.form.addEventListener("submit", (ev) => {
                ev.preventDefault()
                const person = lookup.person
                lookup.reset()
                if (this.league.organizers.some(j => j.uid == person.uid)) { return }
                this.league.organizers.push(person)
                body.insertBefore(this.create_organizer_row(person, true), lookup_row)
            })
        }
        // ------------------------------------------------------------------------------------------------------ submit
        {
            const div = base.create_append(form, "div", ["col-auto", "mb-2"])
            base.create_append(div, "button", ["btn", "btn-primary", "me-2"], { type: "submit" }).innerText = "Submit"
            const cancel_button = base.create_append(div, "button", ["btn", "btn-secondary", "me-2"],
                { type: "button" }
            )
            cancel_button.innerText = "Cancel"
            if (this.league) {
                cancel_button.addEventListener("click", (ev) => this.display())
            } else {
                cancel_button.addEventListener("click", (ev) => history.back())
            }
        }
    }
    create_organizer_row(member: d.PublicPerson, edit: boolean) {
        const row = base.create_element("tr")
        base.create_append(row, "th", [], { scope: "row" }).innerText = member.vekn
        base.create_append(row, "td", ["w-100"]).innerText = member.name
        const actions = base.create_append(row, "td")
        if (edit && this.user.uid != member.uid) {
            const button = base.create_append(actions, "button", ["btn", "btn-sm", "btn-danger", "me-2"])
            button.innerHTML = '<i class="bi bi-x-circle-fill"></i>'
            const tip = base.add_tooltip(button, "Remove")
            button.addEventListener("click", (ev) => {
                tip.dispose()
                this.league.organizers = [...this.league.organizers.filter(j => j.uid != member.uid)]
                row.remove()
            })
        }
        return row
    }
    switch_online() {
        // No country for online tournaments
        if (this.online.checked) {
            this.country.options.selectedIndex = 0
            this.country.disabled = true
            this.country.required = false
            this.country.dispatchEvent(new Event('change', { bubbles: true }))
        } else {
            this.country.disabled = false
        }
    }
    async submit_league(ev: Event) {
        // create or update league
        ev.preventDefault()
        const form = ev.currentTarget as HTMLFormElement
        if (!form.checkValidity()) {
            ev.preventDefault()
            ev.stopPropagation()
            form.classList.add('was-validated')
            return
        }
        form.classList.add('was-validated')
        const leagueForm = ev.currentTarget as HTMLFormElement
        const data = new FormData(leagueForm)
        var json_data = Object.fromEntries(data.entries()) as unknown as d.League
        // fix fields that need some fixing
        if (json_data.finish.length < 1) { json_data.finish = undefined }
        json_data.organizers = [...this.organizers.values()]
        console.log("sending", json_data)
        // checkboxes are "on" if checked, non-listed otherwise - do it by hand
        var url = "/api/leagues/"
        var method = "post"
        if (this.league) {
            // we are in edit mode
            url += `${this.league.uid}/`
            method = "put"
        }
        console.log("url", url)
        const res = await base.do_fetch_with_token(url, this.token, {
            method: method, body: JSON.stringify(json_data)
        })
        if (!res) { return }
        const response = await res.json()
        window.location.href = response.url
    }
}
