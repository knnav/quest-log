const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("questLog", {
  listQuests: () => ipcRenderer.invoke("quest-log:list-quests"),
  createQuest: (data) => ipcRenderer.invoke("quest-log:create-quest", data),
  updateQuest: (id, data) => ipcRenderer.invoke("quest-log:update-quest", id, data),
  deleteQuest: (id) => ipcRenderer.invoke("quest-log:delete-quest", id),
  reorderQuests: (ids) => ipcRenderer.invoke("quest-log:reorder-quests", ids),
  listSideQuests: () => ipcRenderer.invoke("quest-log:list-side-quests"),
  createSideQuest: (data) => ipcRenderer.invoke("quest-log:create-side-quest", data),
  updateSideQuest: (id, data) => ipcRenderer.invoke("quest-log:update-side-quest", id, data),
  deleteSideQuest: (id) => ipcRenderer.invoke("quest-log:delete-side-quest", id),
  reorderSideQuests: (ids) => ipcRenderer.invoke("quest-log:reorder-side-quests", ids),
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
