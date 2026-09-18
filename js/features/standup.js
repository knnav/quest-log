// The Standup tab: what is in flight, and what got finished since the last
// weekday, one section per day. The thing to have open at a standup, or to
// read back over on a Monday to remember what Friday was.
//
// It owns no data and is read-only: rows are kind, title and a time, not
// cards with pills, because this is for reading out and not for working
// from. A click on a row opens the same detail modal the boards use, via
// the detail builders quests.js and tasks.js export — app.js hands them in,
// the same way home.js is given its data, so this module imports neither.
//
// Rendered on every data change and on window focus: the day boundaries
// move at midnight, and a tab left open overnight must not still call
// yesterday "Today" in the morning.

import { standup } from "../core/records.js";
import { escapeHtml } from "../core/html.js";
import { relativeDay, clockOf } from "../core/dates.js";
import { formatWorked } from "../core/sessionFormat.js";
import { bindCardDetail } from "../ui/detail.js";

var KIND_LABEL = { quest: "Quest", task: "Task" };
var OUTCOME_LABEL = { shipped: "Shipped", let_go: "Let go", done: "Done" };

var rootEl = null;
var getData = null;
var detailFor = {};

// dataSource returns { quests, tasks, sessions }; hooks are { quest, task },
// each an id → detail builder for ui/detail.js.
export function initStandup(dataSource, hooks) {
  getData = dataSource;
  detailFor = hooks || {};
  rootEl = document.getElementById("standup");
  if (!rootEl) return;

  window.addEventListener("focus", renderStandup);
}

function rowHtml(row, when) {
  return '<div class="standup-row" data-kind="' + row.kind + '" data-id="' + escapeHtml(row.id) + '">' +
    '<span class="standup-kind ' + row.kind + '">' + (KIND_LABEL[row.kind] || row.kind) + '</span>' +
    '<span class="standup-title">' + escapeHtml(row.title) + '</span>' +
    (when ? '<span class="standup-when">' + escapeHtml(when) + '</span>' : "") +
    '</div>';
}

function inFlightHtml(row, now) {
  return rowHtml(row, row.startedAt ? "Started " + relativeDay(row.startedAt, now) : "");
}

function finishedHtml(row) {
  return rowHtml(row, (OUTCOME_LABEL[row.outcome] || "Finished") + " " + clockOf(row.at));
}

function section(title, body, extraClass) {
  return '<section class="tier standup-tier' + (extraClass ? " " + extraClass : "") + '">' +
    '<div class="tier-head"><h2 class="tier-title">' + escapeHtml(title) + '</h2></div>' +
    body +
    '</section>';
}

function listHtml(rows) {
  return '<div class="standup-list">' + rows.join("") + '</div>';
}

function emptyHtml(text) {
  return '<p class="standup-empty">' + text + '</p>';
}

function dayHtml(day) {
  var body = day.items.length
    ? listHtml(day.items.map(finishedHtml))
    : emptyHtml("Nothing finished yet.");

  if (day.sessions) {
    body += '<p class="standup-sessions">' + day.sessions +
      (day.sessions === 1 ? " session" : " sessions") + " · " + formatWorked(day.workedMs) + '</p>';
  }
  return section(day.label, body);
}

export function renderStandup() {
  if (!rootEl || !getData) return;

  var data = getData();
  var now = new Date();
  var view = standup(data.quests, data.tasks, data.sessions, now);

  var html = section(
    "In flight",
    view.inFlight.length
      ? listHtml(view.inFlight.map(function (row) { return inFlightHtml(row, now); }))
      : emptyHtml("Nothing in flight."),
    "standup-flight"
  );
  html += view.days.map(dayHtml).join("");

  rootEl.innerHTML = html;

  if (detailFor.quest) bindCardDetail(rootEl, '.standup-row[data-kind="quest"]', detailFor.quest);
  if (detailFor.task) bindCardDetail(rootEl, '.standup-row[data-kind="task"]', detailFor.task);
}
