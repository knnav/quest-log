import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fuelFor, stageFor, completionEntries, lastCompletedAt, elapsedLabel,
  DECAY_DAYS, QUEST_WEIGHT, SIDE_QUEST_WEIGHT, STAGE_LABELS, STAGE_THRESHOLDS
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
    { completedAt: ago(0), weight: SIDE_QUEST_WEIGHT },
  ];
  assert.equal(fuelFor(entries, NOW), QUEST_WEIGHT + SIDE_QUEST_WEIGHT);
});

test("a quest is worth more fuel than a side quest", () => {
  assert.ok(QUEST_WEIGHT > SIDE_QUEST_WEIGHT);
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
  const sideQuests = [
    { status: "done", completedAt: ago(0) },
    { status: "shipped", completedAt: ago(0) },   // not a side quest status
    { status: "backlog", completedAt: ago(0) },
  ];

  const entries = completionEntries(quests, sideQuests);

  assert.deepEqual(entries.map((e) => e.weight), [QUEST_WEIGHT, SIDE_QUEST_WEIGHT]);
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
