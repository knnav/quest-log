import { test } from "node:test";
import assert from "node:assert/strict";
import { isAway, stillInFlight } from "../js/core/reentry.js";
import { AWAY_DAYS } from "../js/core/domain.js";
import { DECAY_DAYS, fireOut } from "../js/core/fire.js";

const DAY = 86400000;
const NOW = new Date("2026-09-18T09:00:00Z");
const ago = (days) => new Date(NOW.getTime() - days * DAY).toISOString();

test("away is measured from the last look, at AWAY_DAYS", () => {
  assert.equal(isAway(ago(AWAY_DAYS + 1), NOW), true);
  assert.equal(isAway(ago(AWAY_DAYS), NOW), true, "the threshold itself counts");
  assert.equal(isAway(ago(AWAY_DAYS - 0.5), NOW), false);
  assert.equal(isAway(ago(0), NOW), false);
});

test("no stamp is a first run, not an absence", () => {
  assert.equal(isAway(null, NOW), false);
  assert.equal(isAway(undefined, NOW), false);
  assert.equal(isAway("not a date", NOW), false);
});

test("the landing and the fire go out on the same day, so the card never lies", () => {
  assert.equal(AWAY_DAYS, DECAY_DAYS);
  const lastDrop = NOW.getTime() - AWAY_DAYS * DAY;
  assert.equal(fireOut(lastDrop, NOW), true);
});

test("fireOut is false while there is still fuel, and for no drops at all", () => {
  assert.equal(fireOut(NOW.getTime() - 2 * DAY, NOW), false);
  assert.equal(fireOut(NOW.getTime() - 3 * DAY, NOW), true);
  assert.equal(fireOut(null, NOW), false);
});

test("stillInFlight keeps in-progress quests only, in board order", () => {
  const quests = [
    { id: "a", status: "in_progress", order: 3, startedAt: ago(1) },
    { id: "b", status: "backlog", order: 1 },
    { id: "c", status: "in_progress", order: 2, startedAt: ago(30) },
    { id: "d", status: "shipped", order: 0 },
    { id: "e", status: "let_go", order: 4 },
  ];
  assert.deepEqual(stillInFlight(quests).map((q) => q.id), ["c", "a"]);
  assert.deepEqual(stillInFlight([]), []);
  assert.deepEqual(stillInFlight(undefined), []);
});
