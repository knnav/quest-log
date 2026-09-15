const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DEFAULT_STORE = {
  quests: [
    {
      id: "welcome",
      title: "Welcome to Quest Log",
      hook: "Scoped drops for a green graph — this board is for side-project ideas small enough to actually ship. Each quest gets a Definition of Done before it gets a first commit.",
      tier: "weekend",
      tags: ["Tutorial"],
      dod: "Click a status pill below to cycle Backlog → In Progress → Shipped, then use + Add Quest up top to create your first real idea. Edit or delete this card any time from its header.",
      status: "backlog",
      order: 1,
    },
  ],
  pinned: [],
};

function nextOrder(list) {
  return list.reduce((max, item) => Math.max(max, item.order || 0), 0) + 1;
}

function createStore(storePath) {
  function ensureStore() {
    if (!fs.existsSync(storePath)) {
      fs.mkdirSync(path.dirname(storePath), { recursive: true });
      writeStore(DEFAULT_STORE);
    }
  }

  function readStore() {
    ensureStore();
    const raw = fs.readFileSync(storePath, "utf-8");
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed.quests)) parsed.quests = [];
      if (!Array.isArray(parsed.pinned)) parsed.pinned = DEFAULT_STORE.pinned;
      return parsed;
    } catch (err) {
      return JSON.parse(JSON.stringify(DEFAULT_STORE));
    }
  }

  function writeStore(data) {
    const dir = path.dirname(storePath);
    const tmpPath = path.join(dir, `.quest-log.json.${process.pid}.${Date.now()}.tmp`);
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2));
    fs.renameSync(tmpPath, storePath);
  }

  function getQuests() {
    return readStore().quests;
  }

  function createQuest(data) {
    const store = readStore();
    const quest = {
      id: crypto.randomUUID(),
      title: data.title || "",
      hook: data.hook || "",
      tier: data.tier || "weekend",
      tags: Array.isArray(data.tags) ? data.tags : [],
      dod: data.dod || "",
      status: data.status || "backlog",
      order: nextOrder(store.quests),
    };
    store.quests.push(quest);
    writeStore(store);
    return quest;
  }

  function updateQuest(id, data) {
    const store = readStore();
    const idx = store.quests.findIndex((q) => q.id === id);
    if (idx === -1) throw new Error(`Quest not found: ${id}`);
    store.quests[idx] = Object.assign({}, store.quests[idx], data, { id });
    writeStore(store);
    return store.quests[idx];
  }

  function deleteQuest(id) {
    const store = readStore();
    store.quests = store.quests.filter((q) => q.id !== id);
    writeStore(store);
  }

  function getPinned() {
    return readStore().pinned;
  }

  function updatePinned(id, data) {
    const store = readStore();
    const idx = store.pinned.findIndex((p) => p.id === id);
    if (idx === -1) throw new Error(`Pinned repo not found: ${id}`);
    store.pinned[idx] = Object.assign({}, store.pinned[idx], data, { id });
    writeStore(store);
    return store.pinned[idx];
  }

  return {
    getQuests,
    createQuest,
    updateQuest,
    deleteQuest,
    getPinned,
    updatePinned,
  };
}

let defaultStore = null;

function getDefaultStore() {
  if (!defaultStore) {
    const { app } = require("electron");
    defaultStore = createStore(path.join(app.getPath("userData"), "quest-log.json"));
  }
  return defaultStore;
}

module.exports = {
  createStore,
  getQuests: (...args) => getDefaultStore().getQuests(...args),
  createQuest: (...args) => getDefaultStore().createQuest(...args),
  updateQuest: (...args) => getDefaultStore().updateQuest(...args),
  deleteQuest: (...args) => getDefaultStore().deleteQuest(...args),
  getPinned: (...args) => getDefaultStore().getPinned(...args),
  updatePinned: (...args) => getDefaultStore().updatePinned(...args),
};
