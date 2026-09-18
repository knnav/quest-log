import { test } from "node:test";
import assert from "node:assert/strict";
import { wipItems, PANEL_ROWS } from "../js/core/wip.js";

const quest = (title, status, order) => ({ id: title, title, status, order });
const task = (title, status, order) => ({ id: title, title, status, order });

test("only what is in progress is in flight", () => {
  const quests = [
    quest("Doing", "in_progress", 1),
    quest("Waiting", "backlog", 2),
    quest("Shipped", "shipped", 3),
    quest("Gone", "let_go", 4),
  ];
  const tasks = [task("Plants", "in_progress", 1), task("Bank", "done", 2)];

  assert.deepEqual(wipItems(quests, tasks), {
    rows: [
      { kind: "quest", title: "Doing" },
      { kind: "task", title: "Plants" },
    ],
    nextUp: [],
    hidden: 0,
  });
});

test("quests come before tasks, each in the board's own order", () => {
  const quests = [quest("Second", "in_progress", 2), quest("First", "in_progress", 1)];
  const tasks = [task("Later", "in_progress", 9), task("Sooner", "in_progress", 3)];

  assert.deepEqual(wipItems(quests, tasks).rows.map((r) => r.title),
    ["First", "Second", "Sooner", "Later"]);
});

test("an empty board is empty rather than null", () => {
  assert.deepEqual(wipItems([], []), { rows: [], nextUp: [], hidden: 0 });
  assert.deepEqual(wipItems(null, undefined), { rows: [], nextUp: [], hidden: 0 });
});

test("untitled and missing items are dropped, not drawn blank", () => {
  const quests = [quest("Real", "in_progress", 1), { id: "x", title: "", status: "in_progress" }, null];
  assert.deepEqual(wipItems(quests, []).rows, [{ kind: "quest", title: "Real" }]);
});

test("overflow past the row cap is counted, not dropped silently", () => {
  const quests = [1, 2, 3, 4, 5].map((n) => quest("Q" + n, "in_progress", n));
  const tasks = [1, 2, 3, 4].map((n) => task("T" + n, "in_progress", n));

  const { rows, hidden } = wipItems(quests, tasks, 6);
  assert.equal(rows.length, 6);
  assert.deepEqual(rows.map((r) => r.title), ["Q1", "Q2", "Q3", "Q4", "Q5", "T1"]);
  assert.equal(hidden, 3, "three tasks did not fit");
});

test("the cap defaults to the panel's row count", () => {
  const quests = Array.from({ length: PANEL_ROWS + 2 }, (v, i) => quest("Q" + i, "in_progress", i));
  const { rows, hidden } = wipItems(quests, []);
  assert.equal(rows.length, PANEL_ROWS);
  assert.equal(hidden, 2);
});

test("a nonsense cap falls back rather than emptying the panel", () => {
  const quests = [quest("Doing", "in_progress", 1)];
  assert.deepEqual(wipItems(quests, [], 0).rows, [{ kind: "quest", title: "Doing" }]);
});

// ---- next up ----

const starred = (item) => Object.assign(item, { important: true });

test("starred backlog cards are next up, quests then tasks in board order", () => {
  const quests = [
    starred(quest("Second", "backlog", 5)),
    quest("Plain", "backlog", 1),
    starred(quest("First", "backlog", 2)),
  ];
  const tasks = [starred(task("Bank", "backlog", 3)), task("Plants", "backlog", 1)];

  assert.deepEqual(wipItems(quests, tasks), {
    rows: [],
    nextUp: [
      { kind: "quest", title: "First" },
      { kind: "quest", title: "Second" },
      { kind: "task", title: "Bank" },
    ],
    hidden: 0,
  });
});

test("a starred card in progress is in flight, not next up — no card appears twice", () => {
  const quests = [starred(quest("Doing", "in_progress", 1)), starred(quest("Done", "shipped", 2))];
  const { rows, nextUp } = wipItems(quests, []);
  assert.deepEqual(rows.map((r) => r.title), ["Doing"]);
  assert.deepEqual(nextUp, []);
});

test("the cap is shared: in-flight rows take the space first and the overflow counts both", () => {
  const quests = [1, 2, 3, 4, 5].map((n) => quest("Q" + n, "in_progress", n));
  const tasks = [1, 2, 3].map((n) => starred(task("N" + n, "backlog", n)));

  const { rows, nextUp, hidden } = wipItems(quests, tasks, 6);
  assert.equal(rows.length, 5);
  assert.deepEqual(nextUp.map((r) => r.title), ["N1"]);
  assert.equal(hidden, 2, "two next-up tasks did not fit");
});

test("a full in-flight list leaves next up empty but still counted", () => {
  const quests = [1, 2, 3, 4, 5, 6, 7].map((n) => quest("Q" + n, "in_progress", n));
  const tasks = [starred(task("N1", "backlog", 1))];

  const { rows, nextUp, hidden } = wipItems(quests, tasks, 6);
  assert.equal(rows.length, 6);
  assert.deepEqual(nextUp, []);
  assert.equal(hidden, 2);
});
