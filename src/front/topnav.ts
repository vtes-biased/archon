import { Tooltip, Toast } from 'bootstrap'

function load() {
    // top nav "active"
    const top_nav_links = document.querySelectorAll('a.nav-link') as NodeListOf<HTMLAnchorElement>
    for (const nav_link of top_nav_links) {
        if (nav_link.pathname.split("/", 3)[1] == window.location.pathname.split("/", 3)[1]) {
            nav_link.classList.add("active")
        } else {
            nav_link.classList.remove("active")
        }
    }
    // activate tooltips
    var tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'))
    var tooltipList = tooltipTriggerList.map((el: HTMLElement) => Tooltip.getOrCreateInstance(el))
    // init toast
    const toastElList = document.querySelectorAll('.toast')
    const toastList = [...toastElList].map(toastEl => Toast.getOrCreateInstance(toastEl))
}

window.addEventListener("load", (ev) => { load() })
