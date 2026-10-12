# Font Checker

A Brave / Chromium browser extension that inspects fonts on any page (hover tooltip + click to pin) and highlights text that uses — or does **not** use — a font you choose.

## Features

- **Inspect mode** — hover for a live tooltip (family, size, weight, style, line-height, color); click to pin details
- **Highlight match** — outline elements whose computed `font-family` includes your target
- **Highlight not match** — outline everything else (useful for spotting inconsistencies)
- **Target font** — pick from fonts detected on the page, or type a custom name
- **Two control surfaces** — toolbar popup and an optional on-page floating panel, kept in sync

## Install (Brave)

1. Open `brave://extensions`
2. Turn on **Developer mode**
3. Click **Load unpacked**
4. Select this project folder (`font-checker`)

Chrome works the same way via `chrome://extensions`.

After code changes, click **Reload** on the extension card, then refresh the tab you are testing.

## Usage

1. Open a normal web page (not `brave://` or the Chrome Web Store).
2. Click the **Font Checker** toolbar icon.
3. Optionally enable **Floating panel** so controls stay on the page.
4. Turn on **Inspect mode**, hover text to preview, click to pin. Press **Esc** to stop inspect.
5. Choose a font from the list or type one, then enable **Highlight**.
6. Switch between **Match** and **Not match**.

**Clear / reset** turns off inspect and highlights and clears the target font.

## Project structure

```
font-checker/
├── manifest.json          # Manifest V3
├── background.js          # Service worker (defaults + message helpers)
├── shared/
│   └── fonts.js           # Font-family parsing / matching helpers
├── content/
│   ├── content.js         # Inspect, highlight, floating panel
│   └── content.css        # Overlay + panel styles
├── popup/
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
└── README.md
```

No build step — plain HTML, CSS, and JavaScript.

## Permissions

| Permission | Why |
|---|---|
| `storage` | Sync popup / panel settings (inspect, highlight mode, target font) |
| `activeTab` / `scripting` | Talk to the current tab and inject scripts if the content script is not yet loaded |
| Host access (`<all_urls>`) | Run inspect / highlight on pages you visit |

The extension does not send data anywhere; everything runs locally in the browser.

## License

MIT
