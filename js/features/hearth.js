// The hearth face: what the window shows when it is collapsed into the tiny
// always-on-top resident.
//
// A pure view, like the Focus tab. The mode comes from main.js over
// window.windowControls and is mirrored onto body[data-mode], which is all the
// CSS needs to swap the board for the hearth. The countdown comes from the
// `view` pushed over window.session — this holds no timer of its own.
//
// The whole face can be dragged, a double-click anywhere brings the board
// back, right-click opens a small menu, Escape is the keyboard way out. The
// drag itself lives in ui/windowDrag.js, shared with the In Flight panel —
// read the note there (and the one above `dragging` in main.js) before
// reaching for a CSS drag region instead. The pause/stop buttons only appear
// while a session is running.
//
// A finished session that nobody has acknowledged puts the face in `is-alarm`:
// it pulses, the drag is switched off, and the next click is the
// acknowledgement — you can't accidentally move it instead of noticing it.

import { formatRemaining } from "../core/sessionFormat.js";
import { enableWindowDrag } from "../ui/windowDrag.js";

var viewEl, sessionEl, questEl, clockEl, actionsEl, toggleBtn, stopBtn, barEl;
var lastView = { active: false };

export function initHearth() {
  viewEl = document.getElementById("hearthView");
  if (!viewEl) return;

  sessionEl = document.getElementById("hearthSession");
  questEl = document.getElementById("hearthQuest");
  clockEl = document.getElementById("hearthClock");
  actionsEl = document.getElementById("hearthActions");
  toggleBtn = document.getElementById("hearthToggle");
  stopBtn = document.getElementById("hearthStop");
  barEl = document.getElementById("hearthBar");

  applyMode("board");

  viewEl.addEventListener("dblclick", function (e) {
    if (e.target.closest("button")) return;
    if (window.windowControls) window.windowControls.expand();
  });

  viewEl.addEventListener("click", function (e) {
    if (!lastView.awaitingAck || e.target.closest("button")) return;
    if (window.session && window.session.acknowledge) window.session.acknowledge().then(render);
  });

  viewEl.addEventListener("contextmenu", function (e) {
    e.preventDefault();
    if (window.windowControls && window.windowControls.hearthMenu) window.windowControls.hearthMenu();
  });

  // Not while the alarm is on: that click is for acknowledging, and must not
  // be spent nudging the window a few pixels instead.
  enableWindowDrag(viewEl, { blocked: function () { return !!lastView.awaitingAck; } });

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape" || document.body.getAttribute("data-mode") !== "hearth") return;
    if (window.windowControls) window.windowControls.expand();
  });

  toggleBtn.addEventListener("click", function () {
    if (!window.session) return;
    (lastView.paused ? window.session.resume() : window.session.pause()).then(render);
  });

  stopBtn.addEventListener("click", function () {
    if (window.session) window.session.stop().then(render);
  });

  if (window.windowControls && window.windowControls.onModeChange) {
    window.windowControls.onModeChange(applyMode);
    window.windowControls.getMode().then(applyMode);
  }

  if (window.session) {
    window.session.onChange(render);
    window.session.get().then(render);
  }
}

export function applyMode(mode) {
  document.body.setAttribute("data-mode", mode === "hearth" ? "hearth" : "board");
}

function render(view) {
  if (!viewEl) return;
  lastView = view || { active: false };
  var running = !!lastView.active;
  var alarm = !running && !!lastView.awaitingAck;

  sessionEl.hidden = !running && !alarm;
  actionsEl.hidden = !running;
  viewEl.classList.toggle("session-running", running);
  viewEl.classList.toggle("is-paused", running && lastView.paused);
  viewEl.classList.toggle("is-alarm", alarm);

  if (alarm) {
    questEl.textContent = lastView.questTitle || "Focus";
    clockEl.textContent = "Done";
    barEl.style.width = "100%";
    return;
  }

  if (!running) {
    barEl.style.width = "0%";
    return;
  }

  questEl.textContent = lastView.questTitle || "Focus";
  clockEl.textContent = formatRemaining(lastView.remainingMs);
  toggleBtn.textContent = lastView.paused ? "▶" : "II";
  toggleBtn.title = lastView.paused ? "Resume" : "Pause";

  var done = lastView.durationMs ? 1 - lastView.remainingMs / lastView.durationMs : 0;
  barEl.style.width = Math.min(100, Math.max(0, done * 100)) + "%";
}
