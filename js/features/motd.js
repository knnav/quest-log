// The message shown in the home screen footer.
//
// Lines come from assets/motd.json via the main process, grouped into pools
// keyed by situation ("idle", "roaring", ...) which features/home.js picks from
// based on the current state of the board.

var pools = null;

// Resolves once the pools are loaded. Callers should render the home screen
// after it settles, or the first paint has no line to show. Never rejects — a
// missing or broken file leaves pickMotd returning "" and the footer empty.
export function initMotd() {
  if (!window.motd) return Promise.resolve();

  return window.motd.list().then(function (data) {
    // Accept both shapes: the file was once a flat array of lines, and is now
    // an object of pools. A hand-edited array still works.
    pools = Array.isArray(data) ? { default: data } : (data || {});
  }).catch(function () {});
}

// A random line from the situation's pool, falling back to the default pool
// and then to "". Called on every home render, so the line changes as you look
// at it — that is intended.
export function pickMotd(situation) {
  if (!pools) return "";

  var lines = pools[situation];
  if (!Array.isArray(lines) || !lines.length) lines = pools.default;
  if (!Array.isArray(lines) || !lines.length) return "";

  return lines[Math.floor(Math.random() * lines.length)];
}
