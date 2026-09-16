const { app, BrowserWindow, ipcMain, nativeTheme, screen } = require("electron");
const fs = require("fs");
const path = require("path");
const store = require("./store");

// The timer lives in the main process, not in either renderer. Two windows
// show the same countdown, and it has to keep running while the main window is
// minimised — so there is exactly one clock and both views just draw it.
let session = null;
let sessionTicker = null;
let mainWindow = null;
let miniWindow = null;
let currentTheme = null;

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

  // The main window always exists, so it is the one that makes the noise —
  // otherwise closing the mini window would silence the end of the session.
  if (completed && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("session:finished");
  }
  if (completed) closeMiniWindow();
}

function createMiniWindow() {
  if (miniWindow && !miniWindow.isDestroyed()) {
    miniWindow.showInactive();
    return;
  }

  const area = screen.getPrimaryDisplay().workArea;
  const width = 248;
  const height = 108;

  miniWindow = new BrowserWindow({
    width,
    height,
    x: area.x + area.width - width - 24,
    y: area.y + area.height - height - 24,
    frame: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#0b0714" : "#f6f3ff",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Above full-screen apps too, or it is not actually always on top.
  miniWindow.setAlwaysOnTop(true, "screen-saver");
  miniWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  miniWindow.loadFile("mini.html");
  miniWindow.on("closed", () => { miniWindow = null; });
}

function closeMiniWindow() {
  if (miniWindow && !miniWindow.isDestroyed()) miniWindow.close();
  miniWindow = null;
}

function createWindow() {
  // Fixed and phone-shaped on purpose. The board doesn't get to sprawl, so
  // reaching for more work costs a scroll — which is the point.
  const win = new BrowserWindow({
    width: 420,
    height: 880,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    center: true,
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
  win.on("closed", () => {
    mainWindow = null;
    // The mini window skips the taskbar, so leaving it alive would strand a
    // floating countdown with no way back to the app.
    stopTicker();
    session = null;
    closeMiniWindow();
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

  ipcMain.on("window:minimize", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.minimize();
  });

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
    createMiniWindow();
    pushSession();
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
    closeMiniWindow();
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

  ipcMain.on("window:close", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.close();
  });
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
