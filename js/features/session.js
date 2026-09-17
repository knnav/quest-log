// The Focus tab: the pomodoro timer's main-window UI.
//
// It does not own the timer. The clock lives in the main process so that this
// view and the mini window can't drift apart, and both are pure renderers of
// the `view` object pushed over window.session. `lastView` is the only state
// kept here, and only so the length chips know whether a session is running.
//
// Session end rings a WebAudio chime rather than firing a system notification:
// no permission prompt, and it still reaches you when the window is buried.
// Until someone acknowledges it, main.js sends a couple of nudges that ring
// the same chime again; the schedule lives there, not here.

import { formatRemaining, formatWorked } from "../core/sessionFormat.js";
import { msOf, spanMs } from "../core/dates.js";

var clockEl, faceEl, targetEl, lengthsEl, questSelect, startBtn, toggleBtn, stopBtn, todayEl, dotEl;
var onSessionEnd = null;
var getQuests = null;
var minutes = 25;
var audio = null;
var lastView = { active: false };

export function initSession(options) {
  onSessionEnd = options.onEnded;
  getQuests = options.quests;

  clockEl = document.getElementById("focusClock");
  if (!clockEl) return;

  faceEl = document.getElementById("focusFace");
  targetEl = document.getElementById("focusTarget");
  lengthsEl = document.getElementById("focusLengths");
  questSelect = document.getElementById("focusQuest");
  startBtn = document.getElementById("focusStart");
  toggleBtn = document.getElementById("focusToggle");
  stopBtn = document.getElementById("focusStop");
  todayEl = document.getElementById("focusToday");
  dotEl = document.getElementById("focusDot");

  lengthsEl.addEventListener("click", function (e) {
    var chip = e.target.closest(".chip");
    if (!chip || lastView.active) return;
    minutes = Number(chip.getAttribute("data-minutes"));
    renderLengths();
    render(lastView);
  });

  startBtn.addEventListener("click", start);

  if (faceEl) {
    faceEl.addEventListener("click", function () {
      if (!lastView.awaitingAck || !window.session || !window.session.acknowledge) return;
      window.session.acknowledge().then(render);
    });
  }

  toggleBtn.addEventListener("click", function () {
    if (!window.session) return;
    (lastView.paused ? window.session.resume() : window.session.pause()).then(render);
  });

  stopBtn.addEventListener("click", function () {
    if (!window.session) return;
    window.session.stop().then(function (view) {
      render(view);
      if (onSessionEnd) onSessionEnd();
    });
  });

  renderLengths();

  if (!window.session) return;
  window.session.onChange(render);
  window.session.onFinished(function () {
    chime();
    if (onSessionEnd) onSessionEnd();
  });
  if (window.session.onNudge) window.session.onNudge(chime);
  window.session.get().then(render);
}

function start() {
  if (!window.session) return;

  // Create the AudioContext inside the click handler. A context built without
  // a user gesture starts suspended and is never allowed to make noise — and
  // the chime is needed 25 minutes later, with no gesture in sight.
  primeAudio();

  var id = questSelect.value;
  var quest = (getQuests ? getQuests() : []).filter(function (q) { return q.id === id; })[0];

  window.session.start({
    questId: quest ? quest.id : null,
    questTitle: quest ? quest.title : "",
    durationMs: minutes * 60000
  }).then(render);
}

// Repopulates the quest picker from whatever is in progress; call it whenever
// that set changes. Deliberately excludes backlog quests, so that picking one
// here can't start it behind the WIP gate on the Quests tab. Preserves the
// current selection if it is still in flight.
export function renderFocusQuests() {
  if (!questSelect) return;

  var inProgress = (getQuests ? getQuests() : []).filter(function (q) {
    return q.status === "in_progress";
  });
  var keep = questSelect.value;

  questSelect.innerHTML = '<option value="">Nothing in particular</option>' +
    inProgress.map(function (q) {
      return '<option value="' + q.id + '">' + q.title.replace(/</g, "&lt;") + "</option>";
    }).join("");

  if (inProgress.some(function (q) { return q.id === keep; })) questSelect.value = keep;
}

export function renderToday(sessions) {
  if (!todayEl) return;

  var midnight = new Date();
  midnight.setHours(0, 0, 0, 0);

  var today = (sessions || []).filter(function (s) {
    var ended = msOf(s.endedAt);
    return ended !== null && ended >= midnight.getTime();
  });

  if (!today.length) {
    todayEl.textContent = "No sessions yet today.";
    return;
  }

  var worked = today.reduce(function (total, s) {
    return total + (spanMs(s.startedAt, s.endedAt) || 0);
  }, 0);

  todayEl.textContent = "Today: " + today.length +
    (today.length === 1 ? " session" : " sessions") + " · " + formatWorked(worked);
}

function renderLengths() {
  if (!lengthsEl) return;
  lengthsEl.querySelectorAll(".chip").forEach(function (chip) {
    chip.classList.toggle("active", Number(chip.getAttribute("data-minutes")) === minutes);
    chip.disabled = lastView.active;
  });
}

function render(view) {
  if (!clockEl) return;
  lastView = view || { active: false };

  var running = !!lastView.active;
  var done = !running && !!lastView.awaitingAck;

  clockEl.textContent = running
    ? formatRemaining(lastView.remainingMs)
    : done ? "00:00" : formatRemaining(minutes * 60000);

  targetEl.textContent = running
    ? (lastView.questTitle || "Nothing in particular")
    : done ? "Session complete · click to dismiss" : "Ready when you are";

  document.body.classList.toggle("session-running", running);
  document.body.classList.toggle("session-done", done);
  clockEl.classList.toggle("is-paused", running && lastView.paused);

  startBtn.hidden = running;
  toggleBtn.hidden = !running;
  stopBtn.hidden = !running;
  questSelect.disabled = running;
  if (toggleBtn) toggleBtn.textContent = lastView.paused ? "Resume" : "Pause";
  if (dotEl) dotEl.hidden = !running && !done;

  renderLengths();
}

function primeAudio() {
  try {
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!audio) audio = new Ctx();
    if (audio.state === "suspended") audio.resume();
  } catch (e) {
    audio = null;
  }
}

// A C major triad, arpeggiated at 170ms and left to ring for 1.7s. Synthesised
// rather than played from a file, so the bundle carries no audio asset.
// Exported for the ledger's level-up (home.js), which borrows it rather than
// adding a second sound.
export function chime() {
  primeAudio();
  if (!audio) return;

  var now = audio.currentTime;
  [523.25, 659.25, 783.99].forEach(function (freq, i) {
    var osc = audio.createOscillator();
    var gain = audio.createGain();
    var at = now + i * 0.17;

    osc.type = "sine";
    osc.frequency.value = freq;

    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(0.2, at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 1.7);

    osc.connect(gain);
    gain.connect(audio.destination);
    osc.start(at);
    osc.stop(at + 1.8);
  });
}
