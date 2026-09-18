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

// "today" / "yesterday" / "5 days ago" / "2 months ago", for the date lines
// on cards and rows. Counts calendar days, not 24-hour spans: something
// shipped at five yesterday afternoon is "yesterday" at nine this morning,
// whatever daysSince would say. An unparseable stamp reads as "at some
// point" rather than nothing, so the line still says the thing happened.
export function relativeDay(iso, now) {
  var ms = msOf(iso);
  if (ms === null) return "at some point";
  var nowMs = now instanceof Date ? now.getTime() : Date.now();
  // Rounded, because a day across a DST change is 23 or 25 hours long.
  var days = Math.max(0, Math.round((startOfDay(nowMs) - startOfDay(ms)) / MS_PER_DAY));
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return days + " days ago";
  var months = Math.round(days / 30);
  return months === 1 ? "a month ago" : months + " months ago";
}

// Local midnight at the start of the day `ms` falls in.
export function startOfDay(ms) {
  var d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// Local midnight one calendar day earlier. Stepped through Date rather than
// subtracting MS_PER_DAY, so a DST change doesn't land it at 23:00 or 01:00.
export function dayBefore(dayStartMs) {
  var d = new Date(dayStartMs);
  d.setDate(d.getDate() - 1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// "14:02" — wall-clock time of day, zero-padded.
export function clockOf(ms) {
  var d = new Date(ms);
  return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
}
