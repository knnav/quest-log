# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Quest Log is a local-only Electron desktop board for ADHD-friendly side-project tracking. Vanilla JS, no framework, no bundler, no build step — ES modules load straight into the renderer. All data lives in one JSON file under Electron's `userData` dir (`quest-log.json`). The app makes zero network requests (fonts are self-hosted in `fonts/`); keep it that way.

## Commands

```bash
npm start                              # run the app (electron .)
npm test                               # all tests (node --test, ~4s)
node --test test/fire.test.mjs         # one file
node --test --test-name-pattern="cardHtml" test/quests.test.mjs   # one test by name
npm run package:win / package:mac      # electron-builder zip → dist/
```

Tests need no Electron: `store.js` is exercised via `createStore(tmpPath)` and renderer modules run under jsdom with `window.questLog` / `window.session` etc. stubbed. `test/app.test.mjs` boots the real `index.html` through the real `js/app.js`, and `test/inflight.test.mjs` does the same for `inflight.html` through `js/inflight.js`, so a renamed element id or broken import fails there. `test/detailFixture.mjs` mirrors the detail/gate modal markup from `index.html` — update it if that markup changes.

## Module system split

- Root files (`main.js`, `preload.js`, `store.js`, `test/store.test.js`) are CommonJS.
- Everything under `js/` is ESM — `js/package.json` sets `"type": "module"`. Renderer tests are `.mjs`.
- Renderer code targets Electron's Chromium but is written in ES5-ish style (`var`, `function`), matching the existing files.

## Architecture

### Process boundary

The renderer never touches `fs` or `ipcRenderer`. `preload.js` exposes six namespaces via `contextBridge`: `window.questLog` (CRUD + reorder for quests/tasks, `listSessions`), `window.session` (timer), `window.themeSync`, `window.motd`, `window.windowControls` (minimize/close/expand/collapse + drag + `onModeChange`), `window.panel` (the In Flight panel: `push`/`setEnabled`/`isEnabled`/`onEnabledChange` from the board, `get`/`onData`/`hide`/`menu`/`resize` from the panel itself). Adding a new capability means: handler in `main.js` `registerIpcHandlers()` → wrapper in `preload.js` → call from a feature module. Tests stub these globals directly on `window`.

### The timer lives in the main process

`main.js` owns the single session clock. The Focus tab (`js/features/session.js`) and the hearth face (`js/features/hearth.js`) are pure views of the `view` object broadcast on `session:changed`; neither keeps its own countdown. When a session ends, `main.js` calls `store.recordSession()` and the renderer plays the chime (`session:finished`). A *completed* session then waits to be acknowledged: `main.js` holds `finished`, broadcasts `awaitingAck: true` in the view, and re-rings the chime over `session:nudge` on a bounded schedule (`NUDGE_DELAYS_MS`, 30s and 2min — never indefinitely). The hearth goes `is-alarm` (gentle pulse, drag disabled, next click acknowledges); the Focus tab shows `session-done` with click-to-dismiss. `acknowledge()` also runs on `expandToBoard()` and on `session:start`.

### Two windows: the board (two modes) and the In Flight panel

There is exactly one `BrowserWindow`. `main.js` holds `mode` (`"board"` | `"hearth"`) and switches with `collapseToHearth()` / `expandToBoard()` — `setBounds` + `setResizable` + `setAlwaysOnTop`, then `window:mode` is pushed and `hearth.js` mirrors it onto `body[data-mode]`. CSS does the rest: in hearth mode the titlebar/chrome/scroller are hidden and `#hearthView` (its own copy of the bonfire markup + session clock) fills the window. `home.js` paints every `.bonfire` / `[data-bonfire-stage]` it finds, so the two fires can't diverge.

The **In Flight panel** (`inflight.html`, `js/inflight.js`) is the one deliberate second `BrowserWindow`. It belongs to hearth mode: `collapseToHearth()` opens it and `expandToBoard()` closes it, so the fire and the list of what's in progress arrive together — including on the automatic collapse when a session starts. The board already shows what's in progress, so the panel would only cover it. It can't be a third *face* of the main window, because the hearth already is one and both have to be on screen at once.

`syncPanel()` is the only thing that opens or closes it: `panelEnabled() && mode === "hearth" && !panelDismissed`. Everything that changes an input calls it. The two off-switches are different on purpose — the × (`panel:hide` → `dismissPanel`) means "not this stint" and is forgotten on the next collapse, while the checkbox (titlebar button, tray, hearth menu) persists `ui.panel.enabled`, which defaults to **on** when absent. Changes are broadcast on `panel:enabled` so the titlebar switch can't lie.

It holds no data of its own: `app.js` derives the rows with `js/core/wip.js` and pushes them (`window.panel.push`), `main.js` caches the last push and relays it, the panel draws it — domain knowledge stays in the renderer, `main.js` stays a relay. It is `skipTaskbar` and only ever `showInactive()`, so it never steals focus.

Two things about its geometry are load-bearing. It opens *beside* the hearth, top edges aligned, and is anchored by that top-left corner: the window is created before the renderer can say how tall the rows are, so it always grows once afterwards, and growing downward from a fixed top means it never has to be repositioned. A window that is already on screen cannot be reliably moved under WSLg — the window manager reverts the move a moment after Electron reports it applied — so `resizePanel()` changes the height only. Second, which close was which is decided by *identity*, not timing: `closed` arrives after `destroy()`, by which point mini mode may already have opened the next panel, so `closePanel()` clears `panelWindow` before destroying and the handler ignores any event that isn't about the current window.

Both floating windows are dragged by hand through `js/ui/windowDrag.js`; `main.js` applies the deltas to whichever window sent them (`dragging` holds the sender), so neither hard-codes a size.

Collapse triggers: `session:start`, titlebar minimize. Expand: double-click on the hearth, Escape, the hearth's right-click menu, or the tray. Titlebar close and OS close go through `confirmQuit()` (a native `dialog.showMessageBox`, warns if a session is running) and then `quitApp()`; the hearth's right-click menu and the tray menu (`assets/tray.png`) call `quitApp()` directly (destroys the window, then `app.quit()`, then a hard `app.exit` fallback). The hearth is dragged by hand — `hearth.js` sends pointer deltas over `window:drag-*` (rAF-coalesced) and `main.js` applies them with a full `setBounds` — never with `-webkit-app-region: drag`, which swallows all DOM mouse events on Windows (double-click never arrives; `hookWindowMessage` on `WM_NCLBUTTONDBLCLK` was tried and did not fire either). Two Windows-scaling traps: don't use `setPosition` per move, and keep the hearth `resizable: true` with min == max — a `resizable: false` window grows a pixel on every programmatic move. Each mode's geometry is persisted under `ui` in the store (`getUi`/`setUi`) and clamped back on-screen on restore.

### Persistence and the four timestamps (`store.js`)

`createStore(path)` reads the whole JSON, mutates, and writes atomically (tmp file + rename) on every operation. The store is the source of truth; the renderer re-fetches after every write rather than patching in memory.

`stampTimes()` maintains four distinct fields on quests and tasks — read its comment block before touching status logic:
- `completedAt` — bonfire fuel; cleared on leaving a terminal state. Quests fuel once per outcome (`FUEL_ONCE`), tasks fuel every completion.
- `finishedAt` / `finishedAs` — history; never cleared, only advanced by a newer *different* outcome.
- `startedAt` — first entry into `in_progress`; never overwritten.

Terminal statuses: quests `shipped` | `let_go`, tasks `done`. `let_go` is deliberately absent from `STATUSES` in `js/core/domain.js` (the pill cycle) — it is reachable only from the detail modal. Changing a status/tier `key` requires a store migration; changing a `title` is free. Tiers are effort (`easy` | `medium` | `hard`), not duration; the old duration keys are rewritten by `TIER_MIGRATION` in `loadStore()`, which is the one migration hook — extend it rather than adding a second.

### One worth table, two readers

`TIER_WORTH` / `TASK_WORTH` / `LET_GO_WORTH` in `domain.js` say what an outcome counts for, and both scoring systems read them so they can't disagree. The **fire** (`fire.js`) burns worth as fuel from `completedAt` and forgets it over 3 days — the short-term signal. The **XP ledger** (`xp.js`) banks worth from `finishedAt`/`finishedAs` and never forgets — the long-term one. Neither stores a total; both are recomputed from the record on every render. `home.js` paints the ledger into every `[data-xp]` (Home row and hearth corner), sets `--growth` on every `.bonfire` so the *size* of the fire is the level (1 to 1.8×) while its *stage* stays the last three days — the CSS unit coefficients are tuned so the *largest* fire is the one that fits each face, so a level-1 fire is small on purpose, and the hearth lets the fire's spark headroom clip rather than the quote, and detects a level-up between renders (the card in `ui/levelUp.js` plus the chime hook), but only after `armLedger()` — quests and tasks load separately at boot, and a threshold crossed between the two must not ring.

### Renderer layering

- `js/core/` — pure functions, no DOM, injectable `now` for tests. `fire.js` (fuel decays linearly over 3 days; sessions never feed the fire — fuel is outcome-only), `xp.js` (lifetime XP and a RuneScape-shaped level curve — each step costs more, doubling every 7 levels, capped at 99; three constants are the whole dial), `records.js` (whole-history aggregates like scope averages), `dates.js`, `domain.js` (vocabulary + `WIP_LIMIT`/`STALE_DAYS`), `html.js` (`escapeHtml`), `sessionFormat.js`, `wip.js` (what "in flight" means, for the panel — built from the *unfiltered* lists on purpose, so a search term in the Quests tab can't empty it).
- `js/ui/` — generic widgets wired over existing markup: `modal.js` (`createModal` config-driven create/edit form), `detail.js` (one shared card-detail modal), `dragSort.js` (cards within a grid), `tabs.js`, `theme.js`, `titlebar.js` (window buttons + the panel switch), `windowDrag.js` (moving a frameless window by one of its elements), `levelUp.js` (the full-window level-up card; `#levelUp` sits outside `.app-scroll`/`.hearth-view` so it shows in both modes).
- `js/features/` — the screens. `quests.js` and `tasks.js` each hold their own in-memory list and are the only writers of their type. They don't import each other or `home.js`; instead they take an `onChange` callback from `app.js`, which re-renders dependents (In Progress block, focus picker, home).
- `js/app.js` — composition root for `index.html`. Owns no state. Init order at the bottom matters: everything must be initialised before the first `loadQuests()/loadTasks()` resolves.
- `js/inflight.js` — the same role for `inflight.html`: the panel window's entry point and its only view. Self-running, no exports.

Cards are rendered as HTML strings (`cardHtml`) and re-rendered wholesale, then event handlers are re-bound (`bindQuestActions`) — there is no diffing. Always pass user text through `escapeHtml`.

### Status changes go through gates

In `quests.js`, `requestStatus()` is the only entry point for status changes from the board. It routes `shipped` through `confirmShip` (shows the DoD) and `in_progress` past `WIP_LIMIT` through `confirmWip` (`js/features/gates.js`). `setStatus()` is the raw write — don't call it directly from new code. Gates are continuation-style and degrade to running the callback immediately if their markup is absent.

### Themes

A theme is `data-theme="<id>"` on `<html>`. Each palette is one file in `assets/css/themes/` defining CSS variables on `:root[data-theme="…"]` plus a `.theme-swatch` rule, `@import`ed at the top of `assets/css/styles.css`. Adding a theme = new CSS file + `@import` + entry in `THEMES` in `js/ui/theme.js`. `"system"` resolves to `light` / `neon-arcade`; only the *resolved* id is pushed over `themeSync`, so any picker-less document can apply it (the `theme.test.mjs` bare-document case).

### Window constraints

Board mode is frameless and resizable within `BOARD` in `main.js` (min 420×600, max width 720 — that caps the card grid at two columns on purpose). Layout must still work at 420 wide; the header has room for one create button, retargeted per tab, and the titlebar for three buttons. Hearth mode is fixed at `HEARTH` (220×210) and everything in it must fit that box. The In Flight panel is `PANEL` (210 wide, 46 tall up to the hearth's own 210) and caps its list at `PANEL_ROWS`, counting the rest as "+N more" — so a panel that fits on screen wherever the hearth does never needs clamping as it grows.
