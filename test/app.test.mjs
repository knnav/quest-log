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

function boot(quests, tasks) {
  const dom = new JSDOM(`<!doctype html><html><body>${INDEX_HTML}</body></html>`, {
    url: "http://localhost/",
  });

  const win = dom.window;
  win.questLog = {
    listQuests: () => Promise.resolve(quests),
    listTasks: () => Promise.resolve(tasks),
    updateQuest: () => Promise.resolve({}),
    updateTask: () => Promise.resolve({}),
  };
  win.motd = { list: () => Promise.resolve(["a line"]) };
  win.matchMedia = () => ({ matches: false, addEventListener() {} });

  globalThis.window = win;
  globalThis.document = win.document;
  globalThis.localStorage = memoryStorage();

  moduleCounter += 1;
  return import(`../js/app.js?instance=${moduleCounter}`).then(() => {
    // Let the loadQuests/loadTasks promises settle.
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
  assert.equal(doc.getElementById("tasksScreen").hidden, true);

  assert.match(doc.getElementById("questStats").textContent, /Backlog1/);
  assert.match(doc.getElementById("questStats").textContent, /In progress1/);
  assert.match(doc.getElementById("questStats").textContent, /Shipped1/);
  assert.match(doc.getElementById("taskStats").textContent, /Done1/);
});

test("the bonfire lights from recent completions and names its stage", async () => {
  const dom = await boot(QUESTS, SIDE_QUESTS);
  const doc = dom.window.document;

  // A quest shipped 2h ago (3 × ~0.97) plus a task done yesterday
  // (1 × ~0.67) is ~3.6 fuel, which clears the stage-2 threshold of 3.
  const stage = Number(doc.getElementById("bonfire").getAttribute("data-stage"));
  assert.equal(stage, 2, "a quest and a task inside the decay window");
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

test("the board is split into timeboxes and a Hall of Fame", async () => {
  const dom = await boot(QUESTS, SIDE_QUESTS);
  const doc = dom.window.document;

  // The only backlog quest here is the Fortnight one; the Weekend quests are
  // in progress and shipped, so they live elsewhere.
  const headings = Array.from(doc.querySelectorAll("#board .tier-title")).map((el) => el.textContent);
  assert.deepEqual(headings, ["Fortnight", "Hall of Fame"],
    "backlog quests sit under their timebox, shipped ones under the trophy case");

  const sections = Array.from(doc.querySelectorAll("#board .tier"));
  const inHall = sections[sections.length - 1];
  assert.deepEqual(
    Array.from(inHall.querySelectorAll(".card-title")).map((el) => el.textContent),
    ["Shipped one"]
  );
});

test("timebox headings drop the word Tier", async () => {
  const quests = [
    { id: "a", title: "A", hook: "h", tier: "weekend", tags: [], dod: "d", status: "backlog", order: 1 },
    { id: "b", title: "B", hook: "h", tier: "medium", tags: [], dod: "d", status: "backlog", order: 2 },
    { id: "c", title: "C", hook: "h", tier: "ongoing", tags: [], dod: "d", status: "backlog", order: 3 },
  ];
  const dom = await boot(quests, []);

  const headings = Array.from(dom.window.document.querySelectorAll("#board .tier-title"))
    .map((el) => el.textContent);
  assert.deepEqual(headings, ["Weekend", "Fortnight", "Ongoing"]);
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
  assert.equal(order.indexOf("questSearch"), 0, "search comes first in the Quests tab");
  assert.equal(order.indexOf("filters"), 1, "then the tag chips");
  assert.ok(order.indexOf("questsInProgress") > 0);
  assert.ok(order.indexOf("board") > order.indexOf("questsInProgress"));
});

test("tasks split across their three sections", async () => {
  const dom = await boot(QUESTS, SIDE_QUESTS);
  const doc = dom.window.document;

  assert.equal(doc.getElementById("progressTasks").hidden, true, "nothing in progress");
  assert.equal(doc.getElementById("backlogTasks").hidden, false);
  assert.equal(doc.getElementById("tasksHallOfFame").hidden, false);
  assert.equal(doc.getElementById("tasksHallOfFameGrid").querySelector(".card-title").textContent, "Plants");
  assert.equal(doc.getElementById("tasksEmpty").hidden, true);
});

test("with no tasks at all, the tab shows one empty state", async () => {
  const dom = await boot(QUESTS, []);
  const doc = dom.window.document;

  assert.equal(doc.getElementById("tasksEmpty").hidden, false);
  assert.equal(doc.getElementById("progressTasks").hidden, true);
  assert.equal(doc.getElementById("backlogTasks").hidden, true);
  assert.equal(doc.getElementById("tasksHallOfFame").hidden, true);
});

test("the create button follows the active tab", async () => {
  const dom = await boot(QUESTS, SIDE_QUESTS);
  const doc = dom.window.document;

  assert.equal(doc.getElementById("addQuestBtn").hidden, false, "home offers + Quest");
  assert.equal(doc.getElementById("addTaskBtn").hidden, true);

  doc.querySelector('.tab[data-tab="tasks"]')
    .dispatchEvent(new dom.window.Event("click", { bubbles: true }));

  assert.equal(doc.getElementById("addQuestBtn").hidden, true);
  assert.equal(doc.getElementById("addTaskBtn").hidden, false);
});

test("Ctrl+N switches to the tab that will show the new item", async () => {
  const dom = await boot(QUESTS, SIDE_QUESTS);
  const doc = dom.window.document;

  doc.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "n", ctrlKey: true, bubbles: true }));
  assert.equal(doc.getElementById("questsScreen").hidden, false);
  assert.equal(doc.getElementById("questModalOverlay").hidden, false);

  doc.getElementById("questCancelBtn").dispatchEvent(new dom.window.Event("click", { bubbles: true }));

  doc.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "N", ctrlKey: true, shiftKey: true, bubbles: true }));
  assert.equal(doc.getElementById("tasksScreen").hidden, false);
  assert.equal(doc.getElementById("taskModalOverlay").hidden, false);
});


test("the home screen calls out the longest-waiting quest", async () => {
  const old = new Date(Date.now() - 94 * DAY).toISOString();
  const quests = [
    { id: "a", title: "Presskit", hook: "h", tier: "weekend", tags: [], dod: "d", status: "backlog", order: 1, createdAt: old },
    { id: "b", title: "Fresh", hook: "h", tier: "weekend", tags: [], dod: "d", status: "backlog", order: 2, createdAt: new Date().toISOString() },
  ];
  const dom = await boot(quests, []);
  const note = dom.window.document.getElementById("staleNote");

  assert.equal(note.hidden, false);
  assert.match(note.textContent, /Presskit/);
  assert.match(note.textContent, /94 days/);
});

test("nothing stale means no line at all", async () => {
  const quests = [
    { id: "a", title: "Fresh", hook: "h", tier: "weekend", tags: [], dod: "d", status: "backlog", order: 1, createdAt: new Date().toISOString() },
  ];
  const dom = await boot(quests, []);

  assert.equal(dom.window.document.getElementById("staleNote").hidden, true);
});

test("the Let go count appears only once something has been let go", async () => {
  const plain = await boot(QUESTS, SIDE_QUESTS);
  assert.ok(!plain.window.document.getElementById("questStats").textContent.includes("Let go"));

  const withAshes = await boot(
    QUESTS.concat([{ id: "q4", title: "Gone", hook: "h", tier: "weekend", tags: [], dod: "d", status: "let_go", order: 4, finishedAt: new Date().toISOString() }]),
    SIDE_QUESTS
  );
  assert.match(withAshes.window.document.getElementById("questStats").textContent, /Let go1/);
});
