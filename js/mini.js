// Renderer entry point for the always-on-top timer window.
//
// A pure view: it holds no timer and no state. Every value comes from the
// `view` object pushed by the main process, which is what keeps this countdown
// and the Focus tab's in lockstep.
//
// It applies the theme by hand rather than calling initTheme(): this document
// has no picker, and the resolved theme arrives over IPC from the window that
// does. Everything runs at import time — there is no init function, because
// this script has exactly one consumer and mini.html loads it after the body.

import { formatRemaining } from "./core/sessionFormat.js";

var questEl, clockEl, toggleBtn, stopBtn, barEl;

function applyTheme(resolved) {
  if (resolved) document.documentElement.setAttribute("data-theme", resolved);
}

function render(view) {
  if (!view || !view.active) {
    clockEl.textContent = "00:00";
    barEl.style.width = "0%";
    return;
  }

  questEl.textContent = view.questTitle || "Focus";
  clockEl.textContent = formatRemaining(view.remainingMs);

  var done = view.durationMs ? 1 - view.remainingMs / view.durationMs : 0;
  barEl.style.width = Math.min(100, Math.max(0, done * 100)) + "%";

  toggleBtn.textContent = view.paused ? "▶" : "II";
  toggleBtn.title = view.paused ? "Resume" : "Pause";
  document.body.classList.toggle("is-paused", view.paused);
}

questEl = document.getElementById("miniQuest");
clockEl = document.getElementById("miniClock");
toggleBtn = document.getElementById("miniToggle");
stopBtn = document.getElementById("miniStop");
barEl = document.getElementById("miniBar");

if (window.themeSync) {
  window.themeSync.get().then(applyTheme);
  window.themeSync.onChange(applyTheme);
}

toggleBtn.addEventListener("click", function () {
  window.session.get().then(function (view) {
    return view.paused ? window.session.resume() : window.session.pause();
  }).then(render);
});

stopBtn.addEventListener("click", function () {
  window.session.stop();
});

window.session.onChange(render);
window.session.get().then(render);
