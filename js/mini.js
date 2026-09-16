import { formatRemaining } from "./sessionFormat.js";

// The mini window draws the timer; it never owns it. Everything shown here
// comes from the main process, so this countdown and the one in the main
// window can't drift apart.
//
// It deliberately does NOT use initTheme(): there is no picker in this
// document, and the theme arrives over IPC from whichever window has one.
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
