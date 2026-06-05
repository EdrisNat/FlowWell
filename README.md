# FlowWell

FlowWell is a private, offline-friendly menstrual health and dignity tracker designed for university students in Uganda. It helps students track cycle days, symptoms, product availability, health resources, and discreet absence letters while keeping personal records on the user's own device.

The project is built as a static Progressive Web App (PWA) using HTML, CSS, and vanilla JavaScript. It does not require a backend server, database, package manager, or build pipeline.

## Key Features

- Cycle tracking with calendar-based period logging and estimated next-period predictions.
- Symptom and pain logging with custom symptom support and a simple history chart.
- Product locator for reporting and updating campus pad or hygiene product locations.
- Myth-buster content for respectful menstrual health education.
- Emergency and health resources with quick-call support links.
- Discreet letter generator for absence notices that can be copied, downloaded, or saved.
- Local data export and import for backup and recovery.
- Optional local PIN lock that encrypts saved records in the browser.
- Light, dark, and high-contrast display modes.
- Offline app-shell caching through a service worker.

## Project Structure

```text
FlowWell/
|-- index.html              # App markup, screens, forms, and navigation
|-- styles.css              # Responsive UI, themes, layout, and accessibility states
|-- app.js                  # State management, rendering, persistence, encryption, and events
|-- sw.js                   # Service worker for offline app-shell caching
|-- manifest.webmanifest    # PWA metadata and install configuration
`-- icon.svg                # App icon
```

## Technology

- HTML5
- CSS3
- Vanilla JavaScript
- LocalStorage for browser-local persistence
- Web Crypto API for optional PIN-based encryption
- Service Worker API for offline caching
- Web App Manifest for installable PWA behavior

No third-party JavaScript framework is used.

## How It Works

FlowWell stores user records in the browser only. By default, data is saved in `localStorage` under the key `flowwell.v1`.

When the user enables the local PIN lock, records are encrypted with AES-GCM using a key derived from the PIN through PBKDF2. Encrypted data is stored under `flowwell.secure.v1`, and the unencrypted storage key is removed.

The application state includes:

- Logged period days
- Symptom values and notes by date
- Product locator reports
- Myth reflection selections
- Saved letter history
- User settings such as cycle length, period duration, theme, contrast, and fertile-window visibility

## Running Locally

Because this is a static app, it can be opened directly from `index.html`. For the best PWA and service-worker behavior, run it through a local web server.

Using Python:

```powershell
python -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

If Python is unavailable, any static file server can serve the project directory.

## Deployment

FlowWell can be deployed to any static hosting platform, including:

- GitHub Pages
- Netlify
- Vercel
- Cloudflare Pages
- Firebase Hosting
- A simple HTTPS-enabled web server

For production deployment, use HTTPS so the browser can reliably enable PWA installation, service workers, clipboard access, and Web Crypto behavior.

## Privacy and Safety Notes

FlowWell is local-first. It does not send user data to a server, and it does not include analytics, remote APIs, or cloud synchronization.

Important privacy considerations:

- Data is tied to the browser and device where the app is used.
- Clearing browser storage will remove saved FlowWell records.
- Exported JSON backups should be stored carefully by the user.
- If a PIN is forgotten, encrypted local records cannot be recovered and must be erased.

Important health considerations:

- FlowWell is not medical advice.
- Cycle predictions are estimates and should not be used as contraception.
- Users should seek urgent medical care for severe pain, fainting, fever, unusual discharge, or unusually heavy bleeding.

## Development Notes

The app is organized around three main client-side concerns:

- `Data` handles localStorage loading and saving.
- `Renderer` redraws the UI from application state.
- `Events` wires user interactions to state changes.

Most changes can be made without tooling. After editing, test manually in a browser across:

- Desktop and mobile viewport sizes
- Light and dark themes
- High-contrast mode
- Service worker/offline behavior
- PIN enable, lock, unlock, remove, and forgot-PIN flows
- Export and import backup flows

When changing cached assets, update `CACHE_NAME` in `sw.js` so existing installations receive the new app shell.

## Known Limitations

- Records are not shared across devices unless the user exports and imports a backup.
- Product locations are community-style local entries in the user's browser, not live verified inventory.
- Emergency contacts and resource entries are placeholder-style values and should be replaced with verified campus or institutional contacts before real-world use.
- The app depends on browser support for modern web APIs, especially for encryption and service-worker features.
- Google Fonts are imported from the web, so typography may fall back to system fonts when fully offline before fonts have been cached by the browser.

## License

No license file is currently included. Add a license before public distribution if this project will be shared or reused.
