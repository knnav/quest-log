// The Home screen: the two stat columns, the bonfire, the clock, the
// stale-quest line and the message of the day.
//
// It owns no data. initHome takes a `dataSource` callback and re-reads it on
// every render, so quests.js and tasks.js just call renderHome() after they
// change something. Everything shown is derived — nothing here is stored.
//
// It also re-renders on a timer, because the window stays open for days.

import {
  fuelFor, stageFor, completionEntries, lastCompletedAt, elapsedLabel,
  STAGE_LABELS, STAGE_NOTES
} from "../core/fire.js";
import { oldestWaiting } from "../core/records.js";
import { pickMotd } from "./motd.js";
import { WIP_LIMIT, STALE_DAYS } from "../core/domain.js";

var bonfireEl, stageLabelEl, stageNoteEl, staleEl, motdEl;
var sinceValueEl, sinceLabelEl, clockEl;
var questStatsEl, taskStatsEl;
var getData = null;
var tickTimer = null;

export function initHome(dataSource) {
  getData = dataSource;

  bonfireEl = document.getElementById("bonfire");
  stageLabelEl = document.getElementById("bonfireStage");
  stageNoteEl = document.getElementById("bonfireNote");
  sinceValueEl = document.getElementById("sinceValue");
  sinceLabelEl = document.getElementById("sinceLabel");
  clockEl = document.getElementById("clock");
  questStatsEl = document.getElementById("questStats");
  taskStatsEl = document.getElementById("taskStats");
  staleEl = document.getElementById("staleNote");
  motdEl = document.getElementById("motd");

  if (!bonfireEl) return;

  startTicking();

  // The fire is a CSS animation; pause it while the window is unfocused rather
  // than burning CPU in the background. Re-render on focus to catch up on the
  // decay and clock drift that happened while we were idle.
  window.addEventListener("blur", function () { document.body.classList.add("is-idle"); });
  window.addEventListener("focus", function () {
    document.body.classList.remove("is-idle");
    renderHome();
  });
}

export function renderHome() {
  if (!bonfireEl || !getData) return;

  var data = getData();
  var now = new Date();

  var questRows = [
    ["Backlog", data.questCounts.backlog],
    ["In progress", data.questCounts.in_progress],
    ["Shipped", data.questCounts.shipped]
  ];
  // Shown only once non-zero: an always-present "Let go: 0" is noise, but
  // hiding it when it is non-zero makes the column stop summing to the total.
  if (data.questCounts.let_go) questRows.push(["Let go", data.questCounts.let_go]);
  renderStats(questStatsEl, questRows);

  renderStats(taskStatsEl, [
    ["Backlog", data.taskCounts.backlog],
    ["In progress", data.taskCounts.in_progress],
    ["Done", data.taskCounts.done]
  ]);

  var entries = completionEntries(data.quests, data.tasks);
  var stage = stageFor(fuelFor(entries, now));

  bonfireEl.setAttribute("data-stage", String(stage));
  stageLabelEl.textContent = STAGE_LABELS[stage];
  stageNoteEl.textContent = STAGE_NOTES[stage];

  var lastMs = lastCompletedAt(entries);
  var since = elapsedLabel(lastMs, now);

  if (since === null) {
    sinceValueEl.textContent = "—";
    sinceLabelEl.textContent = "nothing finished yet";
  } else {
    sinceValueEl.textContent = since;
    sinceLabelEl.textContent = "since your last drop";
  }

  clockEl.textContent = formatClock(now);

  renderStale(data, now);
  if (motdEl) motdEl.textContent = pickMotd(situationOf(data, stage));
}

// Surfaces the longest-waiting backlog quest once it passes STALE_DAYS.
// Hidden entirely below the threshold, rather than shown as an empty element,
// so it takes no vertical space on a board with nothing stale.
function renderStale(data, now) {
  if (!staleEl) return;
  var oldest = oldestWaiting(data.quests, now);

  if (!oldest || oldest.days < STALE_DAYS) {
    staleEl.textContent = "";
    staleEl.hidden = true;
    return;
  }

  staleEl.textContent = "\u201c" + oldest.title + "\u201d has been waiting " + oldest.days + " days.";
  staleEl.hidden = false;
}

// Maps the current board state to a motd pool name. Order matters: the checks
// run most-specific first, and "default" is the fallthrough.
function situationOf(data, stage) {
  var q = data.questCounts;
  var t = data.taskCounts;

  if (!data.quests.length && !data.tasks.length) return "empty";
  if (q.in_progress >= WIP_LIMIT + 1) return "overloaded";
  if (q.in_progress === 0 && t.in_progress === 0) return "idle";
  if (stage === 0) return "cold";
  if (stage >= 4) return "roaring";
  return "default";
}

function renderStats(el, rows) {
  if (!el) return;
  el.innerHTML = rows.map(function (row) {
    return '<div class="stat-row"><span class="stat-label">' + row[0] +
      '</span><span class="stat-value">' + row[1] + '</span></div>';
  }).join("");
}

function formatClock(date) {
  return String(date.getHours()).padStart(2, "0") + ":" +
    String(date.getMinutes()).padStart(2, "0");
}

// Re-renders on the wall-clock minute, not every 60s from load, so the clock
// flips when the real minute does. Re-arms itself each tick rather than using
// setInterval, since the delay differs every time.
function startTicking() {
  if (tickTimer) clearTimeout(tickTimer);
  var msToNextMinute = 60000 - (Date.now() % 60000);
  tickTimer = setTimeout(function () {
    renderHome();
    startTicking();
  }, msToNextMinute);

  // Under Node (jsdom tests) setTimeout returns a Timeout object, and this
  // self-rearming chain would hold the event loop open forever. In a browser it
  // returns a number and this is a no-op.
  if (tickTimer && typeof tickTimer.unref === "function") tickTimer.unref();
}
