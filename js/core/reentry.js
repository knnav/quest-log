// Coming back after a while away: the pure half of ui/reentry.js.
//
// "Away" is about looking, not finishing — a log opened every day with
// nothing finished in it is a cold fire, not an absence, and must not get a
// welcome back. main.js stamps ui.lastSeenAt whenever the window is used and
// hands the renderer the stamp from *before* this launch; these decide what
// to make of it. No DOM, injectable `now`.

import { MS_PER_DAY, msOf } from "./dates.js";
import { AWAY_DAYS } from "./domain.js";

// A first run has no stamp, and a first run is not a return.
export function isAway(lastSeenAt, now) {
  var seenMs = msOf(lastSeenAt);
  if (seenMs === null) return false;
  var nowMs = now instanceof Date ? now.getTime() : Date.now();
  return nowMs - seenMs >= AWAY_DAYS * MS_PER_DAY;
}

// What was left in flight, in board order — not by age, because the card
// asks the same question of each of them and must not rank the answers.
export function stillInFlight(quests) {
  return (quests || [])
    .filter(function (q) { return q && q.status === "in_progress"; })
    .sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
}
