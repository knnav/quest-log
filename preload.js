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
});

contextBridge.exposeInMainWorld("motd", {
  list: () => ipcRenderer.invoke("motd:list"),
});

contextBridge.exposeInMainWorld("windowControls", {
  minimize: () => ipcRenderer.send("window:minimize"),
  toggleMaximize: () => ipcRenderer.send("window:toggle-maximize"),
  close: () => ipcRenderer.send("window:close"),
  isMaximized: () => ipcRenderer.invoke("window:is-maximized"),
  onMaximizedChange: (callback) => {
    ipcRenderer.on("window:maximized-changed", (event, isMaximized) => callback(isMaximized));
  },
});
