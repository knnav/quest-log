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
  assert.deepEqual(wipItems([], []), { rows: [], hidden: 0 });
  assert.deepEqual(wipItems(null, undefined), { rows: [], hidden: 0 });
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
