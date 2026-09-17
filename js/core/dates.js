export var MS_PER_DAY = 86400000;

// Every timestamp in the store is an ISO string written by a machine that may
// have had its clock changed, so parsing one is allowed to fail. These return
// null rather than NaN: a missing number is easy to skip, a NaN quietly
// poisons whatever it's added to.
export function msOf(iso) {
  if (!iso) return null;
  var ms = new Date(iso).getTime();
  return isFinite(ms) ? ms : null;
}

// How long something took. Null unless both ends parse and time moved forward —
// a negative span means the clock moved, not that work was undone.
export function spanMs(fromIso, toIso) {
  var from = msOf(fromIso);
  var to = msOf(toIso);
  if (from === null || to === null || to < from) return null;
  return to - from;
}

// Whole days elapsed since a timestamp, floored at zero so a stamp from the
// future reads as "today" rather than a negative age.
export function daysSince(iso, now) {
  var ms = msOf(iso);
  if (ms === null) return null;
  var nowMs = now instanceof Date ? now.getTime() : Date.now();
  return Math.max(0, Math.floor((nowMs - ms) / MS_PER_DAY));
}
