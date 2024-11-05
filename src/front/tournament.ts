import * as base from "./base"

async function select_country(ev: Event) {
    console.log(ev)
    console.log("Current target", ev.currentTarget)
    const selectCountry = ev.currentTarget as HTMLSelectElement
    console.log("Country value", selectCountry.value)
    const selectCity = document.getElementById("selectCity") as HTMLSelectElement
    while (selectCity.options.length > 1) {
        selectCity.options.remove(1)
    }
    if (selectCountry.selectedIndex < 1) {
        selectCity.disabled = true
    } else {
        const res = await base.do_fetch(`/api/countries/${selectCountry.value}/cities`, {})
        console.log("res", res)
        const cities = await res.json() as City[]
        console.log("cities", cities)
        for (const city of cities) {
            const option = document.createElement("option")
            option.value = city.geoname_id.toString()
            option.label = city.name
            selectCity.options.add(option)
        }
        selectCity.disabled = false
    }
}

async function switch_online(ev: Event) {
    const switchOnline = ev.currentTarget as HTMLInputElement
    const selectCountry = document.getElementById("selectCountry") as HTMLSelectElement
    if (switchOnline.checked) {
        selectCountry.options.selectedIndex = 0
        selectCountry.dispatchEvent(new Event('change', { bubbles: true }));
        selectCountry.disabled = true
    } else {
        selectCountry.disabled = false
    }
}

async function load() {
    // populate the country select inputs
    console.log("Populating countries...")
    const selectCountry = document.getElementById("selectCountry") as HTMLSelectElement
    const res = await base.do_fetch("/api/countries", {})
    const countries = await res.json() as Country[]
    for (const country of countries) {
        const option = document.createElement("option")
        option.value = country.iso
        option.label = country.country
        selectCountry.options.add(option)
    }
    const selectCity = document.getElementById("selectCity") as HTMLSelectElement
    selectCity.disabled = true
    selectCountry.addEventListener("change", select_country)
    // setup switchOnline
    const switchOnline = document.getElementById("switchOnline") as HTMLInputElement
    switchOnline.addEventListener("change", switch_online)
}

window.addEventListener("load", base.load)
window.addEventListener("load", load)

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
    cc2: string[],  // alternate country codes, ISO-3166 2-letter country codes
    admin1_code: string,  // fipscode (subject to change to iso code)
    admin2_code: string,  // code for the second administrative division
    admin3_code: string,  // code for third level administrative division
    admin4_code: string,  // code for fourth level administrative division
    timezone: string,  // iana timezone id
    modification_date: string,  // date of last modification in ISO format
}