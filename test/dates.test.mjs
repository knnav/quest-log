import { test } from "node:test";
import assert from "node:assert/strict";
import { msOf, spanMs, daysSince, MS_PER_DAY } from "../js/core/dates.js";

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
