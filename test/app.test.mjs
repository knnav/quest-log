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

// options.noPanel boots without the In Flight bridge, the way the app runs
// under a preload that predates it.
function boot(quests, tasks, options) {
  options = options || {};
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
  // What main.js sends after the hearth menu's "New quest" / "New task".
  win.windowControls = { onCreate: (cb) => { dom.create = cb; } };
  win.matchMedia = () => ({ matches: false, addEventListener() {} });

  // The panel lives in another window, so the board only ever pushes to it.
  dom.pushes = [];
  let enabled = !!options.panelEnabled;
  let enabledListener = null;
  if (!options.noPanel) {
    win.panel = {
      push: (data) => dom.pushes.push(data),
      setEnabled: (next) => { enabled = !!next; return Promise.resolve(enabled); },
      isEnabled: () => Promise.resolve(enabled),
      onEnabledChange: (cb) => { enabledListener = cb; },
    };
  }
  // What main.js broadcasts when the tray or the panel's own × flips the flag.
  dom.pushEnabled = (next) => enabledListener(next);

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
  { id: "q1", title: "Shipped one", hook: "h", tier: "easy", tags: ["a"], dod: "d", status: "shipped", order: 1, completedAt: new Date(Date.now() - 2 * 3600000).toISOString() },
  { id: "q2", title: "Doing it", hook: "h", tier: "easy", tags: [], dod: "d", status: "in_progress", order: 2, completedAt: null },
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

  // The hearth face carries its own copy of the fire; it must never disagree.
  const hearthFire = doc.querySelector("#hearthView .bonfire");
  assert.equal(hearthFire.getAttribute("data-stage"), "2");
});

test("the ledger banks the whole history and shows the distance to the next level", async () => {
  // Three easy ships (9) and one hard (25) is 34 XP: level 4 (33) with one
  // into the 13 to level 5. Old and reopened outcomes count — this is
  // history, not the fire.
  const long = new Date(Date.now() - 40 * DAY).toISOString();
  const quests = [
    { id: "a", title: "A", hook: "h", tier: "easy", tags: [], dod: "d", status: "shipped", order: 1, finishedAt: long, finishedAs: "shipped" },
    { id: "b", title: "B", hook: "h", tier: "easy", tags: [], dod: "d", status: "shipped", order: 2, finishedAt: long, finishedAs: "shipped" },
    { id: "c", title: "C", hook: "h", tier: "easy", tags: [], dod: "d", status: "backlog", order: 3, finishedAt: long, finishedAs: "shipped" },
    { id: "d", title: "D", hook: "h", tier: "hard", tags: [], dod: "d", status: "shipped", order: 4, finishedAt: long, finishedAs: "shipped" },
  ];
  const dom = await boot(quests, []);
  const doc = dom.window.document;

  assert.equal(doc.getElementById("bonfire").getAttribute("data-stage"), "0",
    "forty days on, the fire has forgotten all of it");

  const levels = Array.from(doc.querySelectorAll("[data-xp-level]")).map((el) => el.textContent);
  assert.deepEqual(levels, ["Lv 4", "Lv 4"], "home row and hearth corner agree");

  // The level sizes both fires through one variable; the stage is separate.
  const growths = Array.from(doc.querySelectorAll(".bonfire")).map((el) => el.style.getPropertyValue("--growth"));
  assert.equal(growths.length, 2);
  assert.equal(growths[0], growths[1]);
  assert.ok(Number(growths[0]) > 1.1 && Number(growths[0]) < 1.5, `level 4 growth, got ${growths[0]}`);
  assert.equal(doc.getElementById("xp").querySelector("[data-xp-count]").textContent, "1 / 13");
  assert.equal(doc.getElementById("xp").querySelector("[data-xp-fill]").style.width, "8%");
});

test("a threshold crossed between the two boot loads is not a level-up", async () => {
  // Quests alone are level 1 (9 XP); with the task, level 2. Both are
  // history, so nothing just happened.
  const long = new Date(Date.now() - 40 * DAY).toISOString();
  const quests = [1, 2, 3].map((n) => (
    { id: "q" + n, title: "Q" + n, hook: "h", tier: "easy", tags: [], dod: "d", status: "shipped", order: n, finishedAt: long, finishedAs: "shipped" }
  ));
  const tasks = [{ id: "t1", title: "Old", note: "", status: "done", order: 1, finishedAt: long }];
  const dom = await boot(quests, tasks);
  const doc = dom.window.document;

  assert.equal(doc.getElementById("xp").querySelector("[data-xp-level]").textContent, "Lv 2");
  assert.equal(doc.getElementById("levelUp").hidden, true, "no card");
});

test("crossing a level threshold rings the chime and shows the card", async () => {
  // Nine XP banked: one more is level 2.
  const long = new Date(Date.now() - 40 * DAY).toISOString();
  const quests = [1, 2, 3].map((n) => (
    { id: "q" + n, title: "Q" + n, hook: "h", tier: "easy", tags: [], dod: "d", status: "shipped", order: n, finishedAt: long, finishedAs: "shipped" }
  ));
  const tasks = [{ id: "t1", title: "Last one", note: "", status: "backlog", order: 1 }];
  const dom = await boot(quests, tasks);
  const doc = dom.window.document;

  // The chime is WebAudio; a fake context records that it was asked to play.
  let rang = 0;
  dom.window.AudioContext = function () {
    this.state = "running";
    this.currentTime = 0;
    this.destination = {};
    this.createOscillator = () => ({ frequency: {}, connect() {}, start() { rang += 1; }, stop() {} });
    this.createGain = () => ({
      gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} },
      connect() {},
    });
  };
  // The store would stamp the finish; the stub does the same so the refetch sees it.
  dom.window.questLog.updateTask = (id, data) => {
    Object.assign(tasks[0], data, { finishedAt: new Date().toISOString(), completedAt: new Date().toISOString() });
    return Promise.resolve(tasks[0]);
  };

  assert.equal(doc.getElementById("xp").querySelector("[data-xp-level]").textContent, "Lv 1");

  doc.querySelector('#backlogTasksGrid [data-status="done"]').click();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(doc.getElementById("xp").querySelector("[data-xp-level]").textContent, "Lv 2");
  assert.equal(rang, 3, "one triad");

  // And the card, over everything, saying which level.
  const card = doc.getElementById("levelUp");
  assert.equal(card.hidden, false);
  assert.ok(card.classList.contains("is-on"));
  assert.equal(doc.getElementById("levelUpLevel").textContent, "Lv 2");
});

test("the quote is painted under the stage label and into the hearth face alike", async () => {
  const dom = await boot(QUESTS, SIDE_QUESTS);
  const doc = dom.window.document;

  const board = doc.getElementById("motd");
  const hearth = doc.querySelector("#hearthView [data-motd]");
  assert.equal(board.querySelector(".motd-text").textContent, "a line");
  assert.equal(hearth.querySelector(".motd-text").textContent, "a line");
  // A plain-string line carries no attribution.
  assert.equal(hearth.querySelector(".motd-by"), null);
});

test("the window boots in board mode when there is no window bridge", async () => {
  const dom = await boot([], []);
  assert.equal(dom.window.document.body.getAttribute("data-mode"), "board");
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

  // The only backlog quest here is the Medium one; the Easy quests are
  // in progress and shipped, so they live elsewhere.
  const headings = Array.from(doc.querySelectorAll("#board .tier-title")).map((el) => el.textContent);
  assert.deepEqual(headings, ["Medium", "Hall of Fame"],
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
    { id: "a", title: "A", hook: "h", tier: "easy", tags: [], dod: "d", status: "backlog", order: 1 },
    { id: "b", title: "B", hook: "h", tier: "medium", tags: [], dod: "d", status: "backlog", order: 2 },
    { id: "c", title: "C", hook: "h", tier: "hard", tags: [], dod: "d", status: "backlog", order: 3 },
  ];
  const dom = await boot(quests, []);

  const headings = Array.from(dom.window.document.querySelectorAll("#board .tier-title"))
    .map((el) => el.textContent);
  assert.deepEqual(headings, ["Easy", "Medium", "Hard"]);
});

test("a tag filter covers the whole tab, In Progress block included", async () => {
  const quests = [
    { id: "q1", title: "Tagged doing", hook: "h", tier: "easy", tags: ["elixir"], dod: "d", status: "in_progress", order: 1 },
    { id: "q2", title: "Untagged doing", hook: "h", tier: "easy", tags: [], dod: "d", status: "in_progress", order: 2 },
    { id: "q3", title: "Tagged waiting", hook: "h", tier: "easy", tags: ["elixir"], dod: "d", status: "backlog", order: 3 },
    { id: "q4", title: "Untagged waiting", hook: "h", tier: "easy", tags: [], dod: "d", status: "backlog", order: 4 },
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

test("both create buttons are offered on every tab", async () => {
  const dom = await boot(QUESTS, SIDE_QUESTS);
  const doc = dom.window.document;

  assert.equal(doc.getElementById("addQuestBtn").hidden, false, "home offers + Quest");
  assert.equal(doc.getElementById("addTaskBtn").hidden, false, "home offers + Task");

  doc.querySelector('.tab[data-tab="tasks"]')
    .dispatchEvent(new dom.window.Event("click", { bubbles: true }));

  assert.equal(doc.getElementById("addQuestBtn").hidden, false);
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

test("the hearth menu's create opens the form on the right tab", async () => {
  const dom = await boot(QUESTS, SIDE_QUESTS);
  const doc = dom.window.document;

  dom.create("task");
  assert.equal(doc.getElementById("tasksScreen").hidden, false);
  assert.equal(doc.getElementById("taskModalOverlay").hidden, false);

  // A form already open is left alone rather than covered.
  dom.create("quest");
  assert.equal(doc.getElementById("questModalOverlay").hidden, true);
  assert.equal(doc.getElementById("tasksScreen").hidden, false);

  doc.getElementById("taskCancelBtn").dispatchEvent(new dom.window.Event("click", { bubbles: true }));
  dom.create("quest");
  assert.equal(doc.getElementById("questsScreen").hidden, false);
  assert.equal(doc.getElementById("questModalOverlay").hidden, false);
});


test("the home screen calls out the longest-waiting quest", async () => {
  const old = new Date(Date.now() - 94 * DAY).toISOString();
  const quests = [
    { id: "a", title: "Presskit", hook: "h", tier: "easy", tags: [], dod: "d", status: "backlog", order: 1, createdAt: old },
    { id: "b", title: "Fresh", hook: "h", tier: "easy", tags: [], dod: "d", status: "backlog", order: 2, createdAt: new Date().toISOString() },
  ];
  const dom = await boot(quests, []);
  const note = dom.window.document.getElementById("staleNote");

  assert.equal(note.hidden, false);
  assert.match(note.textContent, /Presskit/);
  assert.match(note.textContent, /94 days/);
});

test("nothing stale means no line at all", async () => {
  const quests = [
    { id: "a", title: "Fresh", hook: "h", tier: "easy", tags: [], dod: "d", status: "backlog", order: 1, createdAt: new Date().toISOString() },
  ];
  const dom = await boot(quests, []);

  assert.equal(dom.window.document.getElementById("staleNote").hidden, true);
});

test("the Let go count appears only once something has been let go", async () => {
  const plain = await boot(QUESTS, SIDE_QUESTS);
  assert.ok(!plain.window.document.getElementById("questStats").textContent.includes("Let go"));

  const withAshes = await boot(
    QUESTS.concat([{ id: "q4", title: "Gone", hook: "h", tier: "easy", tags: [], dod: "d", status: "let_go", order: 4, finishedAt: new Date().toISOString() }]),
    SIDE_QUESTS
  );
  assert.match(withAshes.window.document.getElementById("questStats").textContent, /Let go1/);
});


test("what is in flight is pushed to the panel window", async () => {
  const dom = await boot(QUESTS, SIDE_QUESTS);
  const last = dom.pushes[dom.pushes.length - 1];

  // q2 is the only quest in progress here, and no task is.
  assert.deepEqual(last, { rows: [{ kind: "quest", title: "Doing it" }], nextUp: [], hidden: 0 });
});

test("in-progress tasks reach the panel too, after the quests", async () => {
  const tasks = [
    { id: "s1", title: "Plants", note: "", status: "in_progress", order: 1 },
    { id: "s2", title: "Bank", note: "", status: "backlog", order: 2 },
  ];
  const dom = await boot(QUESTS, tasks);
  const last = dom.pushes[dom.pushes.length - 1];

  assert.deepEqual(last.rows, [
    { kind: "quest", title: "Doing it" },
    { kind: "task", title: "Plants" },
  ]);
});

test("filtering the Quests tab does not empty the panel", async () => {
  const dom = await boot(QUESTS, SIDE_QUESTS);
  const doc = dom.window.document;
  const before = dom.pushes[dom.pushes.length - 1];

  const search = doc.getElementById("questSearch");
  search.value = "nothing matches this";
  search.dispatchEvent(new dom.window.Event("input", { bubbles: true }));

  assert.equal(doc.getElementById("progressGrid").querySelectorAll(".quest-card").length, 0,
    "the board is filtered");
  const after = dom.pushes[dom.pushes.length - 1];
  assert.deepEqual(after, before, "what you are actually doing has not changed");
});

test("the title bar switch reflects the panel flag and flips it", async () => {
  const dom = await boot(QUESTS, SIDE_QUESTS, { panelEnabled: true });
  const doc = dom.window.document;
  const btn = doc.getElementById("panelBtn");

  assert.equal(btn.hidden, false);
  assert.equal(btn.getAttribute("aria-pressed"), "true", "it opened with the panel on");

  btn.dispatchEvent(new dom.window.Event("click", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(btn.getAttribute("aria-pressed"), "false");
  assert.ok(!btn.classList.contains("on"));

  // The tray and the panel's own × flip the same flag; the switch follows.
  dom.pushEnabled(true);
  assert.equal(btn.getAttribute("aria-pressed"), "true");
  assert.ok(btn.classList.contains("on"));
});

test("with no panel bridge the switch is hidden rather than dead", async () => {
  const dom = await boot(QUESTS, SIDE_QUESTS, { noPanel: true });
  assert.equal(dom.window.document.getElementById("panelBtn").hidden, true);
});

// ---- archive ----

// Archive hides; it never deletes. The ledger and the home columns must read
// exactly the same with the flag set as without it, or archiving would be
// the destructive cleanup it exists to replace.
test("archived quests and tasks leave the board but not the ledger or the stats", async () => {
  const flag = { archivedAt: new Date(Date.now() - DAY).toISOString() };
  const quests = [
    Object.assign({}, QUESTS[0], { finishedAt: QUESTS[0].completedAt, finishedAs: "shipped" }, flag),
    QUESTS[1],
    QUESTS[2],
  ];
  const tasks = [
    Object.assign({}, SIDE_QUESTS[0], { finishedAt: SIDE_QUESTS[0].completedAt, finishedAs: "done" }, flag),
    SIDE_QUESTS[1],
  ];

  const dom = await boot(quests, tasks);
  const doc = dom.window.document;

  // An easy ship (3) and a done task (1): the same 4 XP the flag-less fixture
  // earns in the ledger tests above.
  assert.equal(doc.getElementById("xp").querySelector("[data-xp-count]").textContent, "4 / 10");
  assert.match(doc.getElementById("questStats").textContent, /Shipped1/);
  assert.match(doc.getElementById("taskStats").textContent, /Done1/);

  // Quests: the Hall of Fame is gone, the archive has taken its place.
  const headings = Array.from(doc.querySelectorAll("#board section.tier .tier-title")).map((el) => el.textContent);
  assert.deepEqual(headings, ["Medium"]);
  const archive = doc.querySelector("#board details.archive-tier");
  assert.equal(archive.querySelector("summary").textContent, "Archive · 1");
  assert.equal(archive.querySelector(".card-title").textContent, "Shipped one");

  // Tasks: same shape, in static markup.
  assert.equal(doc.getElementById("tasksHallOfFame").hidden, true);
  assert.equal(doc.getElementById("tasksArchive").hidden, false);
  assert.equal(doc.getElementById("tasksArchiveCount").textContent, "1");
  assert.equal(doc.getElementById("tasksArchiveGrid").querySelector(".card-title").textContent, "Plants");
  assert.equal(doc.getElementById("tasksEmpty").hidden, true);

  // The In Flight panel never saw them anyway.
  assert.deepEqual(dom.pushes[dom.pushes.length - 1].rows.map((r) => r.title), ["Doing it"]);
});

test("the tasks Hall of Fame's 'Archive all' sweeps the done tasks", async () => {
  const dom = await boot(QUESTS, SIDE_QUESTS);
  const doc = dom.window.document;
  const calls = [];
  dom.window.questLog.updateTask = (id, data) => { calls.push([id, data]); return Promise.resolve({}); };
  dom.window.confirm = () => true;

  assert.equal(doc.getElementById("tasksArchive").hidden, true, "nothing archived yet");
  doc.getElementById("archiveDoneTasksBtn").dispatchEvent(new dom.window.Event("click", { bubbles: true }));

  assert.deepEqual(calls.map((c) => c[0]), ["s1"]);
  assert.ok(calls[0][1].archivedAt);
});

// ---- next up ----

test("starred backlog cards get a Next up section on both tabs and a block in the panel", async () => {
  const quests = [QUESTS[0], QUESTS[1], Object.assign({}, QUESTS[2], { important: true })];
  const tasks = [SIDE_QUESTS[0], Object.assign({}, SIDE_QUESTS[1], { important: true })];

  const dom = await boot(quests, tasks);
  const doc = dom.window.document;

  // Quests: the starred one has left Medium for Next up.
  const headings = Array.from(doc.querySelectorAll("#board section.tier .tier-title")).map((el) => el.textContent);
  assert.deepEqual(headings, ["Next up", "Hall of Fame"]);
  assert.equal(doc.querySelector("#board .next-up-tier .card-title").textContent, "Waiting");
  assert.ok(doc.querySelector("#board .next-up-tier .star-btn.on"));

  // Tasks: same shape, in static markup.
  assert.equal(doc.getElementById("nextUpTasks").hidden, false);
  assert.equal(doc.getElementById("nextUpTasksGrid").querySelector(".card-title").textContent, "Bank");
  assert.equal(doc.getElementById("backlogTasks").hidden, true, "nothing plain left in Backlog");

  // The panel gets both, quests first, under what is in flight.
  const last = dom.pushes[dom.pushes.length - 1];
  assert.deepEqual(last.rows.map((r) => r.title), ["Doing it"]);
  assert.deepEqual(last.nextUp, [{ kind: "quest", title: "Waiting" }, { kind: "task", title: "Bank" }]);
});

test("a star click on the board writes the flag and nothing else", async () => {
  const dom = await boot(QUESTS, SIDE_QUESTS);
  const doc = dom.window.document;
  const calls = [];
  dom.window.questLog.updateQuest = (id, data) => { calls.push([id, data]); return Promise.resolve({}); };

  assert.equal(doc.getElementById("nextUpTasks").hidden, true, "nothing starred yet");
  doc.querySelector('#board .quest-card[data-id="q3"] .star-btn')
    .dispatchEvent(new dom.window.Event("click", { bubbles: true }));

  assert.deepEqual(calls, [["q3", { important: true }]]);
  assert.equal(doc.getElementById("detailModalOverlay").hidden, true);
});

// ---- standup ----

test("the Standup tab lists what is in flight and what finished, by day", async () => {
  // Timestamps sit at a fixed hour of today and yesterday, so the row text
  // is deterministic; the sessions bridge is optional and stubbed here.
  const today = new Date();
  today.setHours(10, 30, 0, 0);
  const yesterday = new Date(today.getTime() - DAY);
  yesterday.setHours(16, 5, 0, 0);
  const longAgo = new Date(Date.now() - 40 * DAY).toISOString();

  const quests = [
    { id: "q1", title: "Doing it", hook: "h", tier: "easy", tags: [], dod: "d", status: "in_progress", order: 1, startedAt: yesterday.toISOString() },
    { id: "q2", title: "Fresh ship", hook: "h", tier: "easy", tags: [], dod: "d", status: "shipped", order: 2, finishedAt: today.toISOString(), finishedAs: "shipped" },
    { id: "q3", title: "Ancient ship", hook: "h", tier: "easy", tags: [], dod: "d", status: "shipped", order: 3, finishedAt: longAgo, finishedAs: "shipped" },
  ];
  const tasks = [
    { id: "t1", title: "Plants", note: "watered", status: "done", order: 1, finishedAt: yesterday.toISOString(), finishedAs: "done" },
    { id: "t2", title: "Printer", note: "", status: "in_progress", order: 2, startedAt: today.toISOString() },
  ];
  const dom = await boot(quests, tasks);
  const doc = dom.window.document;
  dom.window.questLog.listSessions = () => Promise.resolve([
    { questId: "q1", startedAt: yesterday.toISOString(), endedAt: new Date(yesterday.getTime() + 25 * 60000).toISOString() },
  ]);

  doc.querySelector('.tab[data-tab="standup"]').dispatchEvent(new dom.window.Event("click", { bubbles: true }));
  assert.equal(doc.getElementById("standupScreen").hidden, false);
  assert.equal(doc.getElementById("addQuestBtn").hidden, false, "the create buttons stay");
  assert.equal(doc.getElementById("addTaskBtn").hidden, false);

  const headings = Array.from(doc.querySelectorAll("#standup .tier-title")).map((el) => el.textContent);
  // Yesterday may be a weekend day, in which case the window reaches further
  // back; the first three headings are the fixed part.
  assert.deepEqual(headings.slice(0, 3), ["In flight", "Today", "Yesterday"]);

  const rowsOf = (n) => Array.from(doc.querySelectorAll("#standup .standup-tier")[n].querySelectorAll(".standup-row"))
    .map((row) => [row.getAttribute("data-kind"), row.querySelector(".standup-title").textContent, row.querySelector(".standup-when").textContent]);

  assert.deepEqual(rowsOf(0), [
    ["quest", "Doing it", "Started yesterday"],
    ["task", "Printer", "Started today"],
  ]);
  assert.deepEqual(rowsOf(1), [["quest", "Fresh ship", "Shipped 10:30"]]);
  assert.deepEqual(rowsOf(2), [["task", "Plants", "Done 16:05"]]);
  assert.ok(!doc.getElementById("standup").textContent.includes("Ancient ship"), "forty days ago is not standup material");

  // A row opens the same detail modal a card does.
  doc.querySelector('#standup .standup-row[data-id="t1"]').dispatchEvent(new dom.window.Event("click", { bubbles: true }));
  assert.equal(doc.getElementById("detailModalOverlay").hidden, false);
  assert.equal(doc.getElementById("detailTitle").textContent, "Plants");
  assert.equal(doc.getElementById("detailText").textContent, "watered");
});

test("an empty standup still has today in it", async () => {
  const dom = await boot([], []);
  const doc = dom.window.document;

  const headings = Array.from(doc.querySelectorAll("#standup .tier-title")).map((el) => el.textContent);
  assert.deepEqual(headings, ["In flight", "Today"]);
  assert.deepEqual(
    Array.from(doc.querySelectorAll("#standup .standup-empty")).map((el) => el.textContent),
    ["Nothing in flight.", "Nothing finished yet."]
  );
});

test("a finished session shows up in the standup's day total", async () => {
  const dom = await boot(QUESTS, SIDE_QUESTS);
  const doc = dom.window.document;
  const ended = new Date();
  dom.window.questLog.listSessions = () => Promise.resolve([
    { questId: "q2", startedAt: new Date(ended.getTime() - 50 * 60000).toISOString(), endedAt: ended.toISOString() },
  ]);

  assert.equal(doc.querySelector("#standup .standup-sessions"), null, "nothing yet");

  // The session-end path app.js runs: refresh sessions, then refetch quests,
  // which re-renders the standup with the sessions it now has. quests.js is
  // imported plainly so this is the instance the booted app.js wired up.
  const { refreshSessions, refetchQuests } = await import("../js/features/quests.js");
  await refreshSessions();
  await refetchQuests();

  assert.equal(doc.querySelector("#standup .standup-sessions").textContent, "1 session · 50m");
});
