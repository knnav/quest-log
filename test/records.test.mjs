import { test } from "node:test";
import assert from "node:assert/strict";
import { scopeRecord, oldestWaiting } from "../js/core/records.js";

const NOW = new Date("2026-09-16T12:00:00.000Z");
const HOURS = 3600000;
const DAYS = 24 * HOURS;

function ago(ms) {
  return new Date(NOW.getTime() - ms).toISOString();
}

test("scopeRecord averages start-to-finish for shipped quests of one scope", () => {
  const day = DAYS;
  const quests = [
    { tier: "weekend", status: "shipped", startedAt: ago(10 * day), finishedAt: ago(4 * day) },
    { tier: "weekend", status: "shipped", startedAt: ago(8 * day), finishedAt: ago(4 * day) },
    { tier: "medium", status: "shipped", startedAt: ago(30 * day), finishedAt: ago(10 * day) },
    { tier: "weekend", status: "backlog", startedAt: ago(9 * day), finishedAt: null },
    { tier: "weekend", status: "shipped", startedAt: null, finishedAt: ago(1 * day) },
  ];

  assert.deepEqual(scopeRecord(quests, "weekend"), { shipped: 2, days: 5, workedMs: 0 });
  assert.deepEqual(scopeRecord(quests, "medium"), { shipped: 1, days: 20, workedMs: 0 });
  assert.equal(scopeRecord(quests, "ongoing"), null, "no data means no claim");
});

test("scopeRecord adds up real worked time from sessions", () => {
  const quests = [
    { id: "a", tier: "weekend", status: "shipped", startedAt: ago(6 * DAYS), finishedAt: ago(1 * DAYS) },
    { id: "b", tier: "medium", status: "shipped", startedAt: ago(6 * DAYS), finishedAt: ago(1 * DAYS) },
  ];
  const sessions = [
    { questId: "a", startedAt: ago(5 * DAYS), endedAt: ago(5 * DAYS - 25 * 60000) },
    { questId: "a", startedAt: ago(4 * DAYS), endedAt: ago(4 * DAYS - 50 * 60000) },
    { questId: "b", startedAt: ago(3 * DAYS), endedAt: ago(3 * DAYS - 10 * 60000) },
    { questId: "a", startedAt: ago(2 * DAYS), endedAt: null },
    { questId: "ghost", startedAt: ago(2 * DAYS), endedAt: ago(2 * DAYS - 99 * 60000) },
  ];

  const weekend = scopeRecord(quests, "weekend", sessions);
  assert.equal(weekend.workedMs, 75 * 60000, "only that scope's finished sessions count");

  assert.equal(scopeRecord(quests, "medium", sessions).workedMs, 10 * 60000);
});

test("elapsed days and worked time are different numbers on purpose", () => {
  const quests = [
    { id: "a", tier: "weekend", status: "shipped", startedAt: ago(6 * DAYS), finishedAt: ago(0) },
  ];
  const sessions = [{ questId: "a", startedAt: ago(3 * DAYS), endedAt: ago(3 * DAYS - 90 * 60000) }];

  const record = scopeRecord(quests, "weekend", sessions);
  assert.equal(record.days, 6, "six calendar days");
  assert.equal(record.workedMs, 90 * 60000, "but an hour and a half of actual work");
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
