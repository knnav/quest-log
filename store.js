const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { app } = require("electron");

const STORE_PATH = path.join(app.getPath("userData"), "quest-log.json");

const DEFAULT_STORE = {
  quests: [],
  pinned: [
    {
      id: "gb-emulator",
      title: "GB Emulator",
      status: "Pinned on GitHub — already active, outside this backlog.",
      next: "",
      todo: "",
      state: "in_progress",
      order: 1,
    },
    {
      id: "elixir-in-airflow",
      title: "elixir-in-airflow",
      status: "Pinned on GitHub — already active, outside this backlog.",
      next: "",
      todo: "",
      state: "in_progress",
      order: 2,
    },
  ],
};

function ensureStore() {
  if (!fs.existsSync(STORE_PATH)) {
    fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
    writeStore(DEFAULT_STORE);
  }
}

function readStore() {
  ensureStore();
  const raw = fs.readFileSync(STORE_PATH, "utf-8");
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
  const dir = path.dirname(STORE_PATH);
  const tmpPath = path.join(dir, `.quest-log.json.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2));
  fs.renameSync(tmpPath, STORE_PATH);
}

function nextOrder(list) {
  return list.reduce((max, item) => Math.max(max, item.order || 0), 0) + 1;
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

module.exports = {
  getQuests,
  createQuest,
  updateQuest,
  deleteQuest,
  getPinned,
  updatePinned,
};
