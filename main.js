const { app, BrowserWindow, ipcMain, nativeTheme } = require("electron");
const fs = require("fs");
const path = require("path");
const store = require("./store");

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
