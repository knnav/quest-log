// Boots the real index.html through the real app.js, so a renamed element id
// or a broken import fails here rather than in front of the user.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const INDEX_HTML = fs.readFileSync(path.join(ROOT, "index.html"), "utf-8");

const DAY = 86400000;

let moduleCounter = 0;

function memoryStorage() {
  const data = {};
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
  };
}

function boot(quests, sideQuests) {
  const dom = new JSDOM(`<!doctype html><html><body>${INDEX_HTML}</body></html>`, {
    url: "http://localhost/",
  });

  const win = dom.window;
  win.questLog = {
    listQuests: () => Promise.resolve(quests),
    listSideQuests: () => Promise.resolve(sideQuests),
    updateQuest: () => Promise.resolve({}),
    updateSideQuest: () => Promise.resolve({}),
  };
  win.motd = { list: () => Promise.resolve(["a line"]) };
  win.matchMedia = () => ({ matches: false, addEventListener() {} });

  globalThis.window = win;
  globalThis.document = win.document;
  globalThis.localStorage = memoryStorage();

  moduleCounter += 1;
  return import(`../js/app.js?instance=${moduleCounter}`).then(() => {
    // Let the loadQuests/loadSideQuests promises settle.
    return new Promise((resolve) => setTimeout(() => resolve(dom), 0));
  });
}

const QUESTS = [
  { id: "q1", title: "Shipped one", hook: "h", tier: "weekend", tags: ["a"], dod: "d", status: "shipped", order: 1, completedAt: new Date(Date.now() - 2 * 3600000).toISOString() },
  { id: "q2", title: "Doing it", hook: "h", tier: "weekend", tags: [], dod: "d", status: "in_progress", order: 2, completedAt: null },
  { id: "q3", title: "Waiting", hook: "h", tier: "medium", tags: [], dod: "d", status: "backlog", order: 3, completedAt: null },
];

const SIDE_QUESTS = [
  { id: "s1", title: "Plants", note: "", status: "done", order: 1, completedAt: new Date(Date.now() - 1 * DAY).toISOString() },
  { id: "s2", title: "Bank", note: "", status: "backlog", order: 2, completedAt: null },
];

test("the app boots on the home screen with both stat columns filled", async () => {
  const dom = await boot(QUESTS, SIDE_QUESTS);
  const doc = dom.window.document;

  assert.equal(doc.getElementById("homeScreen").hidden, false);
  assert.equal(doc.getElementById("questsScreen").hidden, true);
  assert.equal(doc.getElementById("sideQuestsScreen").hidden, true);

  assert.match(doc.getElementById("questStats").textContent, /Backlog1/);
  assert.match(doc.getElementById("questStats").textContent, /In progress1/);
  assert.match(doc.getElementById("questStats").textContent, /Shipped1/);
  assert.match(doc.getElementById("sideQuestStats").textContent, /Done1/);
});

test("the bonfire lights from recent completions and names its stage", async () => {
  const dom = await boot(QUESTS, SIDE_QUESTS);
  const doc = dom.window.document;

  // A quest shipped 2h ago (3 × ~0.97) plus a side quest done yesterday
  // (1 × ~0.67) is ~3.6 fuel, which clears the stage-2 threshold of 3.
  const stage = Number(doc.getElementById("bonfire").getAttribute("data-stage"));
  assert.equal(stage, 2, "a quest and a side quest inside the decay window");
  assert.equal(doc.getElementById("bonfireStage").textContent, "Burning");
  assert.ok(doc.getElementById("bonfireNote").textContent.length > 0);
});

test("an empty log shows embers and no elapsed time", async () => {
  const dom = await boot([], []);
  const doc = dom.window.document;

  assert.equal(doc.getElementById("bonfire").getAttribute("data-stage"), "0");
  assert.equal(doc.getElementById("bonfireStage").textContent, "Embers");
  assert.equal(doc.getElementById("sinceValue").textContent, "—");
  assert.equal(doc.getElementById("sinceLabel").textContent, "nothing finished yet");
});

test("the elapsed readout counts from the most recent completion", async () => {
  const dom = await boot(QUESTS, SIDE_QUESTS);
  const doc = dom.window.document;

  assert.equal(doc.getElementById("sinceValue").textContent, "2h 0m");
  assert.equal(doc.getElementById("sinceLabel").textContent, "since your last drop");
});

test("an in-progress quest appears once, in its own block and not on the board", async () => {
  const dom = await boot(QUESTS, SIDE_QUESTS);
  const doc = dom.window.document;

  const inProgressBlock = doc.getElementById("progressGrid");
  assert.equal(inProgressBlock.querySelectorAll(".quest-card").length, 1);
  assert.equal(inProgressBlock.querySelector(".card-title").textContent, "Doing it");

  const board = doc.getElementById("board");
  const boardTitles = Array.from(board.querySelectorAll(".card-title")).map((el) => el.textContent);
  assert.ok(!boardTitles.includes("Doing it"), "in-progress quests must not render twice");
  assert.deepEqual(boardTitles.sort(), ["Shipped one", "Waiting"]);
});

test("a tag filter covers the whole tab, In Progress block included", async () => {
  const quests = [
    { id: "q1", title: "Tagged doing", hook: "h", tier: "weekend", tags: ["elixir"], dod: "d", status: "in_progress", order: 1 },
    { id: "q2", title: "Untagged doing", hook: "h", tier: "weekend", tags: [], dod: "d", status: "in_progress", order: 2 },
    { id: "q3", title: "Tagged waiting", hook: "h", tier: "weekend", tags: ["elixir"], dod: "d", status: "backlog", order: 3 },
    { id: "q4", title: "Untagged waiting", hook: "h", tier: "weekend", tags: [], dod: "d", status: "backlog", order: 4 },
  ];
  const dom = await boot(quests, []);
  const doc = dom.window.document;

  const titles = (sel) => Array.from(doc.querySelectorAll(sel + " .card-title")).map((el) => el.textContent);

  assert.deepEqual(titles("#progressGrid").sort(), ["Tagged doing", "Untagged doing"]);
  assert.deepEqual(titles("#board").sort(), ["Tagged waiting", "Untagged waiting"]);

  const elixir = Array.from(doc.querySelectorAll("#filters .chip")).find((c) => c.textContent === "elixir");
  elixir.dispatchEvent(new dom.window.Event("click", { bubbles: true }));

  assert.deepEqual(titles("#progressGrid"), ["Tagged doing"], "the filter reaches the In Progress block");
  assert.deepEqual(titles("#board"), ["Tagged waiting"]);
});

test("the filter row sits above everything it filters", async () => {
  const dom = await boot(QUESTS, SIDE_QUESTS);
  const doc = dom.window.document;

  const screen = doc.getElementById("questsScreen");
  const order = Array.from(screen.children).map((el) => el.id);
  assert.equal(order.indexOf("filters"), 0, "filters come first in the Quests tab");
  assert.ok(order.indexOf("questsInProgress") > 0);
  assert.ok(order.indexOf("board") > order.indexOf("questsInProgress"));
});

test("side quests split across their three sections", async () => {
  const dom = await boot(QUESTS, SIDE_QUESTS);
  const doc = dom.window.document;

  assert.equal(doc.getElementById("progressSideQuests").hidden, true, "nothing in progress");
  assert.equal(doc.getElementById("backlogSideQuests").hidden, false);
  assert.equal(doc.getElementById("hallOfFame").hidden, false);
  assert.equal(doc.getElementById("hallOfFameGrid").querySelector(".card-title").textContent, "Plants");
  assert.equal(doc.getElementById("sideQuestsEmpty").hidden, true);
});

test("with no side quests at all, the tab shows one empty state", async () => {
  const dom = await boot(QUESTS, []);
  const doc = dom.window.document;

  assert.equal(doc.getElementById("sideQuestsEmpty").hidden, false);
  assert.equal(doc.getElementById("progressSideQuests").hidden, true);
  assert.equal(doc.getElementById("backlogSideQuests").hidden, true);
  assert.equal(doc.getElementById("hallOfFame").hidden, true);
});

test("the create button follows the active tab", async () => {
  const dom = await boot(QUESTS, SIDE_QUESTS);
  const doc = dom.window.document;

  assert.equal(doc.getElementById("addQuestBtn").hidden, false, "home offers + Quest");
  assert.equal(doc.getElementById("addSideQuestBtn").hidden, true);

  doc.querySelector('.tab[data-tab="sideQuests"]')
    .dispatchEvent(new dom.window.Event("click", { bubbles: true }));

  assert.equal(doc.getElementById("addQuestBtn").hidden, true);
  assert.equal(doc.getElementById("addSideQuestBtn").hidden, false);
});

test("Ctrl+N switches to the tab that will show the new item", async () => {
  const dom = await boot(QUESTS, SIDE_QUESTS);
  const doc = dom.window.document;

  doc.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "n", ctrlKey: true, bubbles: true }));
  assert.equal(doc.getElementById("questsScreen").hidden, false);
  assert.equal(doc.getElementById("questModalOverlay").hidden, false);

  doc.getElementById("questCancelBtn").dispatchEvent(new dom.window.Event("click", { bubbles: true }));

  doc.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "N", ctrlKey: true, shiftKey: true, bubbles: true }));
  assert.equal(doc.getElementById("sideQuestsScreen").hidden, false);
  assert.equal(doc.getElementById("sideQuestModalOverlay").hidden, false);
});
