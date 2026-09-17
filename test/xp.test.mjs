import { test } from "node:test";
import assert from "node:assert/strict";
import {
  xpForLevel, xpStep, questXp, taskXp, totalXp, levelFor, growthFor,
  MAX_LEVEL, DOUBLE_EVERY, GROWTH_MAX
} from "../js/core/xp.js";
import { TASK_WORTH, LET_GO_WORTH, TIER_WORTH } from "../js/core/domain.js";

const STAMP = "2026-09-16T12:00:00.000Z";

test("level 1 is the floor and every level costs more than the last", () => {
  assert.equal(xpForLevel(1), 0);
  assert.equal(xpForLevel(0), 0);
  assert.equal(xpForLevel(2), 10);

  for (let n = 2; n < MAX_LEVEL; n++) {
    assert.ok(xpStep(n) > xpStep(n - 1), `level ${n} should cost more than the one before`);
    assert.equal(xpForLevel(n + 1) - xpForLevel(n), xpStep(n), "the table is the sum of the steps");
  }
});

test("the cost doubles every DOUBLE_EVERY levels, so the top is a grind", () => {
  for (const n of [1, 8, 15, 30, 60]) {
    const ratio = xpStep(n + DOUBLE_EVERY) / xpStep(n);
    assert.ok(Math.abs(ratio - 2) < 0.05, `step ${n}→${n + DOUBLE_EVERY} doubles (got ${ratio})`);
  }
  assert.ok(xpForLevel(MAX_LEVEL) > 1e6, "99 is aspirational");
});

test("the level is capped, and at the cap there is no next", () => {
  assert.equal(xpForLevel(MAX_LEVEL + 5), xpForLevel(MAX_LEVEL));
  const capped = levelFor(xpForLevel(MAX_LEVEL) * 10);
  assert.equal(capped.level, MAX_LEVEL);
  assert.equal(capped.toNext, 0);
  assert.equal(capped.span, 0);
  assert.equal(capped.progress, 1);
});

test("a quest earns by the outcome it finished as, scaled by tier", () => {
  assert.equal(questXp({ tier: "easy", status: "shipped", finishedAs: "shipped", finishedAt: STAMP }), TIER_WORTH.easy);
  assert.equal(questXp({ tier: "hard", status: "shipped", finishedAs: "shipped", finishedAt: STAMP }), TIER_WORTH.hard);
  assert.equal(questXp({ tier: "hard", status: "let_go", finishedAs: "let_go", finishedAt: STAMP }), LET_GO_WORTH,
    "letting go pays the same whatever the tier");
  assert.equal(questXp({ tier: "easy", status: "in_progress" }), 0);
  assert.equal(questXp({ tier: "easy", status: "backlog" }), 0);
});

test("XP is history: a reopened quest keeps what it earned", () => {
  const reopened = { tier: "medium", status: "backlog", finishedAs: "shipped", finishedAt: STAMP };
  assert.equal(questXp(reopened), TIER_WORTH.medium);
});

test("a quest from before finishedAs existed still counts by its status", () => {
  assert.equal(questXp({ tier: "easy", status: "shipped" }), TIER_WORTH.easy);
  assert.equal(questXp({ tier: "easy", status: "let_go" }), LET_GO_WORTH);
});

test("a task banks once, even if it bounces in and out of done", () => {
  assert.equal(taskXp({ status: "done", finishedAt: STAMP }), TASK_WORTH);
  assert.equal(taskXp({ status: "backlog", finishedAt: STAMP }), TASK_WORTH, "undone but still earned");
  assert.equal(taskXp({ status: "done" }), TASK_WORTH, "legacy done task without the stamp");
  assert.equal(taskXp({ status: "backlog" }), 0);
});

test("totalXp sums both lists and tolerates missing ones", () => {
  const quests = [
    { tier: "easy", finishedAs: "shipped", finishedAt: STAMP },
    { tier: "hard", finishedAs: "shipped", finishedAt: STAMP },
    null,
  ];
  const tasks = [{ status: "done", finishedAt: STAMP }, undefined];
  assert.equal(totalXp(quests, tasks), TIER_WORTH.easy + TIER_WORTH.hard + TASK_WORTH);
  assert.equal(totalXp(), 0);
});

test("levelFor places a total and measures the distance to the next level", () => {
  assert.deepEqual(levelFor(0), { level: 1, xp: 0, into: 0, span: 10, toNext: 10, progress: 0 });

  const exact = levelFor(xpForLevel(3));
  assert.equal(exact.level, 3);
  assert.equal(exact.into, 0);
  assert.equal(exact.progress, 0);

  const nearly = levelFor(xpForLevel(4) - 1);
  assert.equal(nearly.level, 3);
  assert.equal(nearly.toNext, 1);
  assert.ok(nearly.progress > 0.9 && nearly.progress < 1);

  assert.equal(levelFor(-5).level, 1, "never below the floor");
  assert.equal(levelFor(2.9).xp, 2, "fractions are floored, never rounded up");
});

test("the fire grows with level, fastest early, and never past GROWTH_MAX", () => {
  assert.equal(growthFor(1), 1);
  assert.equal(growthFor(undefined), 1);
  assert.ok(growthFor(4) > 1.1, "a few levels in already shows");

  let prev = growthFor(1);
  let prevGain = Infinity;
  for (let n = 2; n <= MAX_LEVEL; n++) {
    const g = growthFor(n);
    assert.ok(g > prev, `level ${n} is bigger than ${n - 1}`);
    assert.ok(g - prev <= prevGain + 1e-12, `each level adds less than the last (${n})`);
    prevGain = g - prev;
    prev = g;
  }
  assert.ok(growthFor(MAX_LEVEL) <= 1 + GROWTH_MAX);
  assert.ok(growthFor(MAX_LEVEL) > 1 + GROWTH_MAX - 0.01, "the cap is all but reached at 99");
});
