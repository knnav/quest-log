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
  onChange: (callback) => {
    ipcRenderer.on("session:changed", (event, view) => callback(view));
  },
  onFinished: (callback) => {
    ipcRenderer.on("session:finished", () => callback());
  },
});

contextBridge.exposeInMainWorld("themeSync", {
  set: (resolved) => ipcRenderer.send("theme:set", resolved),
  get: () => ipcRenderer.invoke("theme:get"),
  onChange: (callback) => {
    ipcRenderer.on("theme:changed", (event, resolved) => callback(resolved));
  },
});

contextBridge.exposeInMainWorld("motd", {
  list: () => ipcRenderer.invoke("motd:list"),
});

// Minimise and close both fold the board into the hearth; main.js decides
// what they mean, the renderer just reports the click.
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
