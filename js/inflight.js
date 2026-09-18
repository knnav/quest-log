// The In Flight panel's window: renderer entry point for inflight.html.
//
// Its own document and its own BrowserWindow, and a companion to the hearth:
// main.js opens it when the board folds away and closes it when the board
// comes back, so the fire and the list of what is in flight arrive together.
// It is what answers "what was I doing?" when a context switch lands or you
// come back to the desk.
//
// It owns no data and derives none. The board renderer is where quests and
// tasks live, so it pushes the list (app.js → window.panel.push → main.js
// relays it here) and this is a pure view of the last push. Rows are kinds and
// titles only — what is in flight, then what is marked next up — and nothing
// in a row is clickable: a panel you can act on is a panel you end up
// fiddling with instead of working.
//
// Interactions match the hearth's, so the two floating things behave alike:
// drag to move, double-click to bring the board back, right-click for the
// menu. The × means "not right now" — it stays gone for this stint in mini
// mode and comes back with the next collapse; the menu has the permanent off.

import { initTheme } from "./ui/theme.js";
import { enableWindowDrag } from "./ui/windowDrag.js";
import { escapeHtml } from "./core/html.js";

var KIND_LABEL = { quest: "Quest", task: "Task" };

var panelEl, listEl, emptyEl, nextUpEl, nextUpListEl, closeBtn;

function initInFlight() {
  panelEl = document.getElementById("panel");
  if (!panelEl) return;

  listEl = document.getElementById("panelList");
  emptyEl = document.getElementById("panelEmpty");
  nextUpEl = document.getElementById("panelNextUp");
  nextUpListEl = document.getElementById("panelNextUpList");
  closeBtn = document.getElementById("panelClose");

  document.body.classList.add("is-panel");
  initTheme();

  panelEl.addEventListener("dblclick", function (e) {
    if (e.target.closest("button")) return;
    if (window.windowControls) window.windowControls.expand();
  });

  panelEl.addEventListener("contextmenu", function (e) {
    e.preventDefault();
    if (window.panel && window.panel.menu) window.panel.menu();
  });

  enableWindowDrag(panelEl);

  if (closeBtn) {
    closeBtn.addEventListener("click", function () {
      if (window.panel && window.panel.hide) window.panel.hide();
    });
  }

  render(null);

  if (!window.panel) return;
  window.panel.onData(render);
  window.panel.get().then(render);
}

function rowHtml(row) {
  return '<div class="panel-row">' +
    '<span class="panel-kind ' + (row.kind === "task" ? "task" : "quest") + '">' +
    escapeHtml(KIND_LABEL[row.kind] || row.kind) + '</span>' +
    '<span class="panel-row-title">' + escapeHtml(row.title) + '</span>' +
    '</div>';
}

// data: { rows: [{ kind, title }], nextUp: [same], hidden } — as built by
// core/wip.js on the board side. Anything else (no push yet, a failed read)
// draws the empty state rather than an empty box with no explanation.
function render(data) {
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

// The window is sized to its contents, so main.js is told how tall they are
// after every render. offsetHeight is 0 under jsdom, where there is no layout;
// main.js clamps, so that reads as "as small as allowed" rather than breaking.
function reportHeight() {
  if (!window.panel || !window.panel.resize) return;
  window.panel.resize(panelEl.offsetHeight);
}

initInFlight();
