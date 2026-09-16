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
  sessions: [],
};

function nextOrder(list) {
  return list.reduce((max, item) => Math.max(max, item.order || 0), 0) + 1;
}

// Three different clocks, because they answer three different questions.
//
//   completedAt — fuel. A pure function of current status: set on the way into
//                 a terminal state, cleared on the way out, so re-clicking a
//                 status pill can never farm the bonfire.
//   finishedAt  — history. Set the first time something finishes and only ever
//                 advanced by a *newer* finish. Never cleared, so a stray click
//                 on a status pill can't destroy the day you shipped.
//   startedAt   — the first time you actually began. Never overwritten, so
//                 bouncing in and out of progress doesn't reset the clock.
//
// Anything already sitting in a terminal state keeps what it had, including
// nothing: work finished before these existed stays undated rather than being
// backfilled to now and lighting a fire nobody earned.
function stampTimes(before, after, terminalStatuses) {
  const now = new Date().toISOString();
  const wasTerminal = !!before && terminalStatuses.includes(before.status);
  const isTerminal = terminalStatuses.includes(after.status);

  let completedAt = null;
  if (isTerminal) completedAt = wasTerminal ? (before.completedAt || null) : now;

  let finishedAt = (before && before.finishedAt) || null;
  if (isTerminal && !wasTerminal) finishedAt = now;

  let startedAt = (before && before.startedAt) || null;
  if (!startedAt && after.status === "in_progress") startedAt = now;

  return { completedAt, finishedAt, startedAt };
}

const QUEST_TERMINAL = ["shipped", "let_go"];
const TASK_TERMINAL = ["done"];

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
      if (!Array.isArray(parsed.sessions)) parsed.sessions = [];
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
      createdAt: new Date().toISOString(),
      order: nextOrder(store.quests),
    };
    Object.assign(quest, stampTimes(null, quest, QUEST_TERMINAL));
    store.quests.push(quest);
    writeStore(store);
    return quest;
  }

  function updateQuest(id, data) {
    const store = readStore();
    const idx = store.quests.findIndex((q) => q.id === id);
    if (idx === -1) throw new Error(`Quest not found: ${id}`);
    const merged = Object.assign({}, store.quests[idx], data, { id });
    Object.assign(merged, stampTimes(store.quests[idx], merged, QUEST_TERMINAL));
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
      createdAt: new Date().toISOString(),
      order: nextOrder(store.tasks),
    };
    Object.assign(task, stampTimes(null, task, TASK_TERMINAL));
    store.tasks.push(task);
    writeStore(store);
    return task;
  }

  function updateTask(id, data) {
    const store = readStore();
    const idx = store.tasks.findIndex((s) => s.id === id);
    if (idx === -1) throw new Error(`Task not found: ${id}`);
    const merged = Object.assign({}, store.tasks[idx], data, { id });
    Object.assign(merged, stampTimes(store.tasks[idx], merged, TASK_TERMINAL));
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

  // A session is a stretch of actual work against one quest. Elapsed calendar
  // days were always a lie — six days can be two hours — so this is what makes
  // the scope record mean anything. Sessions never feed the bonfire: fuel stays
  // outcome-only, or the fire would start rewarding time spent.
  function getSessions() {
    return readStore().sessions;
  }

  function recordSession(data) {
    const store = readStore();
    const session = {
      id: crypto.randomUUID(),
      questId: data.questId || null,
      startedAt: data.startedAt,
      endedAt: data.endedAt || new Date().toISOString(),
      completed: !!data.completed,
    };
    store.sessions.push(session);
    writeStore(store);
    return session;
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
    getSessions,
    recordSession,
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
  getSessions: (...args) => getDefaultStore().getSessions(...args),
  recordSession: (...args) => getDefaultStore().recordSession(...args),
};
