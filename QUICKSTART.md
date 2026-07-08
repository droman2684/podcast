# Quick Start (macOS)

Empire Pod needs an internet connection — search, subscribing, and playback all fetch real data (iTunes Podcasts search, podcast RSS feeds, and episode audio).

## Easiest way
Double-click **`Start Empire Pod.command`** in Finder. It installs dependencies on first run and launches the app. A Terminal window stays open — close it (or press `Ctrl+C`) to stop the app.

> First launch may show a Gatekeeper warning since it's an unsigned script. Right-click the file → **Open** to bypass it once.

## Manual way
Requires [Node.js](https://nodejs.org) 20+.

```bash
cd "Podcast App"
npm install   # first time only
npm run dev   # launches the app with hot reload
```

## Add it to the Dock
Build a real `Empire Pod.app` with its own icon, then drag it in like any other app:

```bash
npm run dist:mac
```

This creates `release/mac-arm64/Empire Pod.app`. Drag that file into your **Applications** folder (or straight into the Dock) — from then on you can launch Empire Pod like any other Mac app, no Terminal needed.

> It's unsigned (no Apple Developer certificate), so the first launch will show a Gatekeeper warning. Right-click the app → **Open** to bypass it once; after that it opens normally.

Re-run `npm run dist:mac` any time you want to rebuild the app after making changes.

## Other commands
- `npm run build` — production build (output in `out/`)
- `npm run typecheck` — TypeScript check with no build
- `npm test` — run the unit test suite (Vitest)

## Data & storage
- App data (subscriptions, queue, downloads, settings) is stored in `~/Library/Application Support/Empire Pod/empire-pod-data.json`.
- Downloaded episode audio is stored under `~/Library/Application Support/Empire Pod/downloads/`.
- Private feed passwords are encrypted at rest via macOS Keychain (Electron's `safeStorage`) — never stored in plain text.
