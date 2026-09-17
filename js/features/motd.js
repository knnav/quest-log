// The quote shown in the home screen footer and on the hearth face.
//
// Lines come from assets/motd.json via the main process, grouped into pools
// keyed by situation ("idle", "roaring", ...) which features/home.js picks from
// based on the current state of the board. Each line is { text, by }; `by` is
// the attribution and may be "".

import { escapeHtml } from "../core/html.js";

var pools = null;

// Resolves once the pools are loaded. Callers should render the home screen
// after it settles, or the first paint has no line to show. Never rejects — a
// missing or broken file leaves pickMotd returning null and the footer empty.
export function initMotd() {
  if (!window.motd) return Promise.resolve();

  return window.motd.list().then(function (data) {
    // Accept both shapes: the file was once a flat array of lines, and is now
    // an object of pools. A hand-edited array still works.
    var raw = Array.isArray(data) ? { default: data } : (data || {});
    pools = {};
    Object.keys(raw).forEach(function (key) {
      if (Array.isArray(raw[key])) pools[key] = raw[key].map(normalise).filter(Boolean);
    });
  }).catch(function () {});
}

// A bare string is a line with no attribution — the pools were once plain
// strings, and a hand-typed one still reads fine.
function normalise(line) {
  if (typeof line === "string") return line ? { text: line, by: "" } : null;
  if (!line || typeof line.text !== "string" || !line.text) return null;
  return { text: line.text, by: typeof line.by === "string" ? line.by : "" };
}

// A random line from the situation's pool, falling back to the default pool
// and then to null. Called on every home render, so the line changes as you
// look at it — that is intended.
export function pickMotd(situation) {
  if (!pools) return null;

  var lines = pools[situation];
  if (!Array.isArray(lines) || !lines.length) lines = pools.default;
  if (!Array.isArray(lines) || !lines.length) return null;

  return lines[Math.floor(Math.random() * lines.length)];
}

// Markup for one line: the text, then the attribution in its own span so the
// hearth can drop it to a second line while the footer keeps it inline.
export function motdHtml(line) {
  if (!line) return "";
  var html = '<span class="motd-text">' + escapeHtml(line.text) + '</span>';
  if (line.by) html += ' <span class="motd-by">— ' + escapeHtml(line.by) + '</span>';
  return html;
}
