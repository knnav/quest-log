import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fuelFor, stageFor, completionEntries, lastCompletedAt, elapsedLabel,
  DECAY_DAYS, STAGE_LABELS, STAGE_THRESHOLDS
} from "../js/core/fire.js";
import { TASK_WORTH, LET_GO_WORTH, TIER_WORTH, questWorth } from "../js/core/domain.js";

const QUEST_WEIGHT = TIER_WORTH.easy;
const TASK_WEIGHT = TASK_WORTH;

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

test("a quest is worth more fuel than a task, and a harder one more than an easy one", () => {
  assert.ok(TIER_WORTH.easy > TASK_WORTH);
  assert.ok(TIER_WORTH.medium > TIER_WORTH.easy);
  assert.ok(TIER_WORTH.hard > TIER_WORTH.medium);
  assert.ok(LET_GO_WORTH < TIER_WORTH.easy, "letting go pays less than shipping");
});

test("a hard quest shipped today is a roaring fire on its own; an easy one is not", () => {
  assert.equal(stageFor(fuelFor([{ completedAt: ago(0), weight: TIER_WORTH.hard }], NOW)), 4);
  assert.ok(stageFor(fuelFor([{ completedAt: ago(0), weight: TIER_WORTH.easy }], NOW)) < 4);
});

test("questWorth falls back to the easy tier for a key it does not know", () => {
  assert.equal(questWorth("hard"), TIER_WORTH.hard);
  assert.equal(questWorth("weekend"), TIER_WORTH.easy);
  assert.equal(questWorth(undefined), TIER_WORTH.easy);
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

test("completionEntries uses each type's own done status and the quest's tier", () => {
  const quests = [
    { status: "shipped", tier: "easy", completedAt: ago(0) },
    { status: "shipped", tier: "hard", completedAt: ago(0) },
    { status: "let_go", tier: "hard", completedAt: ago(0) },   // let-go ignores tier
    { status: "in_progress", tier: "easy", completedAt: ago(0) },
    { status: "done", tier: "easy", completedAt: ago(0) },     // not a quest status
    { status: "shipped", tier: "easy", completedAt: null },     // legacy, undated
  ];
  const tasks = [
    { status: "done", completedAt: ago(0) },
    { status: "shipped", completedAt: ago(0) },   // not a task status
    { status: "backlog", completedAt: ago(0) },
  ];

  const entries = completionEntries(quests, tasks);

  assert.deepEqual(entries.map((e) => e.weight),
    [TIER_WORTH.easy, TIER_WORTH.hard, LET_GO_WORTH, TASK_WORTH]);
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

  assert.deepEqual(entries.map((e) => e.weight), [QUEST_WEIGHT, LET_GO_WORTH]);
  assert.ok(LET_GO_WORTH < QUEST_WEIGHT, "closing a loop is worth less than finishing one");
  assert.ok(LET_GO_WORTH > 0, "but it is worth something");
});
