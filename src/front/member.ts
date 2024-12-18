import * as d from "./d"
import * as base from "./base"
import * as bootstrap from 'bootstrap'
import * as uuid from 'uuid'
import unidecode from 'unidecode'


function normalize_string(s: string) {
    var res = unidecode(s).toLowerCase()
    // remove non-letters non-numbers
    res.replace(/[^\p{L}\p{N}\s]/gu, "")
    // remove spurious spaces
    res.replace(/\s{2,}/g, " ");
    return res
}


export class PersonMap<Type extends d.Person> {
    by_vekn: Map<string, Type>
    by_uid: Map<string, Type>
    trie: Map<string, Array<Type>>
    constructor() {
        this.by_vekn = new Map()
        this.by_uid = new Map()
        this.trie = new Map()
    }

    add(persons: Type[]) {
        for (const person of persons) {
            if (person.vekn && person.vekn.length > 0) {
                this.by_vekn.set(person.vekn, person)
            }
            this.by_uid.set(person.uid, person)
            const parts = normalize_string(person.name).split(" ")
            for (const part of parts) {
                for (var i = 1; i < part.length + 1; i++) {
                    const piece = part.slice(0, i)
                    if (!this.trie.has(piece)) {
                        this.trie.set(piece, [])
                    }
                    this.trie.get(piece).push(person)
                }
            }
        }
    }

    remove(s: string) {
        if (!this.by_uid.has(s)) { return }
        const person = this.by_uid.get(s)
        this.by_uid.delete(person.uid)
        if (person.vekn && person.vekn.length > 0) {
            this.by_vekn.delete(person.vekn)
        }
        // we could through the name parts and pieces... not necessarily faster
        for (const pieces of this.trie.values()) {
            var idx = pieces.findIndex(p => p.uid == s)
            while (idx >= 0) {
                pieces.splice(idx, 1)
                idx = pieces.findIndex(p => p.uid == s)
            }
            // it is fine to let empty arrays be 
        }
    }

    complete_name(s: string): Type[] {
        var members_list: Type[] | undefined = undefined
        for (const part of normalize_string(s).toLowerCase().split(" ")) {
            const members = this.trie.get(part)
            if (members) {
                if (members_list) {
                    members_list = members_list.filter(m => members.includes(m))
                } else {
                    members_list = members
                }
            }
        }
        return members_list ? members_list : []
    }
}

export class MemberMap extends PersonMap<d.Member> {
    async init(token: base.Token) {
        const res = await base.do_fetch("/api/vekn/members", {
            method: "get",
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token.access_token}`
            },
        })
        const members = await res.json() as d.Member[]
        this.add(members)
    }
}

export class PersonLookup<Type extends d.Person> {
    form: HTMLFormElement
    input_vekn_id: HTMLInputElement
    input_name: HTMLInputElement
    dropdown_menu: HTMLUListElement
    button: HTMLButtonElement
    dropdown: bootstrap.Dropdown
    persons_map: PersonMap<Type>
    person: Type | undefined
    focus: HTMLLIElement | undefined
    constructor(persons_map: PersonMap<Type>, root: HTMLElement, label: string, inline: boolean = false) {
        this.persons_map = persons_map
        const form_uid = uuid.v4()
        // create an empty form on top of the body, so it can be used inside a "real" form
        this.form = base.create_prepend(document.body, "form", [], { id: form_uid })
        const top_div = base.create_append(root, "div", ["d-flex"])
        if (inline) {
            top_div.classList.add("flex-row", "align-items-center")
        } else {
            top_div.classList.add("flex-column")
        }
        const vekn_div = base.create_append(top_div, "div", ["me-2", "mb-2"])
        this.input_vekn_id = base.create_append(vekn_div, "input", ["form-control"],
            { type: "text", placeholder: "VEKN ID number", autocomplete: "off", form: form_uid }
        )
        this.input_vekn_id.ariaAutoComplete = "none"
        this.input_vekn_id.spellcheck = false

        const dropdown_div = base.create_append(top_div, "div", ["me-2", "mb-2", "dropdown"])
        if (inline) {
            dropdown_div.classList.add("col-xl-4")
        }
        this.input_name = base.create_append(dropdown_div, "input", ["form-control", "dropdown-toggle"],
            { type: "text", placeholder: "Name", autocomplete: "off", form: form_uid }
        )
        this.input_name.ariaAutoComplete = "none"
        this.input_name.spellcheck = false
        this.dropdown_menu = base.create_append(dropdown_div, "ul", ["dropdown-menu"])
        const button_div = base.create_append(top_div, "div", ["me-2", "mb-2"])
        this.button = base.create_append(button_div, "button", ["btn", "btn-primary"],
            { type: "submit", form: form_uid }
        )
        this.button.innerText = label
        this.button.disabled = true
        this.dropdown = new bootstrap.Dropdown(this.input_name)
        this.dropdown.hide()
        this.input_vekn_id.addEventListener("input", (ev) => this.select_member_by_vekn())
        this.input_name.addEventListener("input", base.debounce((ev) => this.complete_member_name()))
        dropdown_div.addEventListener("keydown", (ev) => this.keydown(ev));
    }

    reset_focus(new_focus: HTMLLIElement | undefined = undefined) {
        if (this.focus) {
            this.focus.firstElementChild.classList.remove("active")
        }
        this.focus = new_focus
        if (this.focus) {
            this.focus.firstElementChild.classList.add("active")
        }
    }

    reset() {
        this.person = undefined
        this.input_vekn_id.value = ""
        this.input_name.value = ""
        this.button.disabled = true
        this.reset_focus()
    }

    select_member_by_vekn() {
        this.person = this.persons_map.by_vekn.get(this.input_vekn_id.value)
        if (this.person) {
            this.input_name.value = this.person.name
            this.button.disabled = false
        }
        else {
            this.input_name.value = ""
            this.button.disabled = true
        }
    }

    select_member_name(ev: Event) {
        const button = ev.currentTarget as HTMLButtonElement
        this.person = this.persons_map.by_uid.get(button.dataset.memberUid)
        if (this.person) {
            this.input_vekn_id.value = this.person.vekn
            this.input_name.value = this.person.name
            this.button.disabled = false
        }
        else {
            this.input_vekn_id.value = ""
            this.input_name.value = ""
            this.button.disabled = true
        }
        this.reset_focus()
        this.dropdown.hide()
    }

    complete_member_name() {
        while (this.dropdown_menu.lastElementChild) {
            this.dropdown_menu.removeChild(this.dropdown_menu.lastElementChild)
        }
        this.reset_focus()
        this.input_vekn_id.value = ""
        this.button.disabled = true
        if (this.input_name.value.length < 3) {
            this.dropdown.hide()
            return
        }
        const persons_list = this.persons_map.complete_name(this.input_name.value)
        if (!persons_list) {
            this.dropdown.hide()
            return
        }
        for (const person of persons_list.slice(0, 10)) {
            const li = base.create_append(this.dropdown_menu, "li")
            const button = base.create_append(li, "button", ["dropdown-item"],
                { type: "button", "data-member-uid": person.uid }
            )
            var tail: string[] = []
            if (person.city) {
                tail.push(person.city)
            }
            if (person.country) {
                tail.push(person.country)
            }
            button.innerText = person.name
            if (tail.length > 0) {
                button.innerText += ` (${tail.join(", ")})`
            }
            button.addEventListener("click", (ev) => this.select_member_name(ev))
        }
        this.dropdown.show()
    }

    keydown(ev: KeyboardEvent) {
        var next_focus: HTMLLIElement | undefined = undefined
        switch (ev.key) {
            case "ArrowDown": {
                if (this.focus) {
                    next_focus = this.focus.nextElementSibling as HTMLLIElement
                } else {
                    next_focus = this.dropdown_menu.firstElementChild as HTMLLIElement
                }
                if (next_focus === null) {
                    next_focus = this.focus
                }
                break
            }
            case "ArrowUp": {
                if (this.focus) {
                    next_focus = this.focus.previousElementSibling as HTMLLIElement
                } else {
                    next_focus = this.dropdown_menu.lastElementChild as HTMLLIElement
                }
                if (next_focus === null) {
                    next_focus = this.focus
                }
                break
            }
            case "Escape": {
                break
            }
            case "Enter": {
                if (this.focus) {
                    this.focus.firstElementChild.dispatchEvent(new Event("click"))
                } else {
                    return
                }
                break
            }
            default: return
        }
        ev.stopPropagation()
        ev.preventDefault()
        if (next_focus === this.focus) { return }
        if (this.focus) {
            this.focus.firstElementChild.classList.remove("active")
        }
        this.focus = next_focus
        if (this.focus) {
            this.focus.firstElementChild.classList.add("active")
        }
    }
}



// async function select_country(ev: Event) {
//     // Fetch the cities (>15k pop) depending on the country. Disambiguate names.
//     const selectCountry = ev.currentTarget as HTMLSelectElement
//     const selectCity = document.getElementById("selectCity") as HTMLSelectElement
//     selectCity.options.selectedIndex = 0
//     selectCity.dispatchEvent(new Event('change', { bubbles: true }))
//     while (selectCity.options.length > 1) {
//         selectCity.options.remove(1)
//     }
//     if (selectCountry.selectedIndex < 1) {
//         selectCity.disabled = true
//     } else {
//         const res = await base.do_fetch(`/api/vekn/country/${selectCountry.value}/city`, {})
//         const cities = await res.json() as City[]
//         // find duplicate city names, add administrative divisions for distinction
//         const names_count = {}
//         for (const city of cities) {
//             var name = city.name
//             names_count[name] = (names_count[name] || 0) + 1
//             name += `, ${city.admin1}`
//             names_count[name] = (names_count[name] || 0) + 1
//         }
//         for (const city of cities) {
//             var name = city.name
//             if (names_count[name] > 1) {
//                 name += `, ${city.admin1}`
//             }
//             if (names_count[name] > 1) {
//                 name += `, ${city.admin2}`
//             }
//             const option = document.createElement("option")
//             option.value = name
//             option.label = name
//             selectCity.options.add(option)
//         }
//         selectCity.disabled = false
//     }
// }
