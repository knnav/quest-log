// The Home screen: the two stat columns, the bonfire, the XP ledger, the
// clock, the stale-quest line and the quote of the moment.
//
// It owns no data. initHome takes a `dataSource` callback and re-reads it on
// every render, so quests.js and tasks.js just call renderHome() after they
// change something. Everything shown is derived — nothing here is stored.
//
// It also re-renders on a timer, because the window stays open for days.

import {
  fuelFor, stageFor, completionEntries, lastCompletedAt, elapsedLabel,
  STAGE_LABELS
} from "../core/fire.js";
import { totalXp, levelFor, growthFor } from "../core/xp.js";
import { oldestWaiting } from "../core/records.js";
import { clockOf } from "../core/dates.js";
import { pickMotd, motdHtml } from "./motd.js";
import { showLevelUp } from "../ui/levelUp.js";
import { WIP_LIMIT, STALE_DAYS } from "../core/domain.js";

var bonfireEls, stageLabelEls, motdEls, bonfireEl, staleEl;
var xpLevelEls, xpFillEls, xpCountEls;
var sinceValueEl, sinceLabelEl, clockEl;
var questStatsEl, taskStatsEl;
var getData = null;
var onLevelUp = null;
var tickTimer = null;

// The line peace mode is showing, held for as long as it lasts. Every other
// face re-rolls the quote on each render; peace is entered to sit with one
// thing, so it keeps the one it opened with. Cleared on the way out.
var peaceLine = null;

// The level as of the last render, so a render can tell a level-up from a
// first paint. Not tracked until armLedger(): quests and tasks arrive in
// separate loads at boot, and a threshold crossed between the two would
// otherwise ring as if it had just happened.
var lastLevel = null;

// A level-up shows the card (ui/levelUp.js) and calls `hooks.onLevelUp` —
// app.js hands it the session chime, since the ledger has no sound of its
// own and one chime for "something finished" is enough vocabulary.
export function initHome(dataSource, hooks) {
  getData = dataSource;
  onLevelUp = hooks && hooks.onLevelUp ? hooks.onLevelUp : null;
  lastLevel = null;

  // There are two fires — the home screen's and the hearth face's — and both
  // are painted from here so they can never disagree about the stage.
  bonfireEls = document.querySelectorAll(".bonfire");
  stageLabelEls = document.querySelectorAll("[data-bonfire-stage]");
  // Likewise the quote under the stage label: the hearth face shows the same one.
  motdEls = document.querySelectorAll("[data-motd]");
  // And the ledger: one row under the stage label, one in the hearth's corner.
  xpLevelEls = document.querySelectorAll("[data-xp-level]");
  xpFillEls = document.querySelectorAll("[data-xp-fill]");
  xpCountEls = document.querySelectorAll("[data-xp-count]");
  bonfireEl = document.getElementById("bonfire");
  sinceValueEl = document.getElementById("sinceValue");
  sinceLabelEl = document.getElementById("sinceLabel");
  clockEl = document.getElementById("clock");
  questStatsEl = document.getElementById("questStats");
  taskStatsEl = document.getElementById("taskStats");
  staleEl = document.getElementById("staleNote");

  if (!bonfireEl) return;

  startTicking();

  // The fire is a CSS animation; pause it while the window is unfocused rather
  // than burning CPU in the background. Re-render on focus to catch up on the
  // decay and clock drift that happened while we were idle. (The hearth face
  // opts out of the pause in CSS — a companion that freezes is no companion.)
  window.addEventListener("blur", function () { document.body.classList.add("is-idle"); });
  window.addEventListener("focus", function () {
    document.body.classList.remove("is-idle");
    renderHome();
  });
}

// Takes the ledger's baseline from the data as it stands now, so that from
// here on a rise in level is a real one. app.js calls it once the initial
// loads have settled.
export function armLedger() {
  if (!getData) return;
  var data = getData();
  lastLevel = levelFor(totalXp(data.quests, data.tasks)).level;
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
  var ledger = levelFor(totalXp(data.quests, data.tasks));

  // The fire has two readings: its stage is the last three days, its size is
  // the level — --growth scales its unit, so a level-40 embers is a bigger
  // bed of coals than a level-1 blaze is a fire.
  var growth = growthFor(ledger.level).toFixed(3);
  bonfireEls.forEach(function (el) {
    el.setAttribute("data-stage", String(stage));
    el.style.setProperty("--growth", growth);
  });
  stageLabelEls.forEach(function (el) { el.textContent = STAGE_LABELS[stage]; });

  renderXp(ledger);
  noteLevel(ledger);

  var lastMs = lastCompletedAt(entries);
  var since = elapsedLabel(lastMs, now);

  if (since === null) {
    sinceValueEl.textContent = "—";
    sinceLabelEl.textContent = "nothing finished yet";
  } else {
    sinceValueEl.textContent = since;
    sinceLabelEl.textContent = "since your last drop";
  }

  clockEl.textContent = clockOf(now);

  renderStale(data, now);

  var html = motdHtml(pickQuote(data, stage));
  motdEls.forEach(function (el) { el.innerHTML = html; });
}

// Paints the ledger into every copy of it. The count reads "into / span"
// rather than the lifetime total: the number that matters is how far to the
// next goal, and the total is on the bar.
function renderXp(ledger) {
  xpLevelEls.forEach(function (el) { el.textContent = "Lv " + ledger.level; });
  xpFillEls.forEach(function (el) { el.style.width = Math.round(ledger.progress * 100) + "%"; });
  xpCountEls.forEach(function (el) {
    el.textContent = ledger.toNext ? ledger.into + " / " + ledger.span : "max";
  });
}

// A rise in level since the last render is the moment: the card, then the
// hook. Silent until armLedger() has taken a baseline.
function noteLevel(ledger) {
  if (lastLevel === null) return;
  var leveledUp = ledger.level > lastLevel;
  lastLevel = ledger.level;
  if (!leveledUp) return;

  showLevelUp(ledger.level);
  if (onLevelUp) onLevelUp(ledger);
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

// Peace reads from its own pool and never from the board: a line about what
// is in flight, or how cold the fire is, is exactly the reading it exists to
// get away from. hearth.js repaints on every mode switch (app.js wires
// initHearth's onModeChange to renderHome), so the swap is immediate.
function pickQuote(data, stage) {
  if (document.body.getAttribute("data-mode") !== "peace") {
    peaceLine = null;
    return pickMotd(situationOf(data, stage));
  }
  if (!peaceLine) peaceLine = pickMotd("peace");
  return peaceLine;
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
