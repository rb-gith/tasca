# Tasca

Your shop and membership cards in your pocket. Scan a card once, then show its barcode at the till.

It works offline and keeps everything on your phone. Nothing is sent anywhere, and there's no account.

## How it works
- **The wallet:** your cards are stacked like a real wallet. The one you used last sits at the bottom, fully visible. A search field appears once you have several cards.
- **At the till:** tap a card to see its photo, its barcode or QR code, and the number written below. Tap the code to make it fill the screen. The screen stays on while a card is open.
- **Add a card:** tap **+** and point the camera at the barcode on your card (Chrome on Android). The number and barcode type are filled in for you. You can also type the number yourself and pick the type; the preview shows the code as you type. Then add a name, a colour, optional photos of the front and back, and a note.
- **Barcode types drawn by the app:** EAN-13, EAN-8, UPC-A, Code 128, Code 39, ITF and QR code. Other types are saved with their number and photo.
- **Language:** English or Italian, in the menu.

Tasca is made for shop and membership cards. Don't store bank cards or ID documents in it.

## Install on your phone
1. Open the app's address in Chrome on Android (or Safari on iPhone, where cards are typed in rather than scanned).
2. Android: ⋮ menu → **Install app**. iPhone: Share → **Add to Home Screen**.

## Backup
Everything, photos included, lives only in this phone's browser storage. Use **Menu → Export backup** to save a ZIP file, and **Import backup** to restore it, for example on a new phone. Importing replaces what's in the app.

## Files
| File | What it does |
|---|---|
| `index.html` | The page |
| `styles.css` | The look: plain and light, the cards bring the colour |
| `lang.js` | All the text, in English and Italian |
| `barcode.js` | Draws the barcodes and QR codes, with no libraries |
| `app.js` | Cards, photos, the camera scanner, backup |
| `zip.js` | Makes and reads the backup ZIP, with no libraries |
| `sw.js` | Lets the app work offline. Bump `VERSION` whenever a file changes |
| `manifest.webmanifest`, `icons/` | Name, icon and app ID (`/tasca/`) for the home screen |

made by gionzana · [☕ buy me a coffee](https://buymeacoffee.com/gionzana)

find more apps by me on [github](https://github.com/rb-gith?tab=repositories)
