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

**Status pills.** Click to cycle Backlog → In Progress → Shipped. Each item is in exactly one place: in-progress work sits in its own block at the top, the backlog sits under its scope heading, finished work goes to the **Hall of Fame**, and abandoned quests go to **Ashes**. Nothing is ever on screen twice.

**Shipping asks whether you meant it.** Click Shipped and the app shows you the Definition of Done you wrote and asks whether you actually did it. Answer "not yet" and nothing moves. Without that question the DoD is a note you wrote once; with it, it's the contract the app was built around — and every log on the fire is earned.

**Letting go is a real outcome, not a delete.** The pitch is *ship it or admit you won't*, so there's a path for the second half. Let go of a quest and it moves to **Ashes** — and gives the fire a little kindling, because deciding not to do something closes a real loop. It's worth less than finishing and you can bring it back any time. You can only let go of something you already had, so it can't be farmed.

**A nudge when too much is in flight.** Start a fourth quest while three are open and the app asks which one you're actually working on, and offers to bench the rest. It never blocks you — the failure mode this app fights is *starting* things, and a tool that shames you is worse than one that says nothing.

**A Focus tab.** Its own screen, not a button bolted to every card — a timer is a different job from a backlog, and mixing them made both worse. Pick 15, 25 or 50 minutes, optionally pick what you're working on, and start. A small always-on-top window appears in the corner with the countdown and pause/stop; drag it wherever you like. It sits above other windows, including full-screen ones, so the timer is still there when the app isn't. The Focus tab carries a small ember while a session runs.

The quest picker lists only what's **already in progress**. Starting a quest is a decision that belongs on the Quests tab, behind the WIP nudge — not a side effect of choosing something from a dropdown. You can also just run a timer with no quest attached.

When the session ends the app **plays a soft chime** rather than firing a system notification: no permission prompt, no OS plumbing, nothing to configure, and it still reaches you when the window is buried. It's three sine tones generated on the spot, so there's no audio file in the bundle and still no network calls. Stopping early records the session too — partial work is still work.

The timer lives in the main process, not in either window, so there is exactly one clock. The bar in the main window and the countdown in the mini window can't drift apart, and it keeps running while the app is minimised.

**Sessions never feed the fire.** They feed the record. Fuel stays outcome-only — otherwise you could sit at a roaring bonfire having shipped nothing all week, which is the exact failure this app exists to fight.

**It knows how long your scopes really take.** Pick a scope in the quest form and it tells you: *"Your Weekend quests have taken 6 days on average (3 shipped, 4h 20m of tracked work)."* Elapsed days were always the soft number — six days can be two hours — so the sessions give you the honest one alongside it. Information, not judgement.

**Search and stacking tags.** A search box over titles, hooks, definitions of done and tags. Tag quests however you like (`Elixir`, `Gaming`, `Cursed`); the chips stack, so each one you add narrows further rather than replacing the last. Both sit at the top of the Quests tab and filter everything in it, In Progress included.

**It mentions what's rotting.** One line on the home screen when something has sat in the backlog too long: *"'Presskit' has been waiting 94 days."*

**The message of the day knows where you are.** Nothing in flight, too much in flight, a cold fire, a roaring one — the line changes to match. Still plain text in `assets/motd.json`, now grouped into pools.

**Four tabs.** Home, Quests, Tasks, Focus. Each tab holds In Progress, then the backlog, then the Hall of Fame. The app remembers which one you were on.

**The bonfire.** The home screen is a point of rest: counts for both kinds of work, how long it's been since you last finished something, the time, and a fire in the middle.

The fire burns on what you've finished in the last three days. A shipped quest is worth three logs, a done task or a quest you let go is worth one, and each contribution fades as it ages — so the flame reads your recent past rather than your all-time total. It climbs through five stages, Embers to Roaring.

Nothing resets at midnight and **the fire never goes out.** A quiet day dims it; a quiet fortnight takes it down to embers and leaves it there. You relight a bonfire, you don't fail it. Toggling a status pill back and forth won't farm it either — the fuel stamp is cleared the moment something leaves its done state, so the flame is a reading of where things actually stand. A separate record of *when* you finished is kept alongside it and never cleared, so a stray click can't destroy the day you shipped.

It's drawn in CSS — three logs, coals burning in the notch between them, and three flame layers on desynced cycles. It takes its colours from whichever theme you're on (the Matrix fire is green, the Game Boy fire is olive), it pauses when the window loses focus, and it holds still if you've asked your OS for reduced motion.

**Full CRUD.** Cards carry a title, tags and status pills — nothing else. Click one to open it: the hook, the Definition of Done, and the Edit and Delete buttons all live in there, so the destructive action isn't sitting on every row of the list. Delete asks first.

**Dark and light themes.** There's a toggle in the header. It remembers your choice and otherwise follows whatever your OS is doing.

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

Node's built-in test runner, no framework. Covers the storage layer (CRUD, ordering, atomic writes, the three completion clocks), the bonfire's fuel and scope maths as pure functions, and the renderer modules via jsdom — card rendering, the detail modal, delete and status wiring, tab switching and persistence, and theme toggling. `test/app.test.mjs` boots the real `index.html` through the real `app.js`, so a renamed element id fails there rather than in front of you.

---

## How it's built

Vanilla JS. No framework, no bundler, no build step — just ES modules loaded straight into the renderer.

```
main.js            Electron main process, window creation, IPC handlers
preload.js         contextBridge surface (no raw fs or ipcRenderer in the renderer)
store.js           JSON persistence with atomic writes
assets/css/        Styles
assets/motd.json   Message-of-the-day pool
fonts/             Self-hosted JetBrains Mono + Press Start 2P
index.html         Main window markup
mini.html          The always-on-top session timer
js/                Renderer modules (app, tabs, home, fire, gates, session,
                   sessionFormat, mini, quests, tasks, detail, dragSort,
                   theme, titlebar, motd)

The two windows share one clock: the timer lives in the main process and both
just draw it. The theme is relayed the same way — the mini window has no picker
of its own, so it's told which theme to wear.
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
