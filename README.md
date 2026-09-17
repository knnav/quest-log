# Quest Log

**A tool for ADHD people to get shit done.**

You know the cycle: brilliant idea at 1am, three hours of setup, a folder called `project-final-v2`, then nothing. Quest Log is a small desktop board that makes you define what "done" looks like *before* you start, keeps the number of things in flight honest, and rewards you for finishing — or for admitting you won't.

Everything lives in one JSON file on your machine. No account, no sync, no server, zero network calls.

---

## Install

You'll need [Node.js](https://nodejs.org/) 18+ and npm.

```bash
git clone <your-repo-url>
cd quest-log
npm install
npm start
```

The app creates its data file on first launch and seeds a welcome quest so the board isn't empty.

**Building a standalone app:**

```bash
npm run package:win    # Windows zip
npm run package:mac    # macOS zip
```

Output lands in `dist/`.

**On Linux**, Electron needs system libraries that minimal installs don't ship. If `npm start` dies with `error while loading shared libraries: libnspr4.so`:

```bash
sudo apt update && sudo apt install -y \
  libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
  libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 \
  libxrandr2 libgbm1 libasound2t64 libpango-1.0-0 libcairo2 libatspi2.0-0
```

(If `libasound2t64` isn't in your distro, try plain `libasound2`.)

---

## Features

**Quests and tasks, kept separate.** A quest is a side project — it has a hook, a scope, tags, and a Definition of Done. A task is everything else ("water the plants"). A task is too small to deserve a Definition of Done; that's the whole line between them.

**Every quest needs a Definition of Done before you start.** The form won't let you skip it, and when you mark something shipped the app shows you what you wrote and asks whether you actually did it. That's the anti-scope-creep trick, and it's the contract the rest of the app is built around.

**Honest scopes.** Weekend (1–3 days), Fortnight, or Ongoing. The app tracks how long your scopes *really* take and tells you when you pick one — information, not judgement.

**A nudge when too much is in flight.** Start a fourth quest while three are open and the app asks which one you're actually working on. It never blocks you — a tool that shames you is worse than one that says nothing.

**Letting go is a real outcome.** Abandon a quest and it goes to **Ashes**, not the bin. Deciding not to do something closes a loop too, and you can bring it back any time.

**A focus timer that survives you minimising the app.** Pick a length, optionally pick what you're working on, and a small always-on-top window appears in the corner with the countdown. One clock lives in the main process, so nothing drifts. A soft chime when time's up — no notification permissions, no OS plumbing.

**The bonfire.** The home screen burns on what you've finished in the last three days, climbing through five stages from Embers to Roaring. Old wins fade, so it reads your recent past rather than your all-time total. It never goes out — a quiet fortnight dims it to embers and leaves it there. You relight a bonfire, you don't fail it.

**A fixed, phone-shaped window.** 420×880, frameless, not resizable. The board doesn't get to sprawl across a monitor — you see a handful of cards at a time, and reaching for more work costs a deliberate scroll.

**Search, stacking tags, and 16 themes.** Filter by title, hook, DoD, or tag; chips stack so each one narrows further. Themes from Game Boy to Matrix to Nord, and the bonfire takes its colours from whichever you're on.

---

## How it's built

Vanilla JS on Electron. No framework, no bundler, no build step — ES modules loaded straight into the renderer.

```
main.js       Electron main process, windows, IPC, the session clock
preload.js    contextBridge surface (no raw fs or ipcRenderer in the renderer)
store.js      JSON persistence with atomic writes
index.html    Main window
mini.html     Always-on-top session timer
js/app.js     Renderer entry point (js/mini.js for the timer window)
js/core/      Pure logic, no DOM: domain vocabulary, dates, the fire, records
js/ui/        Generic widgets: modal, detail, drag-sort, tabs, theme, titlebar
js/features/  The screens: quests, tasks, home, focus sessions, gates, motd
assets/       Styles and the message-of-the-day pool
fonts/        Self-hosted JetBrains Mono + Press Start 2P
test/         Tests (npm test)
```

The renderer never touches the filesystem directly, and fonts are bundled locally rather than pulled from Google Fonts — so the app genuinely makes zero network requests.

---

## Known quirks

**Running under WSLg?** You'll see a thin white border on three sides of the window. That's WSLg drawing its own chrome around the frameless window, not the app. Doesn't happen on a native Windows or macOS build.

---

## License

MIT. Do whatever.

Shamelessly vibe-coded by Kurt Norenbergs.
