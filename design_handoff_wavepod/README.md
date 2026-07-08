# Handoff: Wavepod — Podcast Desktop App

## Overview
Wavepod is a full-featured podcast desktop application for macOS/Windows. It covers discovery, library management, episode playback, downloads, stations/playlists, a manual queue, and authenticated private RSS feeds. The design is clean and minimal, inspired by Overcast and Apple Podcasts, with a persistent 3-column layout.

## About the Design Files
The file `Podcast App Light.dc.html` is a **high-fidelity interactive HTML prototype** — a design reference showing intended look, layout, and behavior. It is **not production code**. The task for Claude Code is to **recreate this design in the target codebase** using its established framework and patterns (React, Electron, Tauri, SwiftUI, etc.). If no codebase exists yet, Electron + React or Tauri + React are recommended for a desktop podcast app.

## Fidelity
**High-fidelity.** Colors, typography, spacing, border radii, shadows, hover states, and interactions are all final and should be matched precisely. The prototype is fully interactive — all screens are navigable, the player controls toggle, queue items drag to reorder, and the settings modal is functional. Treat it as the source of truth for visual and behavioral spec.

---

## App Structure

### Overall Layout
```
┌──────────────────────────────────────────────────────────────┐
│  Sidebar (244px, resizable 160–380px)                        │
│  │▌ Main Content (flex:1)             │▌ Now Playing (272px) │
│  │  (switches by nav selection)       │  (always visible)    │
├──────────────────────────────────────────────────────────────┤
│  Bottom Player Bar (56px)                                    │
└──────────────────────────────────────────────────────────────┘
```

- **Sidebar** — left, fixed width (resizable). White background `#ffffff`.
- **Drag handles** — 6px-wide transparent strips between sidebar/main and main/panel, `cursor:col-resize`. Show subtle green tint on hover.
- **Main content** — scrollable, `background:#eef0f4`. Switches based on active nav.
- **Now Playing panel** — right, fixed width (resizable). White background. Always visible.
- **Bottom player bar** — full-width, `height:56px`, white background with top border. Shows current episode, progress bar, volume.

---

## Design Tokens

### Colors
| Token | Value | Usage |
|---|---|---|
| `bg` | `#eef0f4` | App/main content background |
| `surface` | `#ffffff` | Sidebar, panel, cards, modal |
| `surface-raised` | `#f9f9fb` | Input backgrounds, secondary buttons |
| `border` | `rgba(0,0,0,.07)` | Card and section borders |
| `border-strong` | `rgba(0,0,0,.1)` | Input borders |
| `text-primary` | `#1c1c1e` | Headings, body text |
| `text-secondary` | `#48484a` | Supporting text |
| `text-muted` | `#8e8e93` | Captions, metadata |
| `text-placeholder` | `#aeaeb2` | Section labels, timestamps |
| `text-disabled` | `#c7c7cc` | Inactive states |
| `accent` | `#1DB980` | Primary action color (green) |
| `accent-bg` | `rgba(29,185,128,.1)` | Active nav item background, badge bg |
| `accent-shadow` | `rgba(29,185,128,.3)` | Play button shadow |
| `danger` | `#FF3B30` | Destructive actions (unsubscribe) |
| `danger-bg` | `rgba(255,59,48,.12)` | Destructive button background |
| `warning` | `#D97706` | Downloading state indicator |

### Typography
All text uses: `system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`

| Role | Size | Weight | Color |
|---|---|---|---|
| Screen title | 22px | 700 | `#1c1c1e` |
| Section heading | 11px | 600 | `#aeaeb2` (uppercase, 0.7px letter-spacing) |
| Card title | 13–14px | 600 | `#1c1c1e` |
| Body / list item | 13px | 500 | `#1c1c1e` |
| Metadata / caption | 11px | 400 | `#8e8e93` |
| Timestamp / label | 10px | 400 | `#aeaeb2` |
| Nav item | 13px | 500 | Active: `#1DB980`, Inactive: `#6e6e73` |
| Logo | 16px | 700 | `#1c1c1e` |

### Spacing
- Screen padding: `28px 26px`
- Card padding: `11px–16px`
- Section gap: `22–24px`
- Item gap: `4–8px`

### Border Radius
| Element | Radius |
|---|---|
| Screen cards, library cards | `12px` |
| Episode/list items | `10px` |
| Podcast artwork (small) | `8–9px` |
| Buttons (pill) | `20px` |
| Badges | `8–11px` |
| Toggle switch track | `13px` |
| Input fields | `8–12px` |
| Modal | `18px` |

### Shadows
- Cards: `0 1px 4px rgba(0,0,0,.06)`
- Modal: `0 24px 64px rgba(0,0,0,.18)`
- Primary button: `0 2px 10px rgba(29,185,128,.3)`
- Bottom bar: `0 -1px 8px rgba(0,0,0,.05)`

---

## Screens

### 1. Home
**Purpose:** Overview of what to listen to next.

**Layout:** Single column, `padding:28px 26px 36px`

**Sections (top to bottom):**
1. **Featured Banner** — full-width card with dark gradient (`linear-gradient(135deg,#1e4d91,#0d2b5a)`), `border-radius:16px`, `padding:26px`. Contains: 96×96px podcast artwork (rounded 14px), episode title (18px/700), podcast + duration (12px muted), green "Play Now" pill button. Two decorative translucent circles for depth.
2. **New Episodes** — section label + vertical list of episode rows. Each row: white card `border-radius:10px`, podcast artwork 48×48px (`border-radius:9px`), title (13px/500), podcast+duration (11px muted), new-episode green dot indicator (7px circle), circular play button (30px, `background:#f0f0f5`, green play triangle).
3. **Recommended for You** — white card with green left accent bar (4px wide, `#1DB980`) and green gradient header tint. Header: title (14px/700) + subtitle + Refresh button (green pill). 3 recommendation rows: artwork 50×50px, name/author/category, "Because you listen to X" chip (`background:#f5f5f7`, `border-radius:8px`), Subscribe pill button (green → gray when subscribed). Shows "Updated [date]" below Refresh.

---

### 2. Search & Discover
**Purpose:** Find and subscribe to new podcasts via directory.

**Layout:** `padding:28px 26px`

**Components:**
- **Search input** — full-width flex container, `background:#fff`, `border-radius:12px`, `border:1.5px solid rgba(0,0,0,.1)`, `padding:0 14px`. Magnifier icon (opacity:0.4) + text input (14px) + clear × button (appears when non-empty, 20px gray circle).
- **Browse Categories** (shown when no search term) — 8 color-coded pill chips with pastel bg + darker text: News `#e8f0fe`/`#1a3a8f`, Technology `#e6f4ea`/`#1a5c2a`, Comedy `#fef3e2`/`#7a3800`, True Crime `#fde8e8`/`#7a1a1a`, History `#f3e8fd`/`#4a1a7a`, Science `#e2f4fd`/`#1a4a7a`, Business `#fef8e0`/`#6a5200`, Health `#e6f9ee`/`#0a4a24`. Clicking a chip sets search term to that category.
- **Featured grid** (no search term) — 4-column grid of podcast cards. Each: artwork square (gradient bg, 2-letter initials), name (12px/600), category (10px muted), Subscribe button (green→gray toggle).
- **Results list** (with search term) — vertical list. Each row: white card, 54×54px artwork, name/author/category stacked, Subscribe button.

---

### 3. Library
**Purpose:** Browse all subscribed podcasts.

**Header:** "Library" + grid/list toggle (two icon buttons in a pill `background:#e8e8ed;border-radius:8px;padding:3px`). Active toggle gets white bg + green icon, inactive gets gray icon.

**Grid view:** 3-column grid, each card: artwork square with unread badge (top-right green pill), name (13px/600), author (11px muted).

**List view:** Vertical list of white cards `border-radius:10px`. Each: 48×48px artwork, name + author, unread badge (right-aligned green pill), chevron.

---

### 4. Queue
**Purpose:** All unplayed episodes in one ordered list with manual reordering.

**Header:** "Queue" title + episode count + "Clear all" ghost button.

**List:** Draggable rows using HTML5 Drag & Drop API (`draggable={true}`). Each row:
- 6-dot grip handle (⠿) left — `cursor:grab`, fill `#d1d1d6`
- Position label — "▶" (green `#1DB980`) for first item, "2", "3"… (gray) for rest, `width:24px` centered
- 46×46px podcast artwork (`border-radius:8px`)
- Episode title (13px/500, truncated) + podcast name + duration
- × remove button (26px circle, `background:#f5f5f7`, hover turns `#fde8e8`)

**Drag feedback:**
- Item being dragged: `opacity:0.45`, `background:rgba(29,185,128,.07)`
- Drop target: `border:2px solid #1DB980`

---

### 5. Episodes (Podcast Detail)
**Purpose:** Browse all episodes of a selected podcast.

**Header:** Podcast artwork 88×88px (`border-radius:13px`, gradient bg, drop shadow), name (20px/700), author + episode count (13px muted), Subscribe (green pill) + Settings (gray pill) buttons.

**Episode list:** Divider-separated rows. Each: green play button (34px circle), episode title (13px/500, truncated, `opacity:0.42` if played), date + duration metadata, download icon (green, shown if downloaded), chevron.

**Settings button** → opens Podcast Settings modal (see below).

---

### 6. Downloads
**Purpose:** Manage downloaded episodes and storage.

**Header:** "Downloads" + storage info right-aligned (12px muted). Episode count subhead.

**List:** White cards `border-radius:11px`. Each: 48×48px artwork, title (truncated) + podcast/duration/size, progress bar (3px, green, only shown for actively-downloading items), status badge:
- Done: green text + `rgba(29,185,128,.1)` bg
- Downloading: amber text + amber tint bg + progress bar below metadata
- Queued: muted text + `rgba(0,0,0,.06)` bg

---

### 7. Stations
**Purpose:** Manage smart/manual episode playlists.

**Header:** "Stations" + "Auto-updating smart playlists" subtitle + "+ New Station" green pill button.

**List:** White cards `border-radius:13px`. Each: 48×48px colored icon square (`border-radius:12px`, solid accent color), name (14px/600) + type/count/duration, "Smart" green badge (shown for smart stations), chevron.

Station colors: Morning Commute `#1DB980`, Deep Dives `#3B82F6`, News Briefing `#F59E0B`, Weekend Listen `#8B5CF6`.

---

### 8. Private Feeds
**Purpose:** Add authenticated RSS feeds (username + password).

**Header:** "Private Feeds" + toggle button (green "Add Private Feed" → gray "Cancel" when form open).

**Add feed form** (collapsible): white card `border-radius:14px`. Fields:
- Feed URL (required) — full width, `placeholder: "https://feeds.example.com/private/rss"`
- Username + Password — 2-column grid, password field uses `type="password"`
- "Add Feed" (green pill) + "Cancel" (gray pill) buttons

**Feed list:** White cards. Each: lock icon in gray 42×42px square, feed name + URL (truncated) + username, × remove button (red circle, `background:#fff0f0`, `border:1px solid rgba(255,60,60,.12)`).

**Empty state:** Centered lock icon illustration + "No private feeds yet" (15px/600) + helper text.

---

### 9. Podcast Settings (Modal)
**Purpose:** Per-podcast configuration. Opened from Episodes screen "Settings" button.

**Container:** Centered overlay, `background:rgba(0,0,0,.25)`. Modal: `width:500px`, `border-radius:18px`, `max-height:84vh`, scrollable. Click backdrop to close.

**Header (sticky):** Podcast artwork 44×44px, name + "Podcast Settings" label, × close button (28px gray circle).

**Section 1 — Episode Storage:**
- "Episodes to keep" — 5 pill buttons: 1 / 3 / 5 / 10 / All. Active: `background:#1DB980;color:#fff`. Inactive: `background:#f0f0f5;color:#48484a`. Helper text below.
- "Auto-download new episodes" toggle
- "Delete after playing" toggle

**Toggle switch design:** Track `width:44px;height:26px;border-radius:13px`. Knob `width:22px;height:22px;border-radius:50%;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.22)`. ON: track `#1DB980`, knob `margin-left:18px`. OFF: track `#d1d1d6`, knob `margin-left:2px`. Transition: `margin-left .18s ease`.

**Section 2 — Notifications:**
- "Notify on new episodes" toggle

**Section 3 — Management:**
- "Mark all episodes as played" — gray action row
- "Delete all downloads" — gray action row
- "Unsubscribe from [Podcast]" — `background:#fff5f5;color:#FF3B30;border:1px solid rgba(255,59,48,.12)`

---

## Now Playing Panel (Right Column)

Always visible. `width:272px` (resizable 200–420px). `background:#ffffff`.

**Upper section (scrollable, sticky-ish):**
- "NOW PLAYING" label (10px/600 uppercase, `#aeaeb2`)
- Podcast artwork — full panel width square, `border-radius:13px`, gradient bg, `box-shadow:0 8px 28px rgba(30,77,145,.3)`
- Episode title (13px/600) + podcast + duration
- Progress bar (3px, `background:#f0f0f5`, green fill), timestamps
- Controls row: back-30 icon + 44px green play/pause circle + forward-30 icon
- Speed pill (e.g. "1x") + "Sleep" pill

**Lower section:**
- "UP NEXT" label
- Queue preview: rows of 36×36px artwork + title (2-line clamp) + duration

---

## Bottom Player Bar

`height:56px`, `background:#ffffff`, `border-top:1px solid rgba(0,0,0,.08)`, `box-shadow:0 -1px 8px rgba(0,0,0,.05)`

**Layout:** flex row
- **Left third:** 36×36px artwork thumbnail (`border-radius:7px`) + episode title (12px/500, truncated) + "Podcast · 11:45 / 42:00" (10px muted)
- **Center (flex:2):** Full-width progress bar — `height:2px`, `background:#f0f0f5`, green fill
- **Right third:** Volume icon + 76px volume slider track

---

## Sidebar

`width:244px` (default, resizable 160–380px), `background:#ffffff`, `border-right:1px solid rgba(0,0,0,.08)`

**Logo area:** 32×32px green rounded square logo + "Wavepod" (16px/700)

**Section: Browse**
Nav items: Home · Search · Library · Episodes · Queue

**Section: Manage**
Nav items: Downloads (badge showing count) · Stations · Private Feeds

**Section: Subscriptions**
Scrollable list of podcast rows: 26×26px artwork + name (12px/500 muted) + unread badge

**Nav item active state:** `background:rgba(29,185,128,.1)`, icon + text color `#1DB980`
**Nav item inactive:** `background:transparent`, icon + text color `#6e6e73`

---

## Interactions & Behavior

### Navigation
- Clicking sidebar items sets active screen, highlights nav item green
- Library podcast cards navigate to Episodes screen for that podcast
- Episode screen "Settings" opens per-podcast settings modal

### Playback
- Play/pause toggle on: bottom bar play button, now playing panel play button, episode list play buttons, home featured "Play Now"
- Speed cycles: 1x → 1.5x → 2x → 0.75x → 1x

### Column Resizing
- 6px drag handles between sidebar/main and main/panel
- Mouse down → track `mousemove` globally → clamp width → mouse up ends drag
- Sidebar: min 160px, max 380px
- Panel: min 200px, max 420px
- `cursor:col-resize` on root during active drag (prevents flicker)

### Queue Drag & Drop
- HTML5 Drag & Drop API (`draggable`, `onDragStart`, `onDragOver`, `onDrop`, `onDragEnd`)
- Dragging item: opacity 0.45, green-tinted background
- Drop target: `border:2px solid #1DB980`
- On drop: splice item out of old index, insert at new index

### Library Toggle
- Grid icon / list icon toggle in header
- Grid: 3-column cards with artwork
- List: compact rows with chevron

### Search
- Controlled input; empty = browse categories + featured grid
- Non-empty = filter results by name/author/category
- Category chips set search term (acts as filter shortcut)
- Subscribe toggle: green → gray, label "Subscribe" → "Subscribed"

### Private Feeds
- Add form collapses/expands with toggle button
- Adding a feed prepends it to list and closes form
- Remove button deletes from list immediately

### Podcast Settings Modal
- Backdrop click closes modal
- Keep count pill selection — mutually exclusive
- Toggle switches animate `margin-left` on the knob (0.18s ease)
- Settings persist in component state per session

### Recommended Card
- "Refresh" button updates timestamp to "Just now"
- Subscribe buttons toggle per recommendation

---

## State Management

```
nav: string                   // active screen
playing: boolean              // playback state
progress: number              // 0–100, current episode %
speed: number                 // 1.0 | 1.5 | 2.0 | 0.75
libraryView: 'grid' | 'list'
privateFeeds: Array<{ id, name, url, user }>
feedUrl / feedUser / feedPass: string  // add-feed form
showAddForm: boolean
sidebarW: number              // px, default 244
panelW: number                // px, default 272
dragging: null | 'sidebar' | 'panel'
dragStartX: number
dragStartW: number
showSettings: boolean         // podcast settings modal
settingsKeep: number          // 1|3|5|10|0(=All)
settingsAutoDownload: boolean
settingsAutoDelete: boolean
settingsNotify: boolean
searchTerm: string
discoveredSubs: string[]      // ids of subscribed discover results
recRefreshedAt: string        // "Mon, Jun 30" or "Just now"
recSubs: string[]             // subscribed recommendation ids
queue: Array<{ id, podcast, title, dur, bg, init }>
queueDragIdx: number | null
queueDragOverIdx: number | null
```

---

## Real Backend Requirements
These features need API integration when building the real app:

| Feature | API / Service |
|---|---|
| Podcast search | Podcast Index API (free, open) or iTunes Search API |
| Recommendations | Custom logic based on listen history, or Listen Notes similar-podcasts endpoint |
| RSS feed fetching | Server-side proxy (CORS), or native fetch in Electron/Tauri |
| Private feeds | HTTP Basic Auth header on RSS fetch |
| Downloads | Native file system API (Electron `fs`, Tauri `fs` plugin) |
| Playback | Web Audio API or native audio (Electron) |
| Episode data | Parse RSS XML (fast-xml-parser or similar) |
| Cover art | Served from podcast RSS feed `<itunes:image>` tag |

---

## Assets
No external image assets. Podcast artwork in the prototype uses CSS gradient backgrounds with 2-letter initials as placeholders. Replace with actual cover art fetched from RSS feeds.

Icons are inline SVG — simple geometric shapes. Replace with a proper icon library (Lucide, Heroicons, Radix Icons) in the real implementation.

---

## Files
- `Podcast App Light.dc.html` — Full interactive prototype (all screens, all interactions). Open in any browser to explore.

---

## Suggested Tech Stack
For a cross-platform desktop app:
- **Electron + React** — widest ecosystem, easy web-to-desktop port
- **Tauri + React** — lighter binary, better performance, Rust backend
- **UI library** — shadcn/ui or Radix UI + Tailwind CSS for component primitives
- **Audio** — Howler.js or native HTMLAudioElement
- **RSS parsing** — fast-xml-parser (Node) or rss-parser
- **State** — Zustand or Jotai for lightweight global state
