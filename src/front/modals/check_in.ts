import * as base from "../base"
import * as d from "../d"
import * as bootstrap from 'bootstrap'
import QrScanner from "qr-scanner"
import { Engine } from "../tournament/engine"

export class CheckInModal {
    engine: Engine
    player_uid: string
    round_number: number
    modal_div: HTMLDivElement
    video: HTMLVideoElement
    modal: bootstrap.Modal
    title: HTMLHeadingElement
    qr_scanner: QrScanner
    constructor(el: HTMLDivElement) {
        this.modal_div = base.create_append(el, "div", ["modal", "fade"],
            { tabindex: "-1", "aria-hidden": "true", "aria-labelledby": "scoreModalLabel" }
        )
        const dialog = base.create_append(this.modal_div, "div", ["modal-dialog"])
        const content = base.create_append(dialog, "div", ["modal-content"])
        const header = base.create_append(content, "div", ["modal-header"])
        this.title = base.create_append(header, "h1", ["modal-title", "fs-5"])
        this.title.innerText = "Check-in"
        base.create_append(header, "button", ["btn-close"], { "data-bs-dismiss": "modal", "aria-label": "Close" })
        const body = base.create_append(content, "div", ["modal-body"])
        const help_text = base.create_append(body, "p")
        help_text.innerHTML = 'Scan the Check-in QR Code <i class="bi bi-qr-code"></i>'
        this.video = base.create_append(body, "video", ["w-100"])
        this.modal = new bootstrap.Modal(this.modal_div)
        this.modal_div.addEventListener("shown.bs.modal", (ev) => {
            this.qr_scanner = new QrScanner(
                this.video,
                async (result) => { await this.checkin(result.data) },
                { highlightScanRegion: true },
            )
            this.qr_scanner.start()
        })
    }

    async checkin(code: string) {
        if (!this.engine) { return }
        await this.engine.check_in(this.player_uid, code)
        this.qr_scanner.stop()
        this.qr_scanner.destroy()
        this.modal.hide()
    }

    show(engine: Engine, player: d.Player) {
        this.engine = engine
        this.player_uid = player.uid
        this.modal.show()
    }
}
