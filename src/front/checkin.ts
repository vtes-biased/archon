import QRCode from 'qrcode'


async function load() {
    const contentContainer = document.getElementById("contentContainer") as HTMLDivElement
    QRCode.toCanvas(contentContainer.dataset.code, { errorCorrectionLevel: 'H' },
        function (err, canvas) {
            if (err) { throw err }
            contentContainer.appendChild(canvas)
        }
    )
}


window.addEventListener("load", (ev) => { load() })
