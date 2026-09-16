import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fuelFor, stageFor, completionEntries, lastCompletedAt, elapsedLabel,
  scopeRecord, oldestWaiting,
  DECAY_DAYS, QUEST_WEIGHT, TASK_WEIGHT, LET_GO_WEIGHT, STAGE_LABELS, STAGE_THRESHOLDS
} from "../js/fire.js";

const NOW = new Date("2026-09-16T12:00:00.000Z");
const HOURS = 3600000;
const DAYS = 24 * HOURS;

function ago(ms) {
  return new Date(NOW.getTime() - ms).toISOString();
}

test("a fresh completion is worth its full weight", () => {
  assert.equal(fuelFor([{ completedAt: ago(0), weight: 3 }], NOW), 3);
});

test("fuel decays linearly and is spent after DECAY_DAYS", () => {
  const halfway = fuelFor([{ completedAt: ago(1.5 * DAYS), weight: 4 }], NOW);
  assert.ok(Math.abs(halfway - 2) < 1e-9, `expected ~2, got ${halfway}`);

  assert.equal(fuelFor([{ completedAt: ago(DECAY_DAYS * DAYS), weight: 4 }], NOW), 0);
  assert.equal(fuelFor([{ completedAt: ago(10 * DAYS), weight: 4 }], NOW), 0);
});

test("undated completions contribute nothing", () => {
  const entries = [
    { completedAt: null, weight: 3 },
    { completedAt: undefined, weight: 3 },
    { completedAt: "not a date", weight: 3 },
  ];
  assert.equal(fuelFor(entries, NOW), 0);
});

test("a completion stamped in the future counts as just-now, never as extra fuel", () => {
  const future = new Date(NOW.getTime() + 5 * DAYS).toISOString();
  assert.equal(fuelFor([{ completedAt: future, weight: 3 }], NOW), 3);
});

test("fuel sums across entries", () => {
  const entries = [
    { completedAt: ago(0), weight: QUEST_WEIGHT },
    { completedAt: ago(0), weight: TASK_WEIGHT },
  ];
  assert.equal(fuelFor(entries, NOW), QUEST_WEIGHT + TASK_WEIGHT);
});

test("a quest is worth more fuel than a task", () => {
  assert.ok(QUEST_WEIGHT > TASK_WEIGHT);
});

test("stageFor walks the thresholds and never goes below embers", () => {
  assert.equal(stageFor(0), 0);
  assert.equal(stageFor(-5), 0);
  assert.equal(stageFor(0.9), 0);
  assert.equal(stageFor(STAGE_THRESHOLDS[0]), 1);
  assert.equal(stageFor(STAGE_THRESHOLDS[1]), 2);
  assert.equal(stageFor(STAGE_THRESHOLDS[2]), 3);
  assert.equal(stageFor(STAGE_THRESHOLDS[3]), 4);
  assert.equal(stageFor(999), 4, "stage is capped at the top of the scale");
});

test("every stage has a label", () => {
  assert.equal(STAGE_LABELS.length, STAGE_THRESHOLDS.length + 1);
});

test("a quiet day dims the fire but never puts it out", () => {
  // One quest shipped yesterday: still burning.
  assert.ok(stageFor(fuelFor([{ completedAt: ago(1 * DAYS), weight: QUEST_WEIGHT }], NOW)) > 0);
  // Two weeks of nothing: embers, not death.
  assert.equal(stageFor(fuelFor([{ completedAt: ago(14 * DAYS), weight: QUEST_WEIGHT }], NOW)), 0);
});

test("completionEntries uses each type's own done status", () => {
  const quests = [
    { status: "shipped", completedAt: ago(0) },
    { status: "in_progress", completedAt: ago(0) },
    { status: "done", completedAt: ago(0) },     // not a quest status
    { status: "shipped", completedAt: null },     // legacy, undated
  ];
  const tasks = [
    { status: "done", completedAt: ago(0) },
    { status: "shipped", completedAt: ago(0) },   // not a task status
    { status: "backlog", completedAt: ago(0) },
  ];

  const entries = completionEntries(quests, tasks);

  assert.deepEqual(entries.map((e) => e.weight), [QUEST_WEIGHT, TASK_WEIGHT]);
});

test("lastCompletedAt finds the most recent stamp", () => {
  const entries = [
    { completedAt: ago(5 * DAYS) },
    { completedAt: ago(2 * HOURS) },
    { completedAt: ago(3 * DAYS) },
    { completedAt: null },
  ];
  assert.equal(lastCompletedAt(entries), NOW.getTime() - 2 * HOURS);
  assert.equal(lastCompletedAt([]), null);
  assert.equal(lastCompletedAt([{ completedAt: null }]), null);
});

test("elapsedLabel reads as minutes, hours then days", () => {
  assert.equal(elapsedLabel(NOW.getTime() - 18 * 60000, NOW), "18m");
  assert.equal(elapsedLabel(NOW.getTime() - (3 * HOURS + 12 * 60000), NOW), "3h 12m");
  assert.equal(elapsedLabel(NOW.getTime() - (4 * DAYS + 2 * HOURS), NOW), "4d 2h");
  assert.equal(elapsedLabel(null, NOW), null);
});


test("a quest you let go burns as kindling, not as a shipped quest", () => {
  const quests = [
    { status: "shipped", completedAt: ago(0) },
    { status: "let_go", completedAt: ago(0) },
  ];
  const entries = completionEntries(quests, []);

  assert.deepEqual(entries.map((e) => e.weight), [QUEST_WEIGHT, LET_GO_WEIGHT]);
  assert.ok(LET_GO_WEIGHT < QUEST_WEIGHT, "closing a loop is worth less than finishing one");
  assert.ok(LET_GO_WEIGHT > 0, "but it is worth something");
});

test("scopeRecord averages start-to-finish for shipped quests of one scope", () => {
  const day = DAYS;
  const quests = [
    { tier: "weekend", status: "shipped", startedAt: ago(10 * day), finishedAt: ago(4 * day) },
    { tier: "weekend", status: "shipped", startedAt: ago(8 * day), finishedAt: ago(4 * day) },
    { tier: "medium", status: "shipped", startedAt: ago(30 * day), finishedAt: ago(10 * day) },
    { tier: "weekend", status: "backlog", startedAt: ago(9 * day), finishedAt: null },
    { tier: "weekend", status: "shipped", startedAt: null, finishedAt: ago(1 * day) },
  ];

  assert.deepEqual(scopeRecord(quests, "weekend"), { shipped: 2, days: 5 });
  assert.deepEqual(scopeRecord(quests, "medium"), { shipped: 1, days: 20 });
  assert.equal(scopeRecord(quests, "ongoing"), null, "no data means no claim");
});

test("oldestWaiting finds the longest-untouched backlog quest", () => {
  const quests = [
    { title: "Recent", status: "backlog", createdAt: ago(3 * DAYS) },
    { title: "Ancient", status: "backlog", createdAt: ago(200 * DAYS) },
    { title: "Older but started", status: "in_progress", createdAt: ago(400 * DAYS) },
    { title: "Undated", status: "backlog", createdAt: null },
  ];

  const oldest = oldestWaiting(quests, NOW);
  assert.equal(oldest.title, "Ancient");
  assert.equal(oldest.days, 200);

  assert.equal(oldestWaiting([], NOW), null);
  assert.equal(oldestWaiting([{ title: "x", status: "shipped", createdAt: ago(9 * DAYS) }], NOW), null);
});
