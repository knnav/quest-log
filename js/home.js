import {
  fuelFor, stageFor, completionEntries, lastCompletedAt, elapsedLabel,
  STAGE_LABELS, STAGE_NOTES
} from "./fire.js";

var bonfireEl, stageLabelEl, stageNoteEl;
var sinceValueEl, sinceLabelEl, clockEl;
var questStatsEl, sideQuestStatsEl;
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
  sideQuestStatsEl = document.getElementById("sideQuestStats");

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

  renderStats(questStatsEl, [
    ["Backlog", data.questCounts.backlog],
    ["In progress", data.questCounts.in_progress],
    ["Shipped", data.questCounts.shipped]
  ]);

  renderStats(sideQuestStatsEl, [
    ["Backlog", data.sideQuestCounts.backlog],
    ["In progress", data.sideQuestCounts.in_progress],
    ["Done", data.sideQuestCounts.done]
  ]);

  var entries = completionEntries(data.quests, data.sideQuests);
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
