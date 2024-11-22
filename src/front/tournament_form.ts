import * as base from "./base"

async function select_country(ev: Event) {
    // Fetch the cities (>15k pop) depending on the country. Disambiguate names.
    const selectCountry = ev.currentTarget as HTMLSelectElement
    const selectCity = document.getElementById("selectCity") as HTMLSelectElement
    selectCity.options.selectedIndex = 0
    selectCity.dispatchEvent(new Event('change', { bubbles: true }))
    while (selectCity.options.length > 1) {
        selectCity.options.remove(1)
    }
    if (selectCountry.selectedIndex < 1) {
        selectCity.disabled = true
    } else {
        const res = await base.do_fetch(`/api/country/${selectCountry.value}/city`, {})
        const cities = await res.json() as City[]
        // find duplicate city names, add administrative divisions for distinction
        const names_count = {}
        for (const city of cities) {
            var name = city.name
            names_count[name] = (names_count[name] || 0) + 1
            name += `, ${city.admin1}`
            names_count[name] = (names_count[name] || 0) + 1
        }
        for (const city of cities) {
            var name = city.name
            if (names_count[name] > 1) {
                name += `, ${city.admin1}`
            }
            if (names_count[name] > 1) {
                name += `, ${city.admin2}`
            }
            const option = document.createElement("option")
            option.value = name
            option.label = name
            selectCity.options.add(option)
        }
        selectCity.disabled = false
    }
}

function select_format(ev: Event) {
    // Ranks are only available for Standard constructed
    const selectFormat = ev.currentTarget as HTMLSelectElement
    const selectRank = document.getElementById("selectRank") as HTMLSelectElement
    if (selectFormat.value === "Standard") {
        selectRank.disabled = false
    } else {
        selectRank.options.selectedIndex = 0
        selectRank.disabled = true
        selectRank.dispatchEvent(new Event('change', { bubbles: true }))
    }
}

function select_rank(ev: Event) {
    // No proxy and no multideck for national tournaments and above
    const selectRank = ev.currentTarget as HTMLSelectElement
    const switchProxy = document.getElementById("switchProxy") as HTMLInputElement
    const switchMultideck = document.getElementById("switchMultideck") as HTMLInputElement
    const switchOnline = document.getElementById("switchOnline") as HTMLInputElement
    console.log("rank", selectRank.options.selectedIndex, switchOnline.checked)
    if (selectRank.options.selectedIndex > 0) {
        switchProxy.checked = false
        switchProxy.disabled = true
        switchProxy.dispatchEvent(new Event('change', { bubbles: true }))
        switchMultideck.checked = false
        switchMultideck.disabled = true
        switchMultideck.dispatchEvent(new Event('change', { bubbles: true }))
    }
    else {
        if (!switchOnline.checked) {
            switchProxy.disabled = false
        }
        switchMultideck.disabled = false
    }
}

function switch_proxy(ev: Event) {
    // Label change between "No Proxy" / "Proxies allowed"
    const switchProxyLabel = document.getElementById("switchProxyLabel") as HTMLLabelElement
    const switchProxy = ev.currentTarget as HTMLInputElement
    if (switchProxy.checked) {
        switchProxyLabel.innerText = "Proxies allowed"
    }
    else {
        switchProxyLabel.innerText = "No Proxy"
    }
}

function switch_multideck(ev: Event) {
    // Label change between "Multideck" / "Single deck"
    const switchMultideckLabel = document.getElementById("switchMultideckLabel") as HTMLLabelElement
    const switchMultideck = ev.currentTarget as HTMLInputElement
    if (switchMultideck.checked) {
        switchMultideckLabel.innerText = "Multideck"
    }
    else {
        switchMultideckLabel.innerText = "Single deck"
    }
}

function switch_online(ev: Event) {
    // No physical venue for online tournaments, pre-fill venue name and URL with official discord
    const switchOnline = ev.currentTarget as HTMLInputElement
    const switchProxy = document.getElementById("switchProxy") as HTMLInputElement
    const tournamentVenueName = document.getElementById("tournamentVenueName") as HTMLInputElement
    const tournamentVenueUrl = document.getElementById("tournamentVenueUrl") as HTMLInputElement
    const selectCountry = document.getElementById("selectCountry") as HTMLSelectElement
    const tournamentAddress = document.getElementById("tournamentAddress") as HTMLInputElement
    const tournamentMapUrl = document.getElementById("tournamentMapUrl") as HTMLInputElement
    if (switchOnline.checked) {
        tournamentVenueName.value = "VTES Discord"
        tournamentVenueUrl.value = "https://discord.com/servers/vampire-the-eternal-struggle-official-887471681277399091"
        selectCountry.options.selectedIndex = 0
        selectCountry.disabled = true
        selectCountry.required = false
        selectCountry.dispatchEvent(new Event('change', { bubbles: true }))
        switchProxy.checked = false
        switchProxy.disabled = true
        switchProxy.dispatchEvent(new Event('change', { bubbles: true }))
        tournamentAddress.disabled = true
        tournamentMapUrl.disabled = true
    } else {
        const selectRank = document.getElementById("selectRank") as HTMLSelectElement
        tournamentVenueName.value = ""
        tournamentVenueUrl.value = ""
        selectCountry.disabled = false
        selectCountry.required = true
        if (selectRank.options.selectedIndex < 1) {
            switchProxy.disabled = false
        }
        tournamentAddress.disabled = false
        tournamentMapUrl.disabled = false
    }
}

async function submit_tournament(ev: Event, token: base.Token) {
    // create or update tournament
    ev.preventDefault()
    const tournamentForm = ev.currentTarget as HTMLFormElement
    const tournamentData = document.getElementById("tournamentData") as HTMLDivElement
    const data = new FormData(tournamentForm)
    var json_data = Object.fromEntries(data.entries()) as unknown as Tournament
    if (json_data.finish.length < 1) { json_data.finish = undefined }
    var url = "/api/tournament"
    var method = "post"
    if (tournamentData) {
        // we are in edit mode
        const tournament = JSON.parse(tournamentData.dataset.tournament) as Tournament
        url += `/${tournament.uid}`
        method = "put"
    }
    const res = await base.do_fetch(url, {
        method: method,
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'Authorization': `Bearer ${token.access_token}` },
        body: JSON.stringify(json_data)
    })
    if (!res) { return }
    const response = await res.json()
    console.log(response)
    window.location.href = response.url
}

async function fill_data(tournamentData: Tournament) {
    // only for tournament/edit.html
    console.log(tournamentData)
    const tournamentName = document.getElementById("tournamentName") as HTMLInputElement
    const selectFormat = document.getElementById("selectFormat") as HTMLSelectElement
    const selectRank = document.getElementById("selectRank") as HTMLSelectElement
    const switchProxy = document.getElementById("switchProxy") as HTMLInputElement
    const switchMultideck = document.getElementById("switchMultideck") as HTMLInputElement
    const switchOnline = document.getElementById("switchOnline") as HTMLInputElement
    const tournamentVenueName = document.getElementById("tournamentVenueName") as HTMLInputElement
    const selectCountry = document.getElementById("selectCountry") as HTMLSelectElement
    const selectCity = document.getElementById("selectCity") as HTMLSelectElement
    const tournamentVenueUrl = document.getElementById("tournamentVenueUrl") as HTMLInputElement
    const tournamentAddress = document.getElementById("tournamentAddress") as HTMLInputElement
    const tournamentMapUrl = document.getElementById("tournamentMapUrl") as HTMLInputElement
    const tournamentStart = document.getElementById("tournamentStart") as HTMLInputElement
    const tournamentFinish = document.getElementById("tournamentFinish") as HTMLInputElement
    const tournamentDescription = document.getElementById("tournamentDescription") as HTMLInputElement
    tournamentName.value = tournamentData.name
    for (const op of selectFormat.options) {
        if ((op.value as TournamentFormat) === tournamentData.format) {
            op.selected = true
        }
        else {
            op.selected = false
        }
    }
    selectFormat.dispatchEvent(new Event('change', { bubbles: true }))
    for (const op of selectRank.options) {
        console.log(op.value, tournamentData.rank)
        if ((op.value as TournamentRank) === tournamentData.rank) {
            op.selected = true
        }
        else {
            op.selected = false
        }
    }
    selectRank.dispatchEvent(new Event('change', { bubbles: true }))
    if (tournamentData.proxies) {
        switchProxy.checked = true
    } else {
        switchProxy.checked = false
    }
    switchProxy.dispatchEvent(new Event('change', { bubbles: true }))
    if (tournamentData.multideck) {
        switchMultideck.checked = true
    } else {
        switchMultideck.checked = false
    }
    switchMultideck.dispatchEvent(new Event('change', { bubbles: true }))
    if (tournamentData.online) {
        switchOnline.checked = true
    } else {
        switchOnline.checked = false
    }
    switchOnline.dispatchEvent(new Event('change', { bubbles: true }))
    tournamentVenueName.value = tournamentData.venue
    for (const op of selectCountry.options) {
        if (op.label === tournamentData.country) {
            op.selected = true
        }
        else {
            op.selected = false
        }
    }
    selectCountry.dispatchEvent(new Event('change', { bubbles: true }))
    for (const op of selectCity.options) {
        if (op.label === tournamentData.city) {
            op.selected = true
        }
        else {
            op.selected = false
        }
    }
    selectCity.dispatchEvent(new Event('change', { bubbles: true }))
    tournamentVenueUrl.value = tournamentData.venue_url
    tournamentAddress.value = tournamentData.address
    tournamentMapUrl.value = tournamentData.map_url
    tournamentStart.value = tournamentData.start
    tournamentFinish.value = tournamentData.finish
    tournamentDescription.value = tournamentData.description
}

async function load() {
    // populate the country select inputs
    console.log("Populating countries...")
    const selectCountry = document.getElementById("selectCountry") as HTMLSelectElement
    const res = await base.do_fetch("/api/country", {})
    const countries = await res.json() as Country[]
    for (const country of countries) {
        const option = document.createElement("option")
        option.value = country.country
        option.label = country.country
        selectCountry.options.add(option)
    }
    // select_country is an async function, wait for its completion
    selectCountry.addEventListener("change", (ev) => { select_country(ev).then() })
    // fetch the user API token
    console.log("going for token")
    const token = await base.fetchToken()
    // setup callbacks for other form controls
    const switchOnline = document.getElementById("switchOnline") as HTMLInputElement
    switchOnline.addEventListener("change", switch_online)
    const selectFormat = document.getElementById("selectFormat") as HTMLSelectElement
    selectFormat.addEventListener("change", select_format)
    const selectRank = document.getElementById("selectRank") as HTMLSelectElement
    selectRank.addEventListener("change", select_rank)
    const switchProxy = document.getElementById("switchProxy") as HTMLInputElement
    switchProxy.addEventListener("change", switch_proxy)
    const switchMultideck = document.getElementById("switchMultideck") as HTMLInputElement
    switchMultideck.addEventListener("change", switch_multideck)
    const tournamentForm = document.getElementById("tournamentForm") as HTMLFormElement
    tournamentForm.addEventListener("submit", ev => submit_tournament(ev, token))
    // fill tournament data if we have it (edit.html)
    const tournamentData = document.getElementById("tournamentData") as HTMLDivElement
    if (tournamentData) {
        await fill_data(JSON.parse(tournamentData.dataset.tournament))
    }
}

window.addEventListener("load", (ev) => { base.load().then() })
window.addEventListener("load", (ev) => { load().then() })

// -------------------------------------------------------------------------- INTERFACES
interface Country {
    iso: string,  // ISO-3166 alpha-2 country code
    iso3: string,  // ISO-3166 alpha-3 country code
    iso_numeric: number,  // ISO-3166 numeric country code
    fips: string,  // FIPS 2 - letters code
    country: string,  // Country name
    capital: string,  // Capital name
    continent: string,  // Continent 2 - letters code(cf.top - level comment)
    tld: string,  // Internet Top - Level Domain, including the dot
    currency_code: string,  // ISO 4217 alpha - 3 currency code
    currency_name: string,  // Currency name
    phone: string,  // Phone prefix
    postal_code_regex: string,  // Perl / Python regular expression
    languages: string[],  // list of IETF language tags
    geoname_id: number,  // integer id of record in geonames database
}

interface City {
    geoname_id: number,  // integer id of record in geonames database
    name: string,  // name of geographical point (utf8) varchar(200)
    ascii_name: string,  // name of geographical point in plain ascii characters
    latitude: number,  // latitude in decimal degrees (wgs84)
    longitude: number,  // longitude in decimal degrees (wgs84)
    feature_class: string,  // see http://www.geonames.org/export/codes.html
    feature_code: string,  // see http://www.geonames.org/export/codes.html
    country_code: string,  // ISO-3166 2-letter country code, 2 characters
    country_name: string,  // country name, matches country.country
    cc2: string[],  // alternate country codes, ISO-3166 2-letter country codes
    admin1: string,  // name of first administrative division (state/region)
    admin2: string,  // name of second administrative division (county)
    timezone: string,  // iana timezone id
    modification_date: string,  // date of last modification in ISO format
}

enum TournamentFormat {
    Standard = "Standard",
    Limited = "Limited",
    Draft = "Draft",
}

enum TournamentRank {
    BASIC = "",
    NC = "National Championship",
    CC = "Continental Championship",
    GP = "Grand Prix",
}

interface Tournament {
    name: string,
    format: TournamentFormat,
    start: string,
    rank: TournamentRank,
    uid: string | undefined,
    country?: string | undefined,
    city?: string | undefined,
    venue?: string,
    venue_url?: string,
    address?: string,
    map_url?: string,
    online?: boolean,
    proxies?: boolean,
    multideck?: boolean,
    finish?: string,
    description?: string,
}
