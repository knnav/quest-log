const { app, BrowserWindow, Menu, Tray, ipcMain, nativeTheme, screen } = require("electron");
const fs = require("fs");
const path = require("path");
const store = require("./store");

// The timer lives in the main process, not in the renderer. The window has two
// faces (hearth and board) that both draw the same countdown, and it has to
// keep running through a collapse — so there is exactly one clock and the
// renderer just draws it.
let session = null;
let sessionTicker = null;
let mainWindow = null;
let tray = null;
let quitting = false;
let currentTheme = null;

// One window, two modes. The hearth is the tiny always-on-top resident that
// lives in a screen corner; the board is the full app. Switching is a
// setBounds + a flag pushed to the renderer, never a second BrowserWindow, so
// theme, session and data plumbing exist once.
const HEARTH = { width: 220, height: 210 };
const BOARD = { width: 420, height: 880, minWidth: 420, minHeight: 600, maxWidth: 720, maxHeight: 4000 };
let mode = "board";

function sessionView() {
  if (!session) return { active: false };
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

  session = null;
  stopTicker();
  pushSession();

  // Only a completed session rings the chime; stopping early is deliberate.
  if (completed && liveWindow()) {
    liveWindow().webContents.send("session:finished");
  }
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

function hearthBounds() {
  const saved = store.getUi().hearth;
  const area = screen.getPrimaryDisplay().workArea;
  const fallback = {
    x: area.x + area.width - HEARTH.width - 24,
    y: area.y + area.height - HEARTH.height - 24,
  };
  return onScreen(Object.assign({}, HEARTH, saved || fallback));
}

function boardBounds() {
  const saved = store.getUi().board;
  if (saved) return onScreen(saved);

  const area = screen.getPrimaryDisplay().workArea;
  return {
    x: Math.round(area.x + (area.width - BOARD.width) / 2),
    y: Math.round(area.y + (area.height - BOARD.height) / 2),
    width: BOARD.width,
    height: BOARD.height,
  };
}

// Remembers the geometry of whichever face is showing. Called before every
// switch, so each mode comes back exactly where it was left.
function rememberBounds() {
  const win = liveWindow();
  if (!win) return;
  const b = win.getBounds();
  if (mode === "hearth") store.setUi({ hearth: { x: b.x, y: b.y } });
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
  // above dragOrigin for the full story.
  win.setMinimumSize(HEARTH.width, HEARTH.height);
  win.setMaximumSize(HEARTH.width, HEARTH.height);
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

// Dragging the hearth — why it is done by hand.
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
// window is moved from here instead: hearth.js sends pointer deltas over IPC
// (coalesced to one per animation frame) and dragBy() applies them.
//
// Doing it this way has two traps of its own on Windows with display scaling
// other than 100%, both of which make the window grow by a pixel on every
// move until you let go:
//   1. setPosition() re-derives the size through a DIP→pixel→DIP round trip
//      and the rounding compounds. dragBy() therefore always calls setBounds()
//      with the hearth's fixed size spelled out — same native SetWindowPos
//      underneath, so no extra cost, but the size can no longer drift.
//   2. A `resizable: false` window is what triggers the bug in the first
//      place, so collapseToHearth() leaves the window resizable and pins the
//      size with min == max instead. The user can't resize it either way.
let dragOrigin = null;

function beginDrag() {
  const win = liveWindow();
  if (win) dragOrigin = win.getBounds();
}

// Full bounds with the size spelled out, never setPosition — see the note
// above dragOrigin.
function dragBy(dx, dy) {
  const win = liveWindow();
  if (!win || !dragOrigin) return;
  win.setBounds({
    x: Math.round(dragOrigin.x + dx),
    y: Math.round(dragOrigin.y + dy),
    width: HEARTH.width,
    height: HEARTH.height,
  });
}

function endDrag() {
  dragOrigin = null;
  if (mode === "hearth") rememberBounds();
}

function showHearthMenu() {
  const win = liveWindow();
  if (!win) return;
  Menu.buildFromTemplate([
    { label: "Open board", click: expandToBoard },
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

function createWindow() {
  // Bounded rather than fixed: the board can grow to two columns of cards and
  // no further, so reaching for more work still costs a scroll.
  const bounds = boardBounds();
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
  // fold into the hearth. Only the tray's Quit lets the window actually go.
  win.on("close", (event) => {
    if (quitting) return;
    event.preventDefault();
    collapseToHearth();
  });
  win.on("closed", () => {
    mainWindow = null;
    stopTicker();
    session = null;
  });
}

// The tray is the only place Quit lives: the board's close button folds it
// into the hearth, so without this there would be no way out of the app.
function createTray() {
  tray = new Tray(path.join(__dirname, "assets", "tray.png"));
  tray.setToolTip("Quest Log");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Open board", click: expandToBoard },
    { label: "Back to hearth", click: collapseToHearth },
    { type: "separator" },
    { label: "Quit Quest Log", click: quitApp },
  ]));
  tray.on("click", () => (mode === "board" ? collapseToHearth() : expandToBoard()));
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

  // Minimise and close both mean "fold into the hearth" — the app never
  // leaves the screen unless you quit it from the tray.
  ipcMain.on("window:minimize", collapseToHearth);
  ipcMain.on("window:close", collapseToHearth);
  ipcMain.on("window:expand", expandToBoard);
  ipcMain.on("window:collapse", collapseToHearth);
  ipcMain.handle("window:get-mode", () => mode);
  ipcMain.on("window:drag-start", beginDrag);
  ipcMain.on("window:drag-move", (event, dx, dy) => dragBy(Number(dx) || 0, Number(dy) || 0));
  ipcMain.on("window:drag-end", endDrag);
  ipcMain.on("window:hearth-menu", showHearthMenu);

  ipcMain.handle("session:start", (event, options) => {
    const durationMs = Math.max(60000, Number(options.durationMs) || 25 * 60000);
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

}

app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();
  createTray();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("before-quit", () => { quitting = true; });

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
