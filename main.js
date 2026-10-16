const { app, BrowserWindow, Menu, Tray, dialog, ipcMain, nativeTheme, screen, shell } = require("electron");

// Windows groups taskbar buttons by this id, and from source the default id
// is Electron's own. Set before anything else; the same id as
// electron-builder's appId, so a packaged build lands in the same group.
const APP_ID = "com.questlog.app";
if (process.platform === "win32") app.setAppUserModelId(APP_ID);
const fs = require("fs");
const path = require("path");
const store = require("./store");

// The timer lives in the main process, not in the renderer. The window has two
// faces (hearth and board) that both draw the same countdown, and it has to
// keep running through a collapse — so there is exactly one clock and the
// renderer just draws it.
let session = null;
let sessionTicker = null;

// A completed session waits to be noticed. `finished` holds the title while
// that is pending and rides along in the view, so both faces show it; the
// nudges are re-rung from here, so the renderer keeps no timer of its own.
// Deliberately bounded: two reminders, then silence with the face still lit.
// An alarm that nags until obeyed is one you learn to dread, and then avoid
// starting sessions at all.
let finished = null;
let nudgeTimers = [];
const NUDGE_DELAYS_MS = [30000, 120000];
let mainWindow = null;
let tray = null;
let quitting = false;
let currentTheme = null;

// How tall the In Flight list under the fire last measured, reported by the
// renderer (it is the one that knows how many rows there are). Kept so the
// next collapse opens at the right height straight away; a first collapse
// opens at this guess and settles a beat later.
let listHeight = 120;

// One window, three modes. The hearth is the tiny always-on-top resident that
// lives in a screen corner; the board is the full app; peace is the hearth
// face blown up to cover the whole display, for when the rest of the screen
// is the problem. Switching is a setBounds + a flag pushed to the renderer,
// never a second BrowserWindow, so theme, session and data plumbing exist once.
//
// Mini mode carries the In Flight list under the fire, in the same window, so
// the two arrive together and move together. On unless switched off; see
// syncPanel. HEARTH is the fire's own box; with the list the window is
// PANEL wide and the list's height taller.
const HEARTH = { width: 220, height: 220 };
// The default opens at two card columns (the grid needs ~574px for that)
// and two card rows tall, with the next tier's heading just showing so the
// board reads as scrollable. The minimum width is what the header needs
// (five tabs, two create buttons, the theme picker) and gives one column;
// the maximum keeps it at two.
const BOARD = { width: 600, height: 620, minWidth: 490, minHeight: 600, maxWidth: 720, maxHeight: 4000 };
// The rows are meant to be read from across the room, so the type is larger
// than the board's and the window widens for them; the fire stays centred
// above. Six rows plus the heading, the sub-heading and an overflow line come
// to ~215px, so the height cap is never what clips a row.
const PANEL = { width: 340, minHeight: 40, maxHeight: 250 };
let mode = "board";
// Where peace mode goes back to: it is entered from either face and leaves
// to the same one, so it never has to decide what the user wanted.
let peaceFrom = "board";

// When the log was last looked at, as it stood before this launch. Read once
// at startup before the stamp is refreshed; the renderer asks for it and
// decides (core/reentry.js) whether this counts as coming back from away.
// Null on a first run, which is a beginning and not a return.
let seenBefore = null;

// The stamp itself lives under `ui` with the window geometry. Refreshed on
// launch, on every focus and blur, and on quit — "seen" means the window was
// used, not that the process was alive, so a board left open under other
// windows for a fortnight still reads as away.
function readSeenBefore() {
  seenBefore = store.getUi().lastSeenAt || null;
}

function touchSeen() {
  store.setUi({ lastSeenAt: new Date().toISOString() });
}

function sessionView() {
  if (!session) {
    return { active: false, awaitingAck: !!finished, questTitle: finished ? finished.questTitle : "" };
  }
  const remainingMs = session.paused
    ? session.remainingMs
    : Math.max(0, session.endsAt - Date.now());

  return {
    active: true,
    questId: session.questId,
    questTitle: session.questTitle,
    durationMs: session.durationMs,
    remainingMs: remainingMs,
    paused: session.paused,
  };
}

function broadcast(channel, payload) {
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) win.webContents.send(channel, payload);
  });
}

function pushSession() {
  broadcast("session:changed", sessionView());
}

function startTicker() {
  stopTicker();
  sessionTicker = setInterval(() => {
    if (!session || session.paused) return;
    if (Date.now() >= session.endsAt) {
      finishSession(true);
      return;
    }
    pushSession();
  }, 1000);
}

function stopTicker() {
  if (sessionTicker) clearInterval(sessionTicker);
  sessionTicker = null;
}

function finishSession(completed) {
  if (!session) return;

  store.recordSession({
    questId: session.questId,
    startedAt: session.startedAt,
    endedAt: new Date().toISOString(),
    completed: completed,
  });

  const questTitle = session.questTitle;
  session = null;
  stopTicker();

  // Only a completed session rings the chime; stopping early is deliberate.
  if (completed) {
    finished = { questTitle: questTitle };
    NUDGE_DELAYS_MS.forEach((ms) => {
      nudgeTimers.push(setTimeout(() => {
        if (liveWindow()) liveWindow().webContents.send("session:nudge");
      }, ms));
    });
  }
  pushSession();
  if (completed && liveWindow()) {
    liveWindow().webContents.send("session:finished");
  }
}

function clearFinished() {
  nudgeTimers.forEach(clearTimeout);
  nudgeTimers = [];
  finished = null;
}

// Any deliberate return counts: a click on the hearth, the Focus tab, or
// simply bringing the board back.
function acknowledge() {
  if (!finished) return;
  clearFinished();
  pushSession();
}

function liveWindow() {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
}

// Clamps a saved position onto whatever display is there now, so a hearth
// parked on a monitor that has since been unplugged doesn't vanish off-screen.
function onScreen(bounds) {
  const area = screen.getDisplayMatching(bounds).workArea;
  return {
    x: Math.min(Math.max(bounds.x, area.x), area.x + area.width - bounds.width),
    y: Math.min(Math.max(bounds.y, area.y), area.y + area.height - bounds.height),
    width: bounds.width,
    height: bounds.height,
  };
}

// The saved position is the fire's top-left corner; the list, when shown,
// hangs below it and the window widens evenly on both sides, so the fire
// stays where it was left. A position saved before the list moved in means
// the same thing, so it needs no migration.
function hearthBounds() {
  const saved = store.getUi().hearth;
  const area = screen.getPrimaryDisplay().workArea;
  const size = miniSize();
  const fire = saved || {
    x: area.x + area.width - HEARTH.width - 24,
    y: area.y + area.height - size.height - 24,
  };
  return onScreen({
    x: fire.x - Math.round((size.width - HEARTH.width) / 2),
    y: fire.y,
    width: size.width,
    height: size.height,
  });
}

// Pins the window to exactly `size` (min == max; see the note above
// `dragging` for why it stays resizable). Floor down, ceiling, floor up: on
// Windows a minimum above the active maximum — or a maximum below the active
// minimum — is refused rather than reconciled, and this order is valid from
// any starting pair.
function pinSize(win, size) {
  const floor = win.getMinimumSize();
  win.setMinimumSize(Math.min(size.width, floor[0]), Math.min(size.height, floor[1]));
  win.setMaximumSize(size.width, size.height);
  win.setMinimumSize(size.width, size.height);
}

function centredOnPrimary(size) {
  const area = screen.getPrimaryDisplay().workArea;
  return {
    x: Math.round(area.x + (area.width - size.width) / 2),
    y: Math.round(area.y + (area.height - size.height) / 2),
    width: size.width,
    height: size.height,
  };
}

// First launch: the default size, shortened to fit a small screen's work
// area but never below the minimum.
function defaultBoardBounds() {
  const area = screen.getPrimaryDisplay().workArea;
  return centredOnPrimary({
    width: BOARD.width,
    height: Math.max(BOARD.minHeight, Math.min(BOARD.height, area.height - 40)),
  });
}

function boardBounds() {
  const saved = store.getUi().board;
  return saved ? onScreen(saved) : defaultBoardBounds();
}

// Where the board opens at launch: always the primary display. The saved
// position is still honoured for mode switches within a run, but a board last
// left on a side monitor shouldn't come back there on the next start.
function launchBounds() {
  const saved = boardBounds();
  const onPrimary = screen.getDisplayMatching(saved).id === screen.getPrimaryDisplay().id;
  return onPrimary ? saved : centredOnPrimary(saved);
}

// Remembers the geometry of whichever face is showing. Called before every
// switch, so each mode comes back exactly where it was left.
function rememberBounds() {
  const win = liveWindow();
  // Peace mode has no geometry of its own — it is always the display — and
  // must never be saved as the board's.
  if (!win || mode === "peace") return;
  const b = win.getBounds();
  // The fire's corner, whatever the list is doing — see hearthBounds.
  if (mode === "hearth") {
    store.setUi({ hearth: { x: b.x + Math.round((b.width - HEARTH.width) / 2), y: b.y } });
  }
  else store.setUi({ board: b });
}

function pushMode() {
  const win = liveWindow();
  if (win) win.webContents.send("window:mode", mode);
}

function collapseToHearth() {
  const win = liveWindow();
  if (!win || mode === "hearth") return;
  rememberBounds();
  mode = "hearth";

  // Deliberately left resizable, with min == max pinning the size — a
  // resizable:false window grows on every drag move on Windows. See the note
  // above `dragging` for the full story.
  pinSize(win, miniSize());
  win.setBounds(hearthBounds());
  // Above full-screen apps too, or it is not actually always on top.
  win.setAlwaysOnTop(true, "screen-saver");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.showInactive();
  pushMode();
}

function expandToBoard() {
  const win = liveWindow();
  if (!win) return;
  acknowledge();
  if (mode === "board") {
    win.show();
    win.focus();
    return;
  }
  rememberBounds();
  mode = "board";

  win.setAlwaysOnTop(false);
  win.setVisibleOnAllWorkspaces(false);
  // Widen the ceiling before raising the floor: on Windows a minimum above
  // the hearth's still-active maximum is rejected rather than reconciled.
  win.setMaximumSize(BOARD.maxWidth, BOARD.maxHeight);
  win.setMinimumSize(BOARD.minWidth, BOARD.minHeight);
  win.setResizable(true);
  win.setBounds(boardBounds());
  win.show();
  win.focus();
  pushMode();
}

// Peace: the display, the fire, a line of text, and nothing else. Not OS
// fullscreen — a frameless window sized to the display's full bounds (not
// the work area, so the taskbar goes too) and pinned above everything looks
// the same, and reuses the one geometry path that is known to behave on
// Windows instead of adding fullscreen's own set of quirks (it fights the
// min/max constraints the other two modes rely on). Entered from either
// face; left with Escape or the × back to whichever it was.
function enterPeace() {
  const win = liveWindow();
  if (!win || mode === "peace") return;
  rememberBounds();
  peaceFrom = mode;
  mode = "peace";

  const bounds = screen.getDisplayMatching(win.getBounds()).bounds;
  // Ceiling before floor, same as the board switch, and pinned min == max
  // like the hearth so a stray resize can't shrink it.
  win.setMaximumSize(bounds.width, bounds.height);
  win.setMinimumSize(bounds.width, bounds.height);
  win.setBounds(bounds);
  win.setAlwaysOnTop(true, "screen-saver");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.show();
  win.focus();
  pushMode();
}

function leavePeace() {
  const win = liveWindow();
  if (!win || mode !== "peace") return;
  // Drop the floor first: the display-sized minimum is above both faces'
  // maximums, and on Windows a ceiling set below the active floor is refused.
  win.setMinimumSize(HEARTH.width, HEARTH.height);
  if (peaceFrom === "hearth") collapseToHearth();
  else expandToBoard();
}

// ---- the In Flight list -------------------------------------------------
//
// Mini mode is one window: the fire on top, and under it the list of what is
// in flight and what is next up, so the answer to "what was I doing?" is
// already on screen when you sit back down. The saved hearth position is the
// fire's corner, not the window's (see hearthBounds), so the fire keeps its
// place whether the list is there or not.
//
// It holds no logic here: the board renderer derives the rows (core/wip.js)
// and draws them into the same document, so main.js only sizes the window —
// wider when the list is on (the CSS shows the list whenever the mini window
// is that wide, so the two cannot disagree for even a frame), and as tall as
// the renderer says the list is.
//
// Switched on and off from the title bar, the tray and the hearth menu, all
// flipping one persisted flag.

function panelUi() {
  return store.getUi().panel || {};
}

// store.setUi merges at the top level only, so the panel's own fields are
// merged here.
function savePanelUi(patch) {
  store.setUi({ panel: Object.assign({}, panelUi(), patch) });
}

// On by default. An ambient reminder you have to go and switch on is one you
// never switch on, so an absent flag means "never touched", which is not the
// same as "switched off" — only an explicit false turns it off.
function panelEnabled() {
  const saved = panelUi().enabled;
  return saved === undefined ? true : !!saved;
}

// The mini window's size: the hearth alone, or the hearth with the list
// under it.
function miniSize() {
  if (!panelEnabled()) return { width: HEARTH.width, height: HEARTH.height };
  return { width: PANEL.width, height: HEARTH.height + listHeight };
}

// Brings an already-collapsed window to whatever size the list now wants.
// The switch and the renderer's height reports call this; a collapse sizes
// the window itself. Off the hearth there is nothing to do: the next
// collapse reads the same state.
//
// The fire's corner is saved first, from the size the window has *now*, so
// the fire stays put. A height change keeps the top-left corner and so never
// moves the window — which matters, because a WSLg window manager reverts
// programmatic moves of a window already on screen. Switching the list on or
// off mid-stint does shift the left edge (the window widens around the fire).
function syncPanel() {
  const win = liveWindow();
  if (!win || mode !== "hearth") return;
  rememberBounds();
  const next = hearthBounds();
  const b = win.getBounds();
  if (next.x === b.x && next.y === b.y && next.width === b.width && next.height === b.height) return;
  pinSize(win, miniSize());
  win.setBounds(next);
}

// The persistent switch.
function setPanelEnabled(enabled) {
  const on = !!enabled;
  savePanelUi({ enabled: on });
  syncPanel();
  broadcast("panel:enabled", on);
  refreshTray();
  return on;
}

// The renderer measures the list after every render and whenever the mini
// window changes size; a list it could not measure (hidden, on the board)
// reports nothing, so this only ever hears a real height.
function setListHeight(height) {
  const h = Math.round(Number(height) || 0);
  if (h <= 0) return;
  listHeight = Math.min(PANEL.maxHeight, Math.max(PANEL.minHeight, h));
  if (panelEnabled()) syncPanel();
}

// Dragging the floating windows — why it is done by hand.
//
// The obvious way to make a frameless window draggable is a CSS
// `-webkit-app-region: drag` and let the OS move it. That was the first
// version, and on Windows it left the hearth with no way out: a drag region
// is handled as a title bar at the non-client level, so the DOM never sees a
// mousedown, dblclick or contextmenu inside it. The double-click that brings
// the board back, and the right-click menu holding Quit, simply never fired.
//
// Second attempt kept the drag region and read the double-click off the raw
// window messages with win.hookWindowMessage(WM_NCLBUTTONDBLCLK) — Electron's
// Windows-only escape hatch for exactly this. It did not fire either. So the
// window is moved from here instead: the renderer sends pointer deltas over
// IPC (coalesced to one per animation frame) and dragBy() applies them. The
// renderer half of this is js/ui/windowDrag.js.
//
// Doing it this way has two traps of its own on Windows with display scaling
// other than 100%, both of which make the window grow by a pixel on every
// move until you let go:
//   1. setPosition() re-derives the size through a DIP→pixel→DIP round trip
//      and the rounding compounds. dragBy() therefore always calls setBounds()
//      with the window's size spelled out — same native SetWindowPos
//      underneath, so no extra cost, but the size can no longer drift.
//   2. A `resizable: false` window is what triggers the bug in the first
//      place, so collapseToHearth() leaves the window resizable and pins the
//      size with min == max instead (pinSize).
//      The user can't resize either of them meaningfully.
//
// A drag is keyed to the window that sent it rather than assuming the main
// one: `dragging` holds the sender and the bounds it started from.
let dragging = null;

function senderWindow(event) {
  const win = event ? BrowserWindow.fromWebContents(event.sender) : null;
  return win && !win.isDestroyed() ? win : null;
}

function beginDrag(event) {
  const win = senderWindow(event);
  dragging = win ? { win: win, bounds: win.getBounds() } : null;
}

// Full bounds with the size spelled out, never setPosition — see the note
// above `dragging`. The size is the one captured at drag start, which is what
// lets this move a window without knowing its size.
function dragBy(dx, dy) {
  if (!dragging || dragging.win.isDestroyed()) return;
  const from = dragging.bounds;
  dragging.win.setBounds({
    x: Math.round(from.x + dx),
    y: Math.round(from.y + dy),
    width: from.width,
    height: from.height,
  });
}

function endDrag() {
  const win = dragging ? dragging.win : null;
  dragging = null;
  if (win && !win.isDestroyed() && mode === "hearth") rememberBounds();
}

// "New quest" / "New task" from the hearth: no form fits in the mini window, so the
// board comes back with the form already open. The mode push goes out first,
// so the renderer is on the board before it hears which form to open.
function createFromHearth(kind) {
  expandToBoard();
  const win = liveWindow();
  if (win) win.webContents.send("window:create", kind);
}

function showHearthMenu() {
  const win = liveWindow();
  if (!win) return;
  Menu.buildFromTemplate([
    { label: "Open board", click: expandToBoard },
    { label: "New quest", click: () => createFromHearth("quest") },
    { label: "New task", click: () => createFromHearth("task") },
    { type: "separator" },
    { label: "Peace", click: enterPeace },
    {
      label: "In Flight list in mini mode",
      type: "checkbox",
      checked: panelEnabled(),
      click: (item) => setPanelEnabled(item.checked),
    },
    { type: "separator" },
    { label: "Quit Quest Log", click: quitApp },
  ]).popup({ window: win });
}

// Quit has to work from a state where the only visible thing is a 220px
// fire: destroy the window outright (which skips the close-to-hearth
// intercept) and, if the event loop is somehow still alive afterwards, exit.
function quitApp() {
  quitting = true;
  rememberBounds();
  const win = liveWindow();
  if (win) win.destroy();
  app.quit();
  setTimeout(() => app.exit(0), 1500).unref();
}

// The board's × and an OS close both ask before quitting: the hearth is the
// app's resting state, so leaving for real is the unusual choice and a single
// mis-click shouldn't end a running session. Minimise is the no-questions
// way to put the board away. One prompt at a time — a second close while the
// dialog is up is just the same question again.
let confirmingQuit = false;
function confirmQuit() {
  const win = liveWindow();
  if (!win || confirmingQuit) return;
  confirmingQuit = true;
  const running = session ? session.questTitle || "your session" : null;
  dialog.showMessageBox(win, {
    type: "question",
    title: "Quit Quest Log",
    message: "Quit Quest Log?",
    detail: running
      ? `A session is running (${running}) and won't be recorded. Minimise instead to keep the fire burning in the hearth.`
      : "Minimise instead to keep the fire burning in the hearth.",
    buttons: ["Quit", "Cancel"],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
  }).then(({ response }) => {
    confirmingQuit = false;
    if (response === 0) quitApp();
  }).catch(() => { confirmingQuit = false; });
}

function createWindow() {
  // Bounded rather than fixed: the board can grow to two columns of cards and
  // no further, so reaching for more work still costs a scroll.
  const bounds = launchBounds();
  const win = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    minWidth: BOARD.minWidth,
    minHeight: BOARD.minHeight,
    maxWidth: BOARD.maxWidth,
    maxHeight: BOARD.maxHeight,
    resizable: true,
    maximizable: false,
    fullscreenable: false,
    frame: false,
    // The taskbar / window-switcher icon while running from source (a
    // packaged build also stamps it on the executable, see
    // scripts/app-icon.js). Windows wants the .ico, everything else the PNG.
    icon: path.join(__dirname, "assets", process.platform === "win32" ? "icon.ico" : "icon.png"),
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#0b0714" : "#f6f3ff",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile("index.html");
  mainWindow = win;
  mode = "board";
  // An OS-level close (Alt+F4, the dock) means the same as the title bar's ×:
  // ask, then quit. quitApp() destroys the window, which skips this hook.
  win.on("close", (event) => {
    if (quitting) return;
    event.preventDefault();
    confirmQuit();
  });
  win.on("closed", () => {
    mainWindow = null;
    stopTicker();
    clearFinished();
    session = null;
  });
  win.on("focus", touchSeen);
  win.on("blur", touchSeen);
}

// The tray also carries Quit: the board's × is out of reach when only the
// hearth is on screen, so this and the hearth's right-click menu are the
// exits from that state. It carries the In Flight switch for the same reason —
// the title bar's copy is unreachable from the hearth.
//
// Rebuilt on every change rather than set once, because a checkbox in a tray
// menu is a snapshot: Electron reads `checked` when the menu is built.
function trayMenu() {
  return Menu.buildFromTemplate([
    { label: "Open board", click: expandToBoard },
    { label: "Back to hearth", click: collapseToHearth },
    { label: "Peace", click: enterPeace },
    {
      label: "In Flight list in mini mode",
      type: "checkbox",
      checked: panelEnabled(),
      click: (item) => setPanelEnabled(item.checked),
    },
    { type: "separator" },
    { label: "Quit Quest Log", click: quitApp },
  ]);
}

function refreshTray() {
  if (tray && !tray.isDestroyed()) tray.setContextMenu(trayMenu());
}

function createTray() {
  tray = new Tray(path.join(__dirname, "assets", "tray.png"));
  tray.setToolTip("Quest Log");
  tray.setContextMenu(trayMenu());
  tray.on("click", () => {
    if (mode === "peace") leavePeace();
    else if (mode === "board") collapseToHearth();
    else expandToBoard();
  });
}

function registerIpcHandlers() {
  ipcMain.handle("quest-log:list-quests", () => store.getQuests());
  ipcMain.handle("quest-log:create-quest", (event, data) => store.createQuest(data));
  ipcMain.handle("quest-log:update-quest", (event, id, data) => store.updateQuest(id, data));
  ipcMain.handle("quest-log:delete-quest", (event, id) => store.deleteQuest(id));
  ipcMain.handle("quest-log:reorder-quests", (event, ids) => store.reorderQuests(ids));

  ipcMain.handle("quest-log:list-tasks", () => store.getTasks());
  ipcMain.handle("quest-log:create-task", (event, data) => store.createTask(data));
  ipcMain.handle("quest-log:update-task", (event, id, data) => store.updateTask(id, data));
  ipcMain.handle("quest-log:delete-task", (event, id) => store.deleteTask(id));
  ipcMain.handle("quest-log:reorder-tasks", (event, ids) => store.reorderTasks(ids));

  ipcMain.handle("motd:list", () => {
    const motdPath = path.join(__dirname, "assets", "motd.json");
    const raw = fs.readFileSync(motdPath, "utf-8");
    return JSON.parse(raw);
  });

  // Minimise folds into the hearth; close asks and then really quits.
  ipcMain.on("window:minimize", collapseToHearth);
  ipcMain.on("window:close", confirmQuit);
  ipcMain.on("window:expand", expandToBoard);
  ipcMain.on("window:collapse", collapseToHearth);
  ipcMain.on("window:peace", enterPeace);
  ipcMain.on("window:leave-peace", leavePeace);
  ipcMain.handle("window:get-mode", () => mode);
  ipcMain.on("window:drag-start", beginDrag);
  ipcMain.on("window:drag-move", (event, dx, dy) => dragBy(Number(dx) || 0, Number(dy) || 0));
  ipcMain.on("window:drag-end", endDrag);
  ipcMain.on("window:hearth-menu", showHearthMenu);

  ipcMain.handle("session:start", (event, options) => {
    const durationMs = Math.max(60000, Number(options.durationMs) || 25 * 60000);
    clearFinished();
    session = {
      questId: options.questId || null,
      questTitle: options.questTitle || "",
      startedAt: new Date().toISOString(),
      durationMs: durationMs,
      endsAt: Date.now() + durationMs,
      remainingMs: durationMs,
      paused: false,
    };
    startTicker();
    pushSession();
    // Starting work is the cue to get the board out of the way.
    collapseToHearth();
    return sessionView();
  });

  ipcMain.handle("session:pause", () => {
    if (session && !session.paused) {
      session.remainingMs = Math.max(0, session.endsAt - Date.now());
      session.paused = true;
      pushSession();
    }
    return sessionView();
  });

  ipcMain.handle("session:resume", () => {
    if (session && session.paused) {
      session.endsAt = Date.now() + session.remainingMs;
      session.paused = false;
      pushSession();
    }
    return sessionView();
  });

  // Stopping early still records the work — a partial session is still work.
  ipcMain.handle("session:stop", () => {
    finishSession(false);
    return sessionView();
  });

  ipcMain.handle("session:get", () => sessionView());

  ipcMain.handle("session:acknowledge", () => {
    acknowledge();
    return sessionView();
  });

  // The theme lives in the main window's localStorage; every other window
  // learns about it through here.
  ipcMain.on("theme:set", (event, resolved) => {
    currentTheme = resolved;
    BrowserWindow.getAllWindows().forEach((win) => {
      if (win.isDestroyed() || win.webContents === event.sender) return;
      win.webContents.send("theme:changed", resolved);
    });
  });

  ipcMain.handle("theme:get", () => currentTheme);

  ipcMain.handle("quest-log:list-sessions", () => store.getSessions());
  ipcMain.handle("quest-log:last-seen", () => seenBefore);

  // The In Flight list under the fire. The renderer draws the rows itself;
  // main.js holds the switch and sizes the window to the reported height.
  ipcMain.handle("panel:is-enabled", () => panelEnabled());
  ipcMain.handle("panel:set-enabled", (event, enabled) => setPanelEnabled(enabled));
  ipcMain.on("panel:height", (event, height) => setListHeight(height));
}

// A Windows taskbar button never takes its icon from the window. It takes it
// from the Start Menu shortcut that carries the app's id, and failing that
// from the executable's own icon. Packaged, the executable is ours
// (scripts/app-icon.js stamps it), so nothing is needed. From source the
// executable is electron.exe, and the one way to put our icon on the button
// is a shortcut with our id that points at it — which is also a launcher for
// the checkout, so it is not wasted. Written once and left alone while it
// still says the right thing; "Quest Log (dev)" in the Start Menu, delete it
// to be rid of it.
function ensureDevShortcut() {
  if (process.platform !== "win32" || app.isPackaged) return;
  const link = path.join(app.getPath("appData"), "Microsoft", "Windows", "Start Menu", "Programs", "Quest Log (dev).lnk");
  const want = {
    target: process.execPath,
    args: `"${__dirname}"`,
    cwd: __dirname,
    appUserModelId: APP_ID,
    icon: path.join(__dirname, "assets", "icon.ico"),
    iconIndex: 0,
    description: "Quest Log, run from source",
  };
  try {
    const have = shell.readShortcutLink(link);
    if (have.target === want.target && have.args === want.args &&
        have.icon === want.icon && have.appUserModelId === want.appUserModelId) return;
  } catch (e) {
    // Absent or unreadable: write it.
  }
  try {
    shell.writeShortcutLink(link, "create", want);
  } catch (e) {
    // A Start Menu we cannot write to is not worth failing the launch over.
  }
}

app.whenReady().then(() => {
  // The dock icon from source: a packaged bundle carries its own (see
  // scripts/app-icon.js) and would only be told the same thing.
  if (process.platform === "darwin" && !app.isPackaged && app.dock) {
    app.dock.setIcon(path.join(__dirname, "assets", "icon.png"));
  }
  ensureDevShortcut();
  // Before the window: the stamp on disk is the last visit, and the window's
  // first focus would overwrite it.
  readSeenBefore();
  touchSeen();
  registerIpcHandlers();
  createWindow();
  createTray();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("before-quit", () => {
  quitting = true;
  touchSeen();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
