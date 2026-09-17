const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("questLog", {
  listQuests: () => ipcRenderer.invoke("quest-log:list-quests"),
  createQuest: (data) => ipcRenderer.invoke("quest-log:create-quest", data),
  updateQuest: (id, data) => ipcRenderer.invoke("quest-log:update-quest", id, data),
  deleteQuest: (id) => ipcRenderer.invoke("quest-log:delete-quest", id),
  reorderQuests: (ids) => ipcRenderer.invoke("quest-log:reorder-quests", ids),
  listTasks: () => ipcRenderer.invoke("quest-log:list-tasks"),
  createTask: (data) => ipcRenderer.invoke("quest-log:create-task", data),
  updateTask: (id, data) => ipcRenderer.invoke("quest-log:update-task", id, data),
  deleteTask: (id) => ipcRenderer.invoke("quest-log:delete-task", id),
  reorderTasks: (ids) => ipcRenderer.invoke("quest-log:reorder-tasks", ids),
  listSessions: () => ipcRenderer.invoke("quest-log:list-sessions"),
});

contextBridge.exposeInMainWorld("session", {
  start: (options) => ipcRenderer.invoke("session:start", options),
  pause: () => ipcRenderer.invoke("session:pause"),
  resume: () => ipcRenderer.invoke("session:resume"),
  stop: () => ipcRenderer.invoke("session:stop"),
  get: () => ipcRenderer.invoke("session:get"),
  acknowledge: () => ipcRenderer.invoke("session:acknowledge"),
  onChange: (callback) => {
    ipcRenderer.on("session:changed", (event, view) => callback(view));
  },
  onFinished: (callback) => {
    ipcRenderer.on("session:finished", () => callback());
  },
  // Reminder chimes for a finished session nobody has acknowledged yet.
  onNudge: (callback) => {
    ipcRenderer.on("session:nudge", () => callback());
  },
});

contextBridge.exposeInMainWorld("themeSync", {
  set: (resolved) => ipcRenderer.send("theme:set", resolved),
  get: () => ipcRenderer.invoke("theme:get"),
  onChange: (callback) => {
    ipcRenderer.on("theme:changed", (event, resolved) => callback(resolved));
  },
});

// The In Flight panel, which is its own window. The first three are called
// from the board (which owns the data and the on/off switch), the rest from
// the panel itself. Both documents get the whole namespace; each uses its
// half. Moving the panel goes through windowControls.drag* like the hearth —
// main.js applies the deltas to whichever window sent them.
contextBridge.exposeInMainWorld("panel", {
  push: (data) => ipcRenderer.send("panel:push", data),
  setEnabled: (enabled) => ipcRenderer.invoke("panel:set-enabled", enabled),
  isEnabled: () => ipcRenderer.invoke("panel:is-enabled"),
  onEnabledChange: (callback) => {
    ipcRenderer.on("panel:enabled", (event, enabled) => callback(enabled));
  },
  get: () => ipcRenderer.invoke("panel:get"),
  onData: (callback) => {
    ipcRenderer.on("panel:data", (event, data) => callback(data));
  },
  hide: () => ipcRenderer.send("panel:hide"),
  menu: () => ipcRenderer.send("panel:menu"),
  resize: (height) => ipcRenderer.send("panel:resize", height),
});

contextBridge.exposeInMainWorld("motd", {
  list: () => ipcRenderer.invoke("motd:list"),
});

// Minimise folds the board into the hearth; close asks and then quits.
// main.js decides what they mean, the renderer just reports the click.
contextBridge.exposeInMainWorld("windowControls", {
  minimize: () => ipcRenderer.send("window:minimize"),
  close: () => ipcRenderer.send("window:close"),
  expand: () => ipcRenderer.send("window:expand"),
  collapse: () => ipcRenderer.send("window:collapse"),
  dragStart: () => ipcRenderer.send("window:drag-start"),
  dragMove: (dx, dy) => ipcRenderer.send("window:drag-move", dx, dy),
  dragEnd: () => ipcRenderer.send("window:drag-end"),
  hearthMenu: () => ipcRenderer.send("window:hearth-menu"),
  getMode: () => ipcRenderer.invoke("window:get-mode"),
  onModeChange: (callback) => {
    ipcRenderer.on("window:mode", (event, mode) => callback(mode));
  },
});
