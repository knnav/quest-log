// The landing card for coming back after a while away: the fire, one line,
// one button — and, if anything was left in flight, its titles with one
// question over them. Wired over the #reentry markup in index.html;
// degrades to a no-op where that markup is absent.
//
// It borrows peace mode's look (styles.css, "the re-entry card") because it
// has the same job: a soft place to arrive before the whole system. It is
// not a modal and gates nothing — Escape, the button, or a click on the
// floor takes it down, and the titlebar stays reachable above it, so
// dropping to the hearth instead of the board is still an answer.
//
// The in-flight rows are opt-in and manual on purpose. A row opens the
// quest's ordinary detail modal, where Let go already lives; the card never
// suggests, pre-selects or batches. Nothing here counts days.

import { escapeHtml } from "../core/html.js";

var rootEl = null;
var flightEl = null;
var askEl = null;
var rowsEl = null;
var onQuest = null;

// hooks.onQuest(id): what to do when a row is picked — app.js opens the
// quest's detail modal. The card is already down by the time it runs.
export function initReentry(hooks) {
  rootEl = document.getElementById("reentry");
  onQuest = hooks && hooks.onQuest ? hooks.onQuest : null;
  if (!rootEl) return;

  flightEl = document.getElementById("reentryFlight");
  askEl = document.getElementById("reentryAsk");
  rowsEl = document.getElementById("reentryRows");

  var goBtn = document.getElementById("reentryGo");
  if (goBtn) goBtn.addEventListener("click", hideReentry);

  // The floor, not the card: a click beside it is "just let me in".
  rootEl.addEventListener("click", function (e) {
    if (e.target === rootEl) hideReentry();
  });

  if (rowsEl) {
    rowsEl.addEventListener("click", function (e) {
      var row = e.target.closest("[data-id]");
      if (!row) return;
      var id = row.getAttribute("data-id");
      hideReentry();
      if (onQuest) onQuest(id);
    });
  }

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && isReentryOpen()) hideReentry();
  });
}

// quests: what is still in flight, already filtered and ordered
// (core/reentry.js stillInFlight). Empty hides the block entirely.
export function showReentry(quests) {
  if (!rootEl) return;
  quests = quests || [];

  if (flightEl) flightEl.hidden = quests.length === 0;
  if (askEl) {
    askEl.textContent = quests.length === 1
      ? "One quest is still in flight. Does it still matter?"
      : quests.length + " quests are still in flight. Do they still matter?";
  }
  if (rowsEl) {
    rowsEl.innerHTML = quests.map(function (q) {
      return '<li><button type="button" class="reentry-row" data-id="' + escapeHtml(q.id) + '">' +
        escapeHtml(q.title) + '</button></li>';
    }).join("");
  }

  rootEl.hidden = false;
}

export function hideReentry() {
  if (!rootEl) return;
  rootEl.hidden = true;
}

export function isReentryOpen() {
  return !!rootEl && !rootEl.hidden;
}
