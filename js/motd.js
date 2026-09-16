var pools = null;

// Resolves once the pool is in hand, so the home screen can re-render with a
// real line instead of showing an empty footer until the next tick.
export function initMotd() {
  if (!window.motd) return Promise.resolve();

  return window.motd.list().then(function (data) {
    // The old shape was a flat array of lines; the new one is pools keyed by
    // situation. Accept either so a hand-edited file can't blank the footer.
    pools = Array.isArray(data) ? { default: data } : (data || {});
  }).catch(function () {});
}

// Falls back through: the situation's own pool, then the general one.
export function pickMotd(situation) {
  if (!pools) return "";

  var lines = pools[situation];
  if (!Array.isArray(lines) || !lines.length) lines = pools.default;
  if (!Array.isArray(lines) || !lines.length) return "";

  return lines[Math.floor(Math.random() * lines.length)];
}
