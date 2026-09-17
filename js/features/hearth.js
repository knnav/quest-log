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
// drag is done by hand — pointer deltas over IPC, at most one per animation
// frame — rather than with a CSS `-webkit-app-region: drag`. That is not a
// style choice: on Windows a drag region swallows every DOM mouse event, so
// the double-click (and the right-click menu with Quit in it) would never
// arrive. The trade-offs and the two Windows scaling traps this walks around
// are written up in main.js above `dragOrigin`; don't reintroduce a drag
// region here without reading that first. The pause/stop buttons only appear
// while a session is running.
//
// A finished session that nobody has acknowledged puts the face in `is-alarm`:
// it pulses, the drag is switched off, and the next click is the
// acknowledgement — you can't accidentally move it instead of noticing it.

import { formatRemaining } from "../core/sessionFormat.js";

var viewEl, sessionEl, questEl, clockEl, actionsEl, toggleBtn, stopBtn, barEl;
var lastView = { active: false };
var drag = null;
var pendingMove = null;

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

  viewEl.addEventListener("pointerdown", startDrag);
  viewEl.addEventListener("pointermove", moveDrag);
  viewEl.addEventListener("pointerup", stopDrag);
  viewEl.addEventListener("pointercancel", stopDrag);

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

// Left button only, and never from the buttons — they have their own job.
// Nor while the alarm is on: that click is for acknowledging.
function startDrag(e) {
  if (e.button !== 0 || e.target.closest("button") || lastView.awaitingAck) return;
  if (!window.windowControls || !window.windowControls.dragStart) return;
  drag = { x: e.screenX, y: e.screenY, pointerId: e.pointerId };
  if (viewEl.setPointerCapture) viewEl.setPointerCapture(e.pointerId);
  window.windowControls.dragStart();
}

// Coalesced to one IPC per frame: pointer events can arrive far faster than
// the window can be repainted, and every extra move is a wasted native call.
function moveDrag(e) {
  if (!drag) return;
  pendingMove = { dx: e.screenX - drag.x, dy: e.screenY - drag.y };
  if (pendingMove.scheduled) return;
  pendingMove.scheduled = true;
  var raf = window.requestAnimationFrame || function (fn) { return setTimeout(fn, 16); };
  raf(flushMove);
}

function flushMove() {
  var move = pendingMove;
  pendingMove = null;
  if (!move || !drag) return;
  window.windowControls.dragMove(move.dx, move.dy);
}

function stopDrag(e) {
  if (!drag) return;
  flushMove();
  if (viewEl.releasePointerCapture) {
    try { viewEl.releasePointerCapture(drag.pointerId); } catch (err) { /* already released */ }
  }
  drag = null;
  window.windowControls.dragEnd();
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
