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

Tests need no Electron: `store.js` is exercised via `createStore(tmpPath)` and renderer modules run under jsdom with `window.questLog` / `window.session` etc. stubbed. `test/app.test.mjs` boots the real `index.html` through the real `js/app.js`, so a renamed element id or broken import fails there. `test/detailFixture.mjs` mirrors the detail/gate modal markup from `index.html` — update it if that markup changes.

## Module system split

- Root files (`main.js`, `preload.js`, `store.js`, `test/store.test.js`) are CommonJS.
- Everything under `js/` is ESM — `js/package.json` sets `"type": "module"`. Renderer tests are `.mjs`.
- Renderer code targets Electron's Chromium but is written in ES5-ish style (`var`, `function`), matching the existing files.

## Architecture

### Process boundary

The renderer never touches `fs` or `ipcRenderer`. `preload.js` exposes five namespaces via `contextBridge`: `window.questLog` (CRUD + reorder for quests/tasks, `listSessions`), `window.session` (timer), `window.themeSync`, `window.motd`, `window.windowControls` (minimize/close/expand/collapse + `onModeChange`). Adding a new capability means: handler in `main.js` `registerIpcHandlers()` → wrapper in `preload.js` → call from a feature module. Tests stub these globals directly on `window`.

### The timer lives in the main process

`main.js` owns the single session clock. The Focus tab (`js/features/session.js`) and the hearth face (`js/features/hearth.js`) are pure views of the `view` object broadcast on `session:changed`; neither keeps its own countdown. When a session ends, `main.js` calls `store.recordSession()` and the renderer plays the chime (`session:finished`). A *completed* session then waits to be acknowledged: `main.js` holds `finished`, broadcasts `awaitingAck: true` in the view, and re-rings the chime over `session:nudge` on a bounded schedule (`NUDGE_DELAYS_MS`, 30s and 2min — never indefinitely). The hearth goes `is-alarm` (gentle pulse, drag disabled, next click acknowledges); the Focus tab shows `session-done` with click-to-dismiss. `acknowledge()` also runs on `expandToBoard()` and on `session:start`.

### One window, two modes

There is exactly one `BrowserWindow`. `main.js` holds `mode` (`"board"` | `"hearth"`) and switches with `collapseToHearth()` / `expandToBoard()` — `setBounds` + `setResizable` + `setAlwaysOnTop`, then `window:mode` is pushed and `hearth.js` mirrors it onto `body[data-mode]`. CSS does the rest: in hearth mode the titlebar/chrome/scroller are hidden and `#hearthView` (its own copy of the bonfire markup + session clock) fills the window. `home.js` paints every `.bonfire` / `[data-bonfire-stage]` it finds, so the two fires can't diverge.

Collapse triggers: `session:start`, titlebar minimize. Expand: double-click on the hearth, Escape, the hearth's right-click menu, or the tray. Titlebar close and OS close go through `confirmQuit()` (a native `dialog.showMessageBox`, warns if a session is running) and then `quitApp()`; the hearth's right-click menu and the tray menu (`assets/tray.png`) call `quitApp()` directly (destroys the window, then `app.quit()`, then a hard `app.exit` fallback). The hearth is dragged by hand — `hearth.js` sends pointer deltas over `window:drag-*` (rAF-coalesced) and `main.js` applies them with a full `setBounds` — never with `-webkit-app-region: drag`, which swallows all DOM mouse events on Windows (double-click never arrives; `hookWindowMessage` on `WM_NCLBUTTONDBLCLK` was tried and did not fire either). Two Windows-scaling traps: don't use `setPosition` per move, and keep the hearth `resizable: true` with min == max — a `resizable: false` window grows a pixel on every programmatic move. Each mode's geometry is persisted under `ui` in the store (`getUi`/`setUi`) and clamped back on-screen on restore.

### Persistence and the four timestamps (`store.js`)

`createStore(path)` reads the whole JSON, mutates, and writes atomically (tmp file + rename) on every operation. The store is the source of truth; the renderer re-fetches after every write rather than patching in memory.

`stampTimes()` maintains four distinct fields on quests and tasks — read its comment block before touching status logic:
- `completedAt` — bonfire fuel; cleared on leaving a terminal state. Quests fuel once per outcome (`FUEL_ONCE`), tasks fuel every completion.
- `finishedAt` / `finishedAs` — history; never cleared, only advanced by a newer *different* outcome.
- `startedAt` — first entry into `in_progress`; never overwritten.

Terminal statuses: quests `shipped` | `let_go`, tasks `done`. `let_go` is deliberately absent from `STATUSES` in `js/core/domain.js` (the pill cycle) — it is reachable only from the detail modal. Changing a status/tier `key` requires a store migration; changing a `title` is free.

### Renderer layering

- `js/core/` — pure functions, no DOM, injectable `now` for tests. `fire.js` (fuel decays linearly over 3 days; sessions never feed the fire — fuel is outcome-only), `records.js` (whole-history aggregates like scope averages), `dates.js`, `domain.js` (vocabulary + `WIP_LIMIT`/`STALE_DAYS`), `html.js` (`escapeHtml`), `sessionFormat.js`.
- `js/ui/` — generic widgets wired over existing markup in `index.html`: `modal.js` (`createModal` config-driven create/edit form), `detail.js` (one shared card-detail modal), `dragSort.js`, `tabs.js`, `theme.js`, `titlebar.js`.
- `js/features/` — the screens. `quests.js` and `tasks.js` each hold their own in-memory list and are the only writers of their type. They don't import each other or `home.js`; instead they take an `onChange` callback from `app.js`, which re-renders dependents (In Progress block, focus picker, home).
- `js/app.js` — composition root. Owns no state. Init order at the bottom matters: everything must be initialised before the first `loadQuests()/loadTasks()` resolves.

Cards are rendered as HTML strings (`cardHtml`) and re-rendered wholesale, then event handlers are re-bound (`bindQuestActions`) — there is no diffing. Always pass user text through `escapeHtml`.

### Status changes go through gates

In `quests.js`, `requestStatus()` is the only entry point for status changes from the board. It routes `shipped` through `confirmShip` (shows the DoD) and `in_progress` past `WIP_LIMIT` through `confirmWip` (`js/features/gates.js`). `setStatus()` is the raw write — don't call it directly from new code. Gates are continuation-style and degrade to running the callback immediately if their markup is absent.

### Themes

A theme is `data-theme="<id>"` on `<html>`. Each palette is one file in `assets/css/themes/` defining CSS variables on `:root[data-theme="…"]` plus a `.theme-swatch` rule, `@import`ed at the top of `assets/css/styles.css`. Adding a theme = new CSS file + `@import` + entry in `THEMES` in `js/ui/theme.js`. `"system"` resolves to `light` / `neon-arcade`; only the *resolved* id is pushed over `themeSync`, so any picker-less document can apply it (the `theme.test.mjs` bare-document case).

### Window constraints

Board mode is frameless and resizable within `BOARD` in `main.js` (min 420×600, max width 720 — that caps the card grid at two columns on purpose). Layout must still work at 420 wide; the header has room for one create button, retargeted per tab. Hearth mode is fixed at `HEARTH` (220×210) and everything in it must fit that box.
