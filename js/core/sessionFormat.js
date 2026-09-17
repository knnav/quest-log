// Duration formatting for focus sessions.
//
// Split out from features/session.js because the mini timer window needs the
// formatting without the Focus tab's DOM wiring, and both countdowns must
// render identically.

// Milliseconds to "MM:SS", rounded up so a timer never shows 00:00 while it
// still has time left on it.
export function formatRemaining(ms) {
  var total = Math.max(0, Math.ceil((ms || 0) / 1000));
  var minutes = Math.floor(total / 60);
  var seconds = total % 60;
  return String(minutes).padStart(2, "0") + ":" + String(seconds).padStart(2, "0");
}

// Milliseconds to "45m" / "2h 10m", for totals rather than countdowns.
export function formatWorked(ms) {
  var minutes = Math.round((ms || 0) / 60000);
  if (minutes < 60) return minutes + "m";
  var hours = Math.floor(minutes / 60);
  return hours + "h " + (minutes % 60) + "m";
}
