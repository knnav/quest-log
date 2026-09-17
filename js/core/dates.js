// Timestamp helpers.
//
// Every date in the store is an ISO string, written by a machine whose clock
// can be wrong or reset. Each of these can therefore be handed something
// unparseable, and all of them answer with null rather than NaN: a null is
// easy to test for and skip, a NaN spreads silently through any sum it enters.

export var MS_PER_DAY = 86400000;

export function msOf(iso) {
  if (!iso) return null;
  var ms = new Date(iso).getTime();
  return isFinite(ms) ? ms : null;
}

// Null unless both ends parse AND time moved forward. A backwards span means
// the clock changed between the two stamps, so it is rejected rather than
// returned as a negative duration.
export function spanMs(fromIso, toIso) {
  var from = msOf(fromIso);
  var to = msOf(toIso);
  if (from === null || to === null || to < from) return null;
  return to - from;
}

// Floored at zero, so a stamp from the future reads as 0 days rather than
// going negative. `now` is injectable for tests.
export function daysSince(iso, now) {
  var ms = msOf(iso);
  if (ms === null) return null;
  var nowMs = now instanceof Date ? now.getTime() : Date.now();
  return Math.max(0, Math.floor((nowMs - ms) / MS_PER_DAY));
}
