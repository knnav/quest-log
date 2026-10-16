// The In Flight list: what mini mode shows under the fire.
//
// It answers "what was I doing?" when a context switch lands or you come back
// to the desk, so it arrives with the fire — same window, same drag, same
// double-click back to the board, same right-click menu (hearth.js binds all
// of those on the whole face, this included).
//
// A pure view. app.js derives the rows with core/wip.js from the unfiltered
// lists and hands them here on every data change; this draws them. Rows are
// kinds and titles only — what is in flight, then what is marked next up —
// and nothing in a row is clickable: a list you can act on is a list you end
// up fiddling with instead of working.
//
// Whether it is on screen is not decided here. main.js widens the window when
// the switch is on and the CSS shows the list whenever the mini window is that
// wide. How *tall* the window is does come from here: the list is measured and
// the height reported, so the window fits the rows rather than a fixed box.

import { escapeHtml } from "../core/html.js";

var KIND_LABEL = { quest: "Quest", task: "Task" };

var panelEl, listEl, emptyEl, nextUpEl, nextUpListEl;

export function initInFlight() {
  // #inflight, not #panel: an element id is also a global on window, and
  // #panel would stand in for a missing window.panel bridge.
  panelEl = document.getElementById("inflight");
  if (!panelEl) return;

  listEl = document.getElementById("panelList");
  emptyEl = document.getElementById("panelEmpty");
  nextUpEl = document.getElementById("panelNextUp");
  nextUpListEl = document.getElementById("panelNextUpList");

  // The list only has a height once it is on screen, which is after main.js
  // has widened the window for it — so a resize is the moment to measure.
  window.addEventListener("resize", reportHeight);

  renderInFlight(null);
}

function rowHtml(row) {
  return '<div class="panel-row">' +
    '<span class="panel-kind ' + (row.kind === "task" ? "task" : "quest") + '">' +
    escapeHtml(KIND_LABEL[row.kind] || row.kind) + '</span>' +
    '<span class="panel-row-title">' + escapeHtml(row.title) + '</span>' +
    '</div>';
}

// data: { rows: [{ kind, title }], nextUp: [same], hidden } — as built by
// core/wip.js. Anything else draws the empty state rather than an empty box
// with no explanation.
export function renderInFlight(data) {
  if (!panelEl) return;

  var rows = (data && data.rows) || [];
  var nextUp = (data && data.nextUp) || [];
  var hidden = (data && data.hidden) || 0;

  listEl.innerHTML = rows.map(rowHtml).join("");
  nextUpListEl.innerHTML = nextUp.map(rowHtml).join("");

  // Counted rather than dropped: the window's height is capped, but "+2 more"
  // is still a true picture of the load. It goes under whichever list is last,
  // since the overflow is shared between them.
  if (hidden > 0) {
    var last = nextUp.length ? nextUpListEl : listEl;
    last.innerHTML += '<div class="panel-more">+' + hidden + ' more</div>';
  }

  nextUpEl.hidden = nextUp.length === 0;
  emptyEl.hidden = rows.length + nextUp.length > 0;
  reportHeight();
}

// Hidden (on the board, in peace, or switched off) it measures 0, and main.js
// ignores that — it keeps the last real height for the next collapse. Same
// under jsdom, which has no layout. Exported for the mode switch: arriving in
// mini mode is when the list first becomes measurable, and that does not
// always come with a resize of its own.
export function reportHeight() {
  if (!panelEl || !window.panel || !window.panel.reportHeight) return;
  var h = panelEl.offsetHeight;
  if (h > 0) window.panel.reportHeight(h);
}
