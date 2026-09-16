// Shared by the mini window and the main window's session bar so the two
// countdowns are formatted by the same code, not two near-identical copies.
export function formatRemaining(ms) {
  var total = Math.max(0, Math.ceil((ms || 0) / 1000));
  var minutes = Math.floor(total / 60);
  var seconds = total % 60;
  return String(minutes).padStart(2, "0") + ":" + String(seconds).padStart(2, "0");
}

export function formatWorked(ms) {
  var minutes = Math.round((ms || 0) / 60000);
  if (minutes < 60) return minutes + "m";
  var hours = Math.floor(minutes / 60);
  return hours + "h " + (minutes % 60) + "m";
}
