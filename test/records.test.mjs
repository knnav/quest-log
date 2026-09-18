import { test } from "node:test";
import assert from "node:assert/strict";
import { scopeRecord, oldestWaiting, standup, standupSince } from "../js/core/records.js";

const NOW = new Date("2026-09-16T12:00:00.000Z");
const HOURS = 3600000;
const DAYS = 24 * HOURS;

function ago(ms) {
  return new Date(NOW.getTime() - ms).toISOString();
}

test("scopeRecord averages start-to-finish for shipped quests of one scope", () => {
  const day = DAYS;
  const quests = [
    { tier: "easy", status: "shipped", startedAt: ago(10 * day), finishedAt: ago(4 * day) },
    { tier: "easy", status: "shipped", startedAt: ago(8 * day), finishedAt: ago(4 * day) },
    { tier: "medium", status: "shipped", startedAt: ago(30 * day), finishedAt: ago(10 * day) },
    { tier: "easy", status: "backlog", startedAt: ago(9 * day), finishedAt: null },
    { tier: "easy", status: "shipped", startedAt: null, finishedAt: ago(1 * day) },
  ];

  assert.deepEqual(scopeRecord(quests, "easy"), { shipped: 2, days: 5, workedMs: 0 });
  assert.deepEqual(scopeRecord(quests, "medium"), { shipped: 1, days: 20, workedMs: 0 });
  assert.equal(scopeRecord(quests, "hard"), null, "no data means no claim");
});

test("scopeRecord adds up real worked time from sessions", () => {
  const quests = [
    { id: "a", tier: "easy", status: "shipped", startedAt: ago(6 * DAYS), finishedAt: ago(1 * DAYS) },
    { id: "b", tier: "medium", status: "shipped", startedAt: ago(6 * DAYS), finishedAt: ago(1 * DAYS) },
  ];
  const sessions = [
    { questId: "a", startedAt: ago(5 * DAYS), endedAt: ago(5 * DAYS - 25 * 60000) },
    { questId: "a", startedAt: ago(4 * DAYS), endedAt: ago(4 * DAYS - 50 * 60000) },
    { questId: "b", startedAt: ago(3 * DAYS), endedAt: ago(3 * DAYS - 10 * 60000) },
    { questId: "a", startedAt: ago(2 * DAYS), endedAt: null },
    { questId: "ghost", startedAt: ago(2 * DAYS), endedAt: ago(2 * DAYS - 99 * 60000) },
  ];

  const weekend = scopeRecord(quests, "easy", sessions);
  assert.equal(weekend.workedMs, 75 * 60000, "only that scope's finished sessions count");

  assert.equal(scopeRecord(quests, "medium", sessions).workedMs, 10 * 60000);
});

test("elapsed days and worked time are different numbers on purpose", () => {
  const quests = [
    { id: "a", tier: "easy", status: "shipped", startedAt: ago(6 * DAYS), finishedAt: ago(0) },
  ];
  const sessions = [{ questId: "a", startedAt: ago(3 * DAYS), endedAt: ago(3 * DAYS - 90 * 60000) }];

  const record = scopeRecord(quests, "easy", sessions);
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

// ---- the standup ----
//
// Built through local Date parts, so the day boundaries hold in any zone.
// September 2026: Fri 11, Sat 12, Sun 13, Mon 14, Tue 15, Wed 16.
function local(day, hour, minute) {
  return new Date(2026, 8, day, hour || 0, minute || 0);
}

function iso(day, hour, minute) {
  return local(day, hour, minute).toISOString();
}

test("standupSince reaches back to the last weekday, weekend included", () => {
  assert.equal(standupSince(local(16, 10)), local(15).getTime(), "Wednesday looks to Tuesday");
  assert.equal(standupSince(local(15, 10)), local(14).getTime(), "Tuesday looks to Monday");
  assert.equal(standupSince(local(14, 9)), local(11).getTime(), "Monday looks past the weekend to Friday");
  assert.equal(standupSince(local(13, 9)), local(11).getTime(), "so does Sunday");
  assert.equal(standupSince(local(12, 9)), local(11).getTime(), "and Saturday, to yesterday");
});

test("standup lists what is in flight, quests first, in board order", () => {
  const quests = [
    { id: "q2", title: "Second", status: "in_progress", order: 2, startedAt: iso(15, 9) },
    { id: "q1", title: "First", status: "in_progress", order: 1, startedAt: iso(10, 9) },
    { id: "q3", title: "Waiting", status: "backlog", order: 3 },
  ];
  const tasks = [
    { id: "t1", title: "Printer", status: "in_progress", order: 1, startedAt: null },
    { id: "t2", title: "Done thing", status: "done", order: 2 },
  ];

  const view = standup(quests, tasks, [], local(16, 10));
  assert.deepEqual(view.inFlight, [
    { kind: "quest", id: "q1", title: "First", startedAt: iso(10, 9) },
    { kind: "quest", id: "q2", title: "Second", startedAt: iso(15, 9) },
    { kind: "task", id: "t1", title: "Printer", startedAt: null },
  ]);
});

test("standup groups what finished by day, newest first, back to the last weekday", () => {
  // A Monday: the window is Friday through today.
  const now = local(14, 9, 30);
  const quests = [
    { id: "a", title: "Shipped Friday", status: "shipped", finishedAs: "shipped", finishedAt: iso(11, 16) },
    { id: "b", title: "Let go Saturday", status: "let_go", finishedAs: "let_go", finishedAt: iso(12, 11) },
    { id: "c", title: "Shipped Thursday", status: "shipped", finishedAs: "shipped", finishedAt: iso(10, 16) },
    { id: "d", title: "Old record, no finishedAs", status: "shipped", finishedAt: iso(11, 9) },
  ];
  const tasks = [
    { id: "t1", title: "Early", status: "done", finishedAs: "done", finishedAt: iso(14, 8, 5) },
    { id: "t2", title: "Later", status: "done", finishedAs: "done", finishedAt: iso(14, 9, 0) },
    { id: "t3", title: "Undated", status: "done", finishedAt: null },
  ];

  const view = standup(quests, tasks, [], now);
  assert.deepEqual(view.days.map((d) => d.label), ["Today", "Saturday", "Friday"],
    "Sunday had nothing and is left out; Thursday is before the window");

  assert.deepEqual(view.days[0].items.map((r) => r.title), ["Later", "Early"], "newest first within a day");
  assert.deepEqual(view.days[0].items[0], { kind: "task", id: "t2", title: "Later", outcome: "done", at: local(14, 9).getTime() });
  assert.deepEqual(view.days[1].items.map((r) => r.outcome), ["let_go"]);
  assert.deepEqual(view.days[2].items.map((r) => [r.title, r.outcome]), [
    ["Shipped Friday", "shipped"],
    ["Old record, no finishedAs", "shipped"],
  ]);
});

test("a reopened quest is in flight, not finished, even with a finishedAt in the window", () => {
  const now = local(16, 14);
  const quests = [
    { id: "a", title: "Bounced", status: "in_progress", finishedAs: "shipped", finishedAt: iso(16, 9), startedAt: iso(15, 9) },
  ];

  const view = standup(quests, [], [], now);
  assert.deepEqual(view.inFlight.map((r) => r.id), ["a"]);
  assert.deepEqual(view.days[0].items, [], "not listed twice");
});

test("today is always there, and a day earns its place with sessions alone", () => {
  const now = local(16, 14);
  const sessions = [
    { questId: null, startedAt: iso(15, 9), endedAt: iso(15, 9, 25) },
    { questId: "q", startedAt: iso(15, 10), endedAt: iso(15, 10, 50) },
    { questId: "q", startedAt: iso(9, 10), endedAt: iso(9, 10, 50) },
    { questId: "q", startedAt: iso(16, 10), endedAt: null },
  ];

  const view = standup([], [], sessions, now);
  assert.deepEqual(view.days.map((d) => [d.label, d.items.length, d.sessions, d.workedMs]), [
    ["Today", 0, 0, 0],
    ["Yesterday", 0, 2, 75 * 60000],
  ]);
  assert.equal(view.days[1].start, local(15).getTime());
});

test("an empty log is an empty standup with today in it", () => {
  const view = standup([], [], [], local(16, 14));
  assert.deepEqual(view.inFlight, []);
  assert.deepEqual(view.days.map((d) => d.label), ["Today"]);
});
