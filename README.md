# Quest Log

**A locally hosted backlog for ADHD fiends.**

You know the cycle. Brilliant idea at 1am, three hours of setup, a folder called `project-final-v2`, and then nothing. Quest Log is a tiny desktop board that makes you write down what "done" looks like *before* you write a single line of code. Then it makes you stare at that until you either ship it or admit you won't.

Everything lives in one JSON file on your machine. No account, no sync, no server, no network calls at all. Just you and a pile of half-formed ideas, sorted by how long they'll actually take.

---

## What it does

**Tiers, so you stop lying to yourself about scope**
- **Tier 1 — Weekend Shippable:** 1–3 days. Small enough to finish before the idea gets boring.
- **Tier 2 — 1–2 Week Build:** Still capped, just more surface area. Cut features before cutting the deadline.
- **Tier 3 — Ongoing Side-Quests:** The recurring drops for weeks when nothing else gets finished.

**Definition of Done on every card.** Every quest needs a DoD before it gets a first commit. That's the whole anti-scope-creep trick and it's non-negotiable — the form won't let you skip it.

**Status pills.** Click to cycle Backlog → In Progress → Shipped. Anything marked In Progress gets pulled up into its own section at the top so you can see what you're actually supposed to be doing right now.

**Tag filters.** Tag quests however you like (`Elixir`, `Gaming`, `Cursed`) and filter the board down to one at a time.

**Stats bar.** A running count of Backlog / In Progress / Shipped, mostly so the Shipped number can make you feel something.

**Full CRUD.** Add, edit, and delete quests straight from the UI. Delete asks first.

**Dark and light themes.** There's a toggle in the header. It remembers your choice and otherwise follows whatever your OS is doing.

**A message of the day.** A random encouraging (or mildly confrontational) line every time you open the app. Don't like them? They're plain text in `assets/motd.json` — write your own.

**Custom window chrome.** Frameless window with a themed title bar, because the default one is ugly.

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

Node's built-in test runner, no framework. Covers the storage layer (CRUD, ordering, atomic writes) and the renderer modules (card rendering, the edit/delete/status wiring, theme toggling) via jsdom.

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
js/                Renderer modules (app, quests, pinned, theme, titlebar, motd)
test/              Tests
```

The renderer never touches the filesystem directly — it goes through `contextBridge` to IPC handlers in the main process. Fonts are bundled locally rather than pulled from Google Fonts, so the app genuinely makes zero network requests.

---

## Known quirks

**Running under WSLg?** You'll see a thin white border on three sides of the window. That's WSLg's display forwarding drawing its own chrome around the frameless window — it's not the app, and it doesn't happen on a native Windows or macOS build. Also, frameless windows on Linux lose drag-to-resize from the window edges, since that's normally provided by the OS decorations we're not using.

---

## License

MIT. Do whatever.

---

Shamelessly vibe-coded by Kurt Norenbergs.
