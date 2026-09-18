import { test } from "node:test";
import assert from "node:assert/strict";
import {
  msOf, spanMs, daysSince, relativeDay, startOfDay, dayBefore, clockOf, MS_PER_DAY
} from "../js/core/dates.js";

// These replaced five hand-rolled copies of the same arithmetic, each with a
// slightly different guard. The guard is the point of the extraction.
test("msOf returns null for anything that isn't a parseable timestamp", () => {
  assert.equal(msOf(null), null);
  assert.equal(msOf(""), null);
  assert.equal(msOf(undefined), null);
  assert.equal(msOf("not a date"), null);
  assert.equal(msOf("2026-01-01T00:00:00.000Z"), Date.parse("2026-01-01T00:00:00.000Z"));
});

test("spanMs measures forwards and refuses everything else", () => {
  const start = "2026-01-01T00:00:00.000Z";
  const end = "2026-01-02T00:00:00.000Z";

  assert.equal(spanMs(start, end), MS_PER_DAY);
  assert.equal(spanMs(start, start), 0, "a zero span is real, not a failure");
  assert.equal(spanMs(end, start), null, "a backwards span means the clock moved");
  assert.equal(spanMs(start, null), null);
  assert.equal(spanMs("nonsense", end), null);
});

test("daysSince floors at zero so a future stamp reads as today", () => {
  const now = new Date("2026-01-10T12:00:00.000Z");

  assert.equal(daysSince("2026-01-10T00:00:00.000Z", now), 0);
  assert.equal(daysSince("2026-01-01T00:00:00.000Z", now), 9);
  assert.equal(daysSince("2026-02-01T00:00:00.000Z", now), 0, "a clock that ran ahead");
  assert.equal(daysSince(null, now), null);
});

test("relativeDay reads in calendar days, then months, and never as nothing", () => {
  // Local parts, so the day boundary is the local one in any zone.
  const now = new Date(2026, 2, 10, 9, 0);
  const at = (day, hour) => new Date(2026, 2, day, hour).toISOString();
  const ago = (days) => new Date(now.getTime() - days * MS_PER_DAY).toISOString();

  assert.equal(relativeDay(at(10, 8), now), "today");
  assert.equal(relativeDay(at(9, 17), now), "yesterday", "sixteen hours ago, but a different day");
  assert.equal(relativeDay(at(11, 2), now), "today", "a clock that ran ahead");
  assert.equal(relativeDay(ago(12), now), "12 days ago");
  assert.equal(relativeDay(ago(31), now), "a month ago");
  assert.equal(relativeDay(ago(95), now), "3 months ago");
  assert.equal(relativeDay(null, now), "at some point");
});

// Local-time helpers, built through local Date parts so they hold in any zone.
test("startOfDay and dayBefore step by calendar day in local time", () => {
  const noon = new Date(2026, 2, 15, 12, 30).getTime();
  const midnight = new Date(2026, 2, 15, 0, 0).getTime();

  assert.equal(startOfDay(noon), midnight);
  assert.equal(startOfDay(midnight), midnight, "already at midnight");
  assert.equal(dayBefore(midnight), new Date(2026, 2, 14).getTime());
  assert.equal(dayBefore(new Date(2026, 2, 1).getTime()), new Date(2026, 1, 28).getTime(), "crosses a month");
});

test("clockOf is the zero-padded wall-clock time", () => {
  assert.equal(clockOf(new Date(2026, 0, 1, 9, 5).getTime()), "09:05");
  assert.equal(clockOf(new Date(2026, 0, 1, 14, 2)), "14:02", "a Date works too");
});
