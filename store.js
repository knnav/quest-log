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
      dod: "Click a status pill below to cycle Backlog → In Progress → Shipped, then use + Create Quest up top to create your first real idea. Edit or delete this card any time from its header.",
      status: "backlog",
      order: 1,
    },
  ],
  tasks: [],
};

function nextOrder(list) {
  return list.reduce((max, item) => Math.max(max, item.order || 0), 0) + 1;
}

// The bonfire burns on recently finished work, so completion is stamped here
// rather than in the renderer: set on the way into the done state, cleared on
// the way out. That makes completedAt a pure function of current status, so
// re-clicking a status pill can't farm fuel.
//
// An item already sitting in the done state keeps whatever it had — including
// nothing. Quests finished before this existed stay undated instead of being
// backfilled to now and lighting a fire nobody earned.
function completionStamp(before, after, doneStatus) {
  if (after.status !== doneStatus) return null;
  if (before && before.status === doneStatus) return before.completedAt || null;
  return new Date().toISOString();
}

function applyOrder(list, orderedIds) {
  orderedIds.forEach((id, index) => {
    const item = list.find((entry) => entry.id === id);
    if (item) item.order = index + 1;
  });
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
      if (!Array.isArray(parsed.tasks)) parsed.tasks = [];
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
      completedAt: completionStamp(null, { status: data.status || "backlog" }, "shipped"),
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
    const merged = Object.assign({}, store.quests[idx], data, { id });
    merged.completedAt = completionStamp(store.quests[idx], merged, "shipped");
    store.quests[idx] = merged;
    writeStore(store);
    return merged;
  }

  function deleteQuest(id) {
    const store = readStore();
    store.quests = store.quests.filter((q) => q.id !== id);
    writeStore(store);
  }

  function reorderQuests(orderedIds) {
    const store = readStore();
    applyOrder(store.quests, orderedIds);
    writeStore(store);
    return store.quests;
  }

  function getTasks() {
    return readStore().tasks;
  }

  function createTask(data) {
    const store = readStore();
    const task = {
      id: crypto.randomUUID(),
      title: data.title || "",
      note: data.note || "",
      status: data.status || "backlog",
      completedAt: completionStamp(null, { status: data.status || "backlog" }, "done"),
      order: nextOrder(store.tasks),
    };
    store.tasks.push(task);
    writeStore(store);
    return task;
  }

  function updateTask(id, data) {
    const store = readStore();
    const idx = store.tasks.findIndex((s) => s.id === id);
    if (idx === -1) throw new Error(`Task not found: ${id}`);
    const merged = Object.assign({}, store.tasks[idx], data, { id });
    merged.completedAt = completionStamp(store.tasks[idx], merged, "done");
    store.tasks[idx] = merged;
    writeStore(store);
    return merged;
  }

  function deleteTask(id) {
    const store = readStore();
    store.tasks = store.tasks.filter((s) => s.id !== id);
    writeStore(store);
  }

  function reorderTasks(orderedIds) {
    const store = readStore();
    applyOrder(store.tasks, orderedIds);
    writeStore(store);
    return store.tasks;
  }

  return {
    getQuests,
    createQuest,
    updateQuest,
    deleteQuest,
    reorderQuests,
    getTasks,
    createTask,
    updateTask,
    deleteTask,
    reorderTasks,
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
  reorderQuests: (...args) => getDefaultStore().reorderQuests(...args),
  getTasks: (...args) => getDefaultStore().getTasks(...args),
  createTask: (...args) => getDefaultStore().createTask(...args),
  updateTask: (...args) => getDefaultStore().updateTask(...args),
  deleteTask: (...args) => getDefaultStore().deleteTask(...args),
  reorderTasks: (...args) => getDefaultStore().reorderTasks(...args),
};
