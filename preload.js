const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("questLog", {
  listQuests: () => ipcRenderer.invoke("quest-log:list-quests"),
  createQuest: (data) => ipcRenderer.invoke("quest-log:create-quest", data),
  updateQuest: (id, data) => ipcRenderer.invoke("quest-log:update-quest", id, data),
  deleteQuest: (id) => ipcRenderer.invoke("quest-log:delete-quest", id),
  listPinned: () => ipcRenderer.invoke("quest-log:list-pinned"),
  updatePinned: (id, data) => ipcRenderer.invoke("quest-log:update-pinned", id, data),
});
