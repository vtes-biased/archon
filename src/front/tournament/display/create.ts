import * as bootstrap from "bootstrap"
import * as base from "../../base"
import * as d from "../../d"
import * as member from "../../member"
import * as utils from "../../utils"
import { VenueCompletion, BaseTournamentDisplay } from "./base"
import * as tempusDominus from '@eonasdan/tempus-dominus'
import { biOneIcons } from '@eonasdan/tempus-dominus/dist/plugins/bi-one'


export class CreateTournament extends BaseTournamentDisplay {
    // override token definition (cannot be undefined for creation)
    declare token: base.Token
    // creation display, edit mode in the console info tab
    countries: Map<string, d.Country>
    members_map: member.MembersDB
    user: d.Person
    leagues: d.League[]
    // fields
    declare form: HTMLFormElement
    declare name: HTMLInputElement
    declare format: HTMLSelectElement
    declare rank: HTMLSelectElement
    declare proxies: HTMLInputElement
    declare proxies_label: HTMLLabelElement
    declare multideck: HTMLInputElement
    declare multideck_label: HTMLLabelElement
    declare decklist_required: HTMLInputElement
    declare decklist_required_label: HTMLLabelElement
    declare league: HTMLSelectElement
    declare online: HTMLInputElement
    declare venue: HTMLInputElement
    declare venue_completion: VenueCompletion
    declare country: HTMLSelectElement
    declare venue_url: HTMLInputElement
    declare address: HTMLInputElement
    declare map_url: HTMLInputElement
    declare start: HTMLInputElement
    declare finish: HTMLInputElement
    declare timezone: HTMLSelectElement
    declare description: HTMLTextAreaElement
    declare judges: d.Person[]
    declare cancel_button: HTMLButtonElement
    constructor(root: HTMLDivElement) {
        super(root)
    }
    async init(token: base.Token) {
        super.init(token)
        { // fetch countries
            const res = await base.do_fetch("/api/vekn/country", {})
            if (res) {
                const countries = await res.json() as d.Country[]
                this.countries = new Map(countries.map(c => [c.country, c]))
            }
        }
        if (this.token) {
            // fetch members map
            this.members_map = new member.MembersDB(this.token, this.root)
            await this.members_map.init()
            // fetch user
            const res = await base.do_fetch_with_token(`/api/vekn/members/${this.user_id}`, this.token, {})
            if (res) {
                this.user = await res.json() as d.Person
                this.judges = [this.user]
            }
        }
        { // fetch leagues
            const res = await base.do_fetch("/api/leagues/full", {})
            if (res) {
                this.leagues = await res.json() as d.League[]
            } else {
                this.leagues = []
            }
        }
    }
    create_judge_row(person: d.Person) {
        const row = super.create_judge_row(person)
        const actions = base.create_append(row, "td")
        if (this.user_id != person.uid) {
            const button = base.create_append(actions, "button", ["btn", "btn-sm", "btn-danger", "me-2"])
            button.innerHTML = '<i class="bi bi-x-circle-fill"></i>'
            const tip = base.add_tooltip(button, "Remove")
            button.addEventListener("click", (ev) => {
                tip.dispose()
                this.judges = [...this.judges.filter(j => j.uid != person.uid)]
                row.remove()
            })
        }
        return row
    }
    display() {
        this.display_form()
        this.form.addEventListener("submit", (ev) => this.create_tournament(ev))
        this.cancel_button.addEventListener("click", (ev) => history.back())
    }
    display_form() {
        if (this.venue_completion) {
            this.venue_completion.dispose()
        }
        base.remove_children(this.root)
        this.form = base.create_append(this.root, "form", ["row", "g-3", "mt-3", "needs-validation"])
        this.form.noValidate = true
        // ------------------------------------------------------------------------------------------------------ line 1
        { // name
            const div = base.create_append(this.form, "div", ["col-md-6"])
            const group = base.create_append(div, "div", ["input-group", "form-floating", "has-validation"])
            this.name = base.create_append(group, "input", ["form-control", "z-1"], {
                id: "tournamentName",
                type: "text",
                name: "name",
                placeholder: "Tournament Name",
                autocomplete: "new-name",
                spellcheck: "false",
            })
            this.name.ariaAutoComplete = "none"
            this.name.required = true
            this.name.addEventListener("change", (ev) => { this.form.classList.add("was-validated") })
            base.create_append(group, "div", ["invalid-feedback"]).innerText = "Choose a name for your tournament"
            base.create_append(group, "label", ["form-label"], { for: "tournamentName" }).innerText = "Tournament name"
        }
        { // format
            const div = base.create_append(this.form, "div", ["col-md-3"])
            const group = base.create_append(div, "div", ["input-group", "form-floating", "has-validation"])
            this.format = base.create_append(group, "select", ["form-select", "z-1"], { name: "format", id: "format" })
            this.format.required = true
            for (const value of Object.values(d.TournamentFormat)) {
                const option = base.create_append(this.format, "option")
                option.innerText = value
                option.value = value
            }
            this.format.value = d.TournamentFormat.Standard
            this.format.addEventListener("change", (ev) => { this.change_value(ev); this.update_leagues_options() })
            base.create_append(group, "label", ["form-label"], { for: "format" }).innerText = "Format"
        }
        { // rank
            const div = base.create_append(this.form, "div", ["col-md-3"])
            const group = base.create_append(div, "div", ["input-group", "form-floating", "has-validation"])
            this.rank = base.create_append(group, "select", ["form-select", "z-1"], { name: "rank", id: "rank" })
            for (const value of Object.values(d.TournamentRank)) {
                const option = base.create_append(this.rank, "option")
                option.innerText = value
                option.value = value
            }
            this.rank.value = d.TournamentRank.BASIC
            this.rank.addEventListener("change", (ev) => this.change_value(ev))
            base.create_append(group, "label", ["form-label"], { for: "rank" }).innerText = "Rank"
        }
        // ------------------------------------------------------------------------------------------------------ line 2
        { // proxies
            const div = base.create_append(this.form, "div", ["col-md-2", "d-flex", "align-items-center"])
            const field_div = base.create_append(div, "div", ["form-check", "form-switch"])
            this.proxies = base.create_append(field_div, "input", ["form-check-input"],
                { type: "checkbox", name: "proxies", id: "switchProxy" }
            )
            this.proxies_label = base.create_append(field_div, "label", ["form-check-label"], { for: "switchProxy" })
            this.proxies_label.innerText = "Proxies allowed"
            this.proxies.checked = false
        }
        { // multideck
            const div = base.create_append(this.form, "div", ["col-md-2", "d-flex", "align-items-center"])
            const field_div = base.create_append(div, "div", ["form-check", "form-switch"])
            this.multideck = base.create_append(field_div, "input", ["form-check-input"],
                { type: "checkbox", name: "multideck", id: "switchMultideck" }
            )
            this.multideck_label = base.create_append(field_div, "label", ["form-check-label"],
                { for: "switchMultideck" }
            )
            this.multideck_label.innerText = "Multideck"
            this.multideck.checked = false
            this.multideck.addEventListener("change", (ev) => this.change_value(ev))
        }
        { // decklist
            const div = base.create_append(this.form, "div", ["col-md-2", "d-flex", "align-items-center"])
            const field_div = base.create_append(div, "div", ["form-check", "form-switch"])
            this.decklist_required = base.create_append(field_div, "input", ["form-check-input"],
                { type: "checkbox", name: "decklist_required", id: "switchDecklistRequired" }
            )
            this.decklist_required_label = base.create_append(field_div, "label", ["form-check-label"],
                { for: "switchDecklistRequired" }
            )
            this.decklist_required_label.innerText = "Decklist required"
            this.decklist_required.checked = true
        }
        { // league
            const div = base.create_append(this.form, "div", ["col-md-6", "d-flex", "align-items-center"])
            const group = base.create_append(div, "div", ["input-group", "form-floating", "has-validation"])
            this.league = base.create_append(group, "select", ["form-select", "z-1"],
                { name: "league", id: "selectLeague" }
            )
            const option = base.create_append(this.league, "option")
            option.value = ""
            option.label = ""
            base.create_append(group, "label", ["form-label"], { for: "format" }).innerText = "League"
        }
        // filler
        base.create_append(this.form, "div", ["w-100"])
        // ------------------------------------------------------------------------------------------------------ line 3
        { // online
            const div = base.create_append(this.form, "div", ["col-md-2", "d-flex", "align-items-center"])
            const field_div = base.create_append(div, "div", ["form-check", "form-switch"])
            this.online = base.create_append(field_div, "input", ["form-check-input"],
                { type: "checkbox", name: "online", id: "switchOnline" }
            )
            base.create_append(field_div, "label", ["form-check-label"], { for: "switchOnline" }).innerText = "Online"
            this.online.addEventListener("change", (ev) => { this.change_value(ev); this.update_leagues_options() })
            this.online.checked = false
        }
        { // country
            const div = base.create_append(this.form, "div", ["col-md-4"])
            this.country = base.create_append(div, "select", ["form-select"], { name: "country" })
            this.country.ariaLabel = "Country"
            this.country.options.add(base.create_element("option", [], { value: "", label: "Country" }))
            for (const country of this.countries.values()) {
                const option = document.createElement("option")
                option.value = country.country
                option.label = `${country.country} ${country.flag}`
                this.country.options.add(option)
            }
            this.country.required = true
            base.create_append(div, "div", ["invalid-feedback"]).innerText = "If not online, a country is required"
            this.country.addEventListener("change", (ev) => this.change_value(ev))
        }
        { // venue
            const div = base.create_append(this.form, "div", ["col-md-6"])
            this.venue = base.create_append(div, "input", ["form-control"],
                { type: "text", name: "venue", placeholder: "Venue", autocomplete: "section-venue organization", spellcheck: "false" }
            )
            this.venue.ariaLabel = "Venue"
            this.venue.ariaAutoComplete = "list"
            this.venue.disabled = true
            this.venue.addEventListener("change", (ev) => this.change_value(ev))
        }
        // ------------------------------------------------------------------------------------------------------ line 4
        { // venue_url
            const div = base.create_append(this.form, "div", ["col-md-4"])
            const group = base.create_append(div, "div", ["input-group"])
            base.create_append(group, "i", ["input-group-text", "bi", "bi-link-45deg"])
            this.venue_url = base.create_append(group, "input", ["form-control"],
                { type: "text", name: "venue_url", placeholder: "Venue URL", autocomplete: "section-venue url", spellcheck: "false" }
            )
            this.venue_url.ariaLabel = "Venue URL"
            this.venue_url.ariaAutoComplete = "list"
            this.venue_url.disabled = true
        }
        { // address
            const div = base.create_append(this.form, "div", ["col-md-4"])
            this.address = base.create_append(div, "input", ["form-control"],
                { type: "text", name: "address", placeholder: "Address", autocomplete: "section-venue street-address", spellcheck: "false" }
            )
            this.address.ariaLabel = "Address"
            this.address.ariaAutoComplete = "list"
            this.address.disabled = true
        }
        { // map_url
            const div = base.create_append(this.form, "div", ["col-md-4"])
            const group = base.create_append(div, "div", ["input-group"])
            base.create_append(group, "i", ["input-group-text", "bi", "bi-geo-alt-fill"])
            this.map_url = base.create_append(group, "input", ["form-control"],
                { type: "text", name: "map_url", placeholder: "Map URL", autocomplete: "off", spellcheck: "false" }
            )
            this.map_url.ariaLabel = "Address"
            this.map_url.ariaAutoComplete = "none"
            this.map_url.disabled = true
        }
        // setup venue completion
        this.venue_completion = new VenueCompletion(this.venue, this.country, this.address, this.venue_url, this.map_url)
        // ------------------------------------------------------------------------------------------------------ line 5
        var start_week: number = 1  // Monday
        if (["en-US", "pt-BR"].includes(
            (navigator.languages && navigator.languages.length) ? navigator.languages[0] : ""
        )) {
            start_week = 7
        }
        { // start
            const div = base.create_append(this.form, "div", ["col-md-4"])
            const group = base.create_append(div, "div",
                ["input-group", "form-floating", "has-validation"],
                { id: "pickerStart" }
            )
            group.dataset.tdTargetInput = "nearest"
            group.dataset.tdTargetToggle = "nearest"
            this.start = base.create_append(group, "input", ["form-control", "z-1"], {
                id: "tournamentStart",
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
            new tempusDominus.TempusDominus(group, {
                display: { icons: biOneIcons },
                localization: { format: "yyyy-MM-dd HH:mm", hourCycle: "h23", startOfTheWeek: start_week },
                stepping: 15,
                promptTimeOnDateChange: true
            })
            base.create_append(group, "div", ["invalid-feedback"]).innerText = "A start date is required"
        }
        { // finish
            const div = base.create_append(this.form, "div", ["col-md-4"])
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
            new tempusDominus.TempusDominus(group, {
                display: { icons: biOneIcons },
                localization: { format: "yyyy-MM-dd HH:mm", hourCycle: "h23", startOfTheWeek: start_week },
                stepping: 15,
                promptTimeOnDateChange: true
            })
            base.create_append(group, "div", ["valid-feedback"]).innerText = "Optional finish date/time"
        }
        { // timezone
            const div = base.create_append(this.form, "div", ["col-md-4"])
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
                this.timezone.append(option)
            }
            this.timezone.value = browser_timezone
        }
        // ------------------------------------------------------------------------------------------------------ line 6
        {
            const div = base.create_append(this.form, "div", ["position-relative", "col-12"])
            this.description = base.create_append(div, "textarea", ["form-control"],
                { rows: "8", name: "description", placeholder: "Description" }
            )
            const mardown_link = base.create_append(div, "a",
                ["btn", "btn-sm", "btn-outline-primary", "mb-2", "me-3", "position-absolute", "bottom-0", "end-0"],
                { href: "https://www.markdownguide.org/basic-syntax/", target: "_blank" }
            )
            mardown_link.innerText = "Markdown"
            base.create_append(mardown_link, "i", ["bi", "bi-question-circle-fill"])
        }
        // ------------------------------------------------------------------------------------------------------ Judges
        {
            const table = base.create_append(this.form, "table", ["table", "table-striped", "my-2"])
            const head = base.create_append(table, "thead")
            const row = base.create_append(head, "tr", ["align-middle"])
            base.create_append(row, "th", [], { scope: "col", colspan: "3" }).innerText = "Judges & Organizers"
            const body = base.create_append(table, "tbody")
            for (const judge of this.judges.values()) {
                body.append(this.create_judge_row(judge))
            }
            const lookup_row = base.create_append(body, "tr", ["align-middle"])
            const lookup_cell = base.create_append(body, "td", [], { colspan: "3" })
            const lookup = new member.PersonLookup(this.members_map, lookup_cell, "Add Judge", true)
            lookup.form.addEventListener("submit", (ev) => {
                ev.preventDefault()
                const person = lookup.person
                lookup.reset()
                if (!person) { return }
                if (this.judges.some(j => j.uid == person.uid)) { return }
                this.judges.push(person)
                body.insertBefore(this.create_judge_row(person), lookup_row)
            })
        }
        // ------------------------------------------------------------------------------------------------------ submit
        {
            const div = base.create_append(this.form, "div", ["col-auto", "mb-2"])
            base.create_append(div, "button", ["btn", "btn-primary", "me-2"], { type: "submit" }).innerText = "Submit"
            this.cancel_button = base.create_append(div, "button", ["btn", "btn-secondary", "me-2"],
                { type: "button" }
            )
            this.cancel_button.innerText = "Cancel"
        }
        this.update_leagues_options()
    }
    filter_league(league: d.League) {
        if (!this.start.value || this.start.value.length < 1) {
            return false
        }
        if (this.country.value === "" && !this.online.checked) {
            return false
        }
        if (this.format.selectedOptions[0].value != "" &&
            this.format.selectedOptions[0].value != league.format) {
            return false
        }
        // let's no filter by country for now... it's too much trouble
        // some leagues are open to other countries, some leagues are continental
        // we'll probably need a proper IndexDB for this...
        // if (this.country.value != "" &&
        //     this.country.value != league.country) {
        //     return false
        // }
        if (this.online.checked && !league.online) {
            return false
        }
        if (!member.can_admin_league(this.user, league)) {
            return false
        }
        if (!utils.overlap(league, this.start.value, this.finish.value, this.timezone.value)) {
            return false
        }
        return true
    }
    update_leagues_options() {
        const selected = this.league.selectedOptions[0]?.value || ""
        base.remove_but_one_children(this.league)
        for (const league of this.leagues.filter(l => this.filter_league(l))) {
            const option = base.create_append(this.league, "option")
            option.innerText = league.name
            option.value = league.uid
            if (selected === league.uid) {
                option.selected = true
            } else {
                option.selected = false
            }
        }
    }
    get_tournament_data(): d.TournamentConfig {
        return {
            name: this.name.value,
            format: this.format.selectedOptions[0].value as d.TournamentFormat,
            rank: this.rank.selectedOptions[0].value as d.TournamentRank,
            start: this.start.value,
            finish: this.finish.value,
            timezone: this.timezone.value,
            online: this.online.checked,
            multideck: this.multideck.checked,
            proxies: this.proxies.checked,
            decklist_required: this.decklist_required.checked,
            league: {
                uid: this.league.selectedOptions[0].value,
                name: this.league.selectedOptions[0].label,
            },
            judges: [...this.judges.values()],
            description: this.description.value,
            venue: this.venue.value,
            venue_url: this.venue_url.value,
            address: this.address.value,
            map_url: this.map_url.value,
            country: this.country.value,
        }
    }
    async create_tournament(ev: Event) {
        ev.preventDefault()
        if (!this.token) {
            console.error("No token - cannot create tournament")
            return
        }
        this.form.classList.add('was-validated')
        if (!this.form.checkValidity()) {
            ev.stopPropagation()
            return
        }
        const tournament_data = this.get_tournament_data()
        console.log("posting", tournament_data)
        const res = await base.do_fetch_with_token("/api/tournaments/", this.token,
            { method: "post", body: JSON.stringify(tournament_data) }
        )
        if (!res) { return }
        const response = await res.json()
        if (response) {
            window.location.href = response.url
        }
    }
    change_value(ev: Event) {
        // Ranks are only available for Standard constructed
        if (this.format.value == d.TournamentFormat.Standard) {
            this.rank.disabled = false
        } else {
            this.rank.value = d.TournamentRank.BASIC
            this.rank.disabled = true
        }
        // No proxy and no multideck for national tournaments and above
        if (this.rank.value != d.TournamentRank.BASIC) {
            this.proxies.checked = false
            this.proxies.disabled = true
            this.multideck.checked = false
            this.multideck.disabled = true
        }
        else {
            this.multideck.disabled = false
        }
        // Label change between "Multideck" / "Single deck"
        if (this.multideck.checked) {
            this.decklist_required.checked = false
            this.decklist_required.disabled = true
        }
        else {
            this.decklist_required.disabled = false
        }
        // No physical venue for online tournaments, pre-fill venue name and URL with official discord
        if (this.online.checked) {
            this.venue.value = "VTES Discord"
            this.venue_url.value = (
                "https://discord.com/servers/vampire-the-eternal-struggle-official-887471681277399091"
            )
            this.country.options.selectedIndex = 0
            this.country.disabled = true
            this.country.required = false
            this.proxies.checked = false
            this.proxies.disabled = true
            // do not empty those values in case someone is just changing the online flag
            this.address.disabled = true
            this.map_url.disabled = true
        } else {
            // clean if we were on the default discord venue
            if (this.venue.value === "VTES Discord") {
                this.venue.value = ""
                this.venue_url.value = ""
            }
            this.country.disabled = false
            this.country.required = true
            if (this.rank.options.selectedIndex < 1) {
                this.proxies.disabled = false
            } else {
                this.proxies.checked = false
                this.proxies.disabled = true
            }
            this.address.disabled = false
            this.map_url.disabled = false
        }
        // Venue is disabled if country is not selected
        // do not erase the value in case someone just changes the country to test
        this.venue.disabled = false
        if (this.country.selectedIndex == 0 && !this.online.checked) {
            // only disable the venue field if it is empty
            if (this.venue.value.length < 1) {
                this.venue.disabled = true
            }
        }
        // only disable the venue-related fields if they are empty
        this.address.disabled = false
        this.venue_url.disabled = false
        this.map_url.disabled = false
        if (this.venue.value.length < 1) {
            if (this.address.value.length < 1) {
                this.address.disabled = true
            }
            if (this.venue_url.value.length < 1) {
                this.venue_url.disabled = true
            }
            if (this.map_url.value.length < 1) {
                this.map_url.disabled = true
            }
        }
    }
}
