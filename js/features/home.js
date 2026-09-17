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

  // The window sits open for days, so nothing here can be computed once. The
  // clock needs the minute, and the fire decays across it.
  startTicking();

  // An idle Electron window animating a fire forever is a battery complaint
  // waiting to happen.
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
  // Only once there is an Ashes pile — otherwise it is a row of zero, and
  // without it the column would quietly stop adding up to your total.
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

// One line, on the screen you actually look at. A quest rotting in the backlog
// is invisible otherwise — you would have to open every card to notice.
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

// The message of the day is worth more when it knows where you actually are.
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

// Re-render on the minute rather than every minute from load, so the clock
// turns over when the wall clock does — and so midnight recomputes the fire.
function startTicking() {
  if (tickTimer) clearTimeout(tickTimer);
  var msToNextMinute = 60000 - (Date.now() % 60000);
  tickTimer = setTimeout(function () {
    renderHome();
    startTicking();
  }, msToNextMinute);

  // In a browser setTimeout hands back a number and this is a no-op. Under
  // Node it hands back a Timeout, and a repeating one would hold the event
  // loop open forever — which is exactly what hung the test run.
  if (tickTimer && typeof tickTimer.unref === "function") tickTimer.unref();
}
