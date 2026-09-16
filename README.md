# Quest Log

**A locally hosted backlog for ADHD fiends.**

You know the cycle. Brilliant idea at 1am, three hours of setup, a folder called `project-final-v2`, and then nothing. Quest Log is a tiny desktop board that makes you write down what "done" looks like *before* you write a single line of code. Then it makes you stare at that until you either ship it or admit you won't.

Everything lives in one JSON file on your machine. No account, no sync, no server, no network calls at all. Just you and a pile of half-formed ideas, sorted by how long they'll actually take.

---

## What it does

**Two kinds of thing, named honestly**

A **quest** is a side project. It has a hook, a scope, tags, and a Definition of Done, and it ends when you **ship** it.

A **task** is everything else — "water the plants", "reply to Tom". A title and an optional note, and it ends when it's **done**.

They're not two sizes of the same thing, so they don't share a name. A task is too small to deserve a Definition of Done; that's the whole line between them.

**Scopes, so you stop lying to yourself**
- **Weekend:** 1–3 days. Small enough to finish before the idea gets boring.
- **Fortnight:** Still capped, just more surface area. Cut features before cutting the deadline.
- **Ongoing:** The recurring drops for weeks when nothing else gets finished.

The headings say `Weekend`, `Fortnight`, `Ongoing` and nothing else — "Tier 2" never told you anything the word didn't.

**Definition of Done on every quest.** Every quest needs a DoD before it gets a first commit. That's the whole anti-scope-creep trick and it's non-negotiable — the form won't let you skip it.

**Status pills.** Click to cycle Backlog → In Progress → Shipped. Each item is in exactly one place: in-progress work sits in its own block at the top, the backlog sits under its scope heading, and finished work goes to the **Hall of Fame** — quests and tasks both. Nothing is ever on screen twice.

**Three tabs.** Home, Quests, Tasks. Each tab holds In Progress, then the backlog, then the Hall of Fame. The app remembers which one you were on.

**The bonfire.** The home screen is a point of rest: counts for both kinds of work, how long it's been since you last finished something, the time, and a fire in the middle.

The fire burns on what you've finished in the last three days. A shipped quest is worth three logs, a done task one, and each contribution fades as it ages — so the flame reads your recent past rather than your all-time total. It climbs through five stages, Embers to Roaring.

Nothing resets at midnight and **the fire never goes out.** A quiet day dims it; a quiet fortnight takes it down to embers and leaves it there. You relight a bonfire, you don't fail it. Toggling a status pill back and forth won't farm it either — the completion stamp is cleared the moment a task leaves its done state, so the flame is a reading of where things actually stand.

It's drawn in CSS — three logs, coals burning in the notch between them, and three flame layers on desynced cycles. It takes its colours from whichever theme you're on (the Matrix fire is green, the Game Boy fire is olive), it pauses when the window loses focus, and it holds still if you've asked your OS for reduced motion.

**Tag filters.** Tag quests however you like (`Elixir`, `Gaming`, `Cursed`) and filter one at a time. The chips sit at the top of the Quests tab and filter everything in it, In Progress included.

**Full CRUD.** Cards carry a title, tags and status pills — nothing else. Click one to open it: the hook, the Definition of Done, and the Edit and Delete buttons all live in there, so the destructive action isn't sitting on every row of the list. Delete asks first.

**Dark and light themes.** There's a toggle in the header. It remembers your choice and otherwise follows whatever your OS is doing.

**A message of the day.** A random encouraging (or mildly confrontational) line every time you open the app. Don't like them? They're plain text in `assets/motd.json` — write your own.

**A fixed, phone-shaped window.** 420×880, frameless, not resizable, with a themed title bar. The board doesn't get to sprawl across a monitor: you see a handful of cards at a time, and reaching for more work costs a deliberate scroll. The home screen is sized to fill it exactly — stats at the top, the footer pinned to the bottom, and the bonfire growing into whatever space is left between them.

---

## Running it from source

You'll need [Node.js](https://nodejs.org/) (18+) and npm.

```bash
git clone <your-repo-url>
cd quest-log
npm install
npm start
```

That's it. The app creates its data file on first launch and seeds a single welcome quest so the board isn't empty.

### If you're on Linux

Electron needs a pile of system libraries that minimal installs don't ship with. If `npm start` dies with something like `error while loading shared libraries: libnspr4.so`, this is your fix:

```bash
sudo apt update && sudo apt install -y \
  libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
  libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 \
  libxrandr2 libgbm1 libasound2t64 libpango-1.0-0 libcairo2 libatspi2.0-0
```

(If `libasound2t64` doesn't exist on your distro, try plain `libasound2`.)

---

## Packaging it

Builds land in `dist/`.

### Windows

```bash
npm run package:win
```

Produces `dist/Quest Log-1.0.0-win.zip` — an unpacked Windows app, zipped. Unzip it anywhere and run `Quest Log.exe`. No installer, no admin rights, nothing to uninstall later.

Nice detail: this one **cross-builds**. You can run it from Linux or macOS and still get a working Windows app, because the `zip` target doesn't need Wine or any Windows-only tooling.

### macOS

```bash
npm run package:mac
```

Produces `dist/Quest Log-1.0.0-mac.zip` containing the `.app` bundle.

**This one has to run on an actual Mac.** Not a suggestion — electron-builder physically can't produce a macOS build from Windows or Linux, because packaging a `.app` needs Apple's own tools (`codesign`, `hdiutil`, and friends) which only exist on macOS. If you don't have a Mac lying around, a GitHub Actions workflow on a `macos-latest` runner does the job fine.

The build is **unsigned**, so the first launch will need a right-click → Open (or a trip through System Settings → Privacy & Security) to get past Gatekeeper. Signing and notarizing needs a paid Apple Developer account, which is a whole thing.

---

## Where your stuff lives

One JSON file, written atomically (temp file, then rename), so a crash mid-save can't shred your backlog:

| OS | Path |
|---|---|
| Windows | `%APPDATA%\quest-log-app\quest-log.json` |
| macOS | `~/Library/Application Support/quest-log-app/quest-log.json` |
| Linux | `~/.config/quest-log-app/quest-log.json` |

Back it up, edit it by hand, sync it with whatever you want — it's your file. Delete it and the app starts fresh on next launch.

---

## Tests

```bash
npm test
```

Node's built-in test runner, no framework. Covers the storage layer (CRUD, ordering, atomic writes, completion stamping), the bonfire's fuel maths as pure functions, and the renderer modules via jsdom — card rendering, the detail modal, delete and status wiring, tab switching and persistence, and theme toggling. `test/app.test.mjs` boots the real `index.html` through the real `app.js`, so a renamed element id fails there rather than in front of you.

---

## How it's built

Vanilla JS. No framework, no bundler, no build step — just ES modules loaded straight into the renderer.

```
main.js            Electron main process, window creation, IPC handlers
preload.js         contextBridge surface (no raw fs or ipcRenderer in the renderer)
store.js           JSON persistence with atomic writes
index.html         Markup
assets/css/        Styles
assets/motd.json   Message-of-the-day pool
fonts/             Self-hosted JetBrains Mono + Press Start 2P
js/                Renderer modules (app, tabs, home, fire, quests, tasks,
                   detail, dragSort, theme, titlebar, motd)
test/              Tests
```

The renderer never touches the filesystem directly — it goes through `contextBridge` to IPC handlers in the main process. Fonts are bundled locally rather than pulled from Google Fonts, so the app genuinely makes zero network requests.

---

## Known quirks

**Running under WSLg?** You'll see a thin white border on three sides of the window. That's WSLg's display forwarding drawing its own chrome around the frameless window — it's not the app, and it doesn't happen on a native Windows or macOS build.

---

## License

MIT. Do whatever.

---

Shamelessly vibe-coded by Kurt Norenbergs.
