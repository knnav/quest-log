import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { formatRemaining, formatWorked } from "../js/core/sessionFormat.js";

test("formatRemaining always reads as mm:ss and never goes negative", () => {
  assert.equal(formatRemaining(25 * 60000), "25:00");
  assert.equal(formatRemaining(61000), "01:01");
  assert.equal(formatRemaining(1000), "00:01");
  assert.equal(formatRemaining(0), "00:00");
  assert.equal(formatRemaining(-5000), "00:00");
  assert.equal(formatRemaining(undefined), "00:00");
});

test("formatRemaining rounds up, so a timer never shows 00:00 while running", () => {
  assert.equal(formatRemaining(1), "00:01");
  assert.equal(formatRemaining(59999), "01:00");
});

test("formatWorked switches to hours past sixty minutes", () => {
  assert.equal(formatWorked(25 * 60000), "25m");
  assert.equal(formatWorked(59 * 60000), "59m");
  assert.equal(formatWorked(90 * 60000), "1h 30m");
  assert.equal(formatWorked(0), "0m");
});

const FOCUS_HTML = `<!doctype html><html><body>
  <span class="tab-dot" id="focusDot" hidden></span>
  <p id="focusClock">25:00</p>
  <p id="focusTarget"></p>
  <div id="focusLengths">
    <button class="chip" data-minutes="15">15m</button>
    <button class="chip active" data-minutes="25">25m</button>
    <button class="chip" data-minutes="50">50m</button>
  </div>
  <select id="focusQuest"><option value="">Nothing in particular</option></select>
  <button id="focusStart">Start</button>
  <button id="focusToggle" hidden>Pause</button>
  <button id="focusStop" hidden>Stop</button>
  <p id="focusToday"></p>
</body></html>`;

function sessionMock(calls) {
  const handlers = {};
  return {
    api: {
      start: (options) => {
        calls.push(["start", options]);
        return Promise.resolve({
          active: true, questTitle: options.questTitle,
          remainingMs: options.durationMs, durationMs: options.durationMs, paused: false,
        });
      },
      pause: () => { calls.push(["pause"]); return Promise.resolve({ active: true, paused: true, remainingMs: 1000, durationMs: 1000 }); },
      resume: () => { calls.push(["resume"]); return Promise.resolve({ active: true, paused: false, remainingMs: 1000, durationMs: 1000 }); },
      stop: () => { calls.push(["stop"]); return Promise.resolve({ active: false }); },
      get: () => Promise.resolve({ active: false }),
      onChange: (cb) => { handlers.change = cb; },
      onFinished: (cb) => { handlers.finished = cb; },
    },
    handlers,
  };
}

let focusCounter = 0;

async function bootFocus(quests, calls) {
  const dom = new JSDOM(FOCUS_HTML, { url: "http://localhost/" });
  const mock = sessionMock(calls || []);

  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  dom.window.session = mock.api;

  focusCounter += 1;
  const mod = await import(`../js/features/session.js?focus=${focusCounter}`);
  mod.initSession({ quests: () => quests, onEnded: () => {} });
  mod.renderFocusQuests();
  await new Promise((r) => setTimeout(r, 0));

  return { dom, doc: dom.window.document, mock, mod };
}

function quest(over) {
  return Object.assign({
    id: "q1", title: "GB Emulator", status: "in_progress",
  }, over || {});
}

function click(dom, el) {
  el.dispatchEvent(new dom.window.Event("click", { bubbles: true }));
}

test("the Focus tab opens idle, showing the chosen length", async () => {
  const { doc } = await bootFocus([]);

  assert.equal(doc.getElementById("focusClock").textContent, "25:00");
  assert.equal(doc.getElementById("focusStart").hidden, false);
  assert.equal(doc.getElementById("focusToggle").hidden, true);
  assert.equal(doc.getElementById("focusStop").hidden, true);
  assert.equal(doc.getElementById("focusDot").hidden, true);
});

test("picking a length changes the face before you start", async () => {
  const { dom, doc } = await bootFocus([]);

  click(dom, doc.querySelector('[data-minutes="50"]'));
  assert.equal(doc.getElementById("focusClock").textContent, "50:00");
  assert.equal(doc.querySelector('[data-minutes="50"]').classList.contains("active"), true);
  assert.equal(doc.querySelector('[data-minutes="25"]').classList.contains("active"), false);
});

test("the quest picker offers only what is already in flight", async () => {
  const quests = [
    quest({ id: "a", title: "Doing", status: "in_progress" }),
    quest({ id: "b", title: "Waiting", status: "backlog" }),
    quest({ id: "c", title: "Done", status: "shipped" }),
  ];
  const { doc } = await bootFocus(quests);

  const options = Array.from(doc.querySelectorAll("#focusQuest option")).map((o) => o.textContent);
  assert.deepEqual(options, ["Nothing in particular", "Doing"],
    "starting a quest belongs on the Quests tab, behind the WIP nudge");
});

test("starting sends the chosen quest and length to the timer", async () => {
  const calls = [];
  const { dom, doc } = await bootFocus([quest({ id: "a", title: "Doing" })], calls);

  doc.getElementById("focusQuest").value = "a";
  click(dom, doc.querySelector('[data-minutes="15"]'));
  click(dom, doc.getElementById("focusStart"));
  await new Promise((r) => setTimeout(r, 0));

  assert.deepEqual(calls, [["start", { questId: "a", questTitle: "Doing", durationMs: 15 * 60000 }]]);
});

test("a session with no quest attached is still a session", async () => {
  const calls = [];
  const { dom, doc } = await bootFocus([], calls);

  click(dom, doc.getElementById("focusStart"));
  await new Promise((r) => setTimeout(r, 0));

  assert.deepEqual(calls[0][1], { questId: null, questTitle: "", durationMs: 25 * 60000 });
});

test("a running session swaps the controls and locks the length", async () => {
  const { doc, mock } = await bootFocus([]);

  mock.handlers.change({ active: true, questTitle: "Doing", remainingMs: 90000, durationMs: 1500000, paused: false });

  assert.equal(doc.getElementById("focusClock").textContent, "01:30");
  assert.equal(doc.getElementById("focusTarget").textContent, "Doing");
  assert.equal(doc.getElementById("focusStart").hidden, true);
  assert.equal(doc.getElementById("focusToggle").hidden, false);
  assert.equal(doc.getElementById("focusStop").hidden, false);
  assert.equal(doc.getElementById("focusQuest").disabled, true);
  assert.ok(Array.from(doc.querySelectorAll("#focusLengths .chip")).every((c) => c.disabled));
});

test("the tab carries a dot while a session runs", async () => {
  const { doc, mock } = await bootFocus([]);

  mock.handlers.change({ active: true, questTitle: "X", remainingMs: 1000, durationMs: 1000, paused: false });
  assert.equal(doc.getElementById("focusDot").hidden, false);

  mock.handlers.change({ active: false });
  assert.equal(doc.getElementById("focusDot").hidden, true);
});

test("pausing offers resume and dims the clock", async () => {
  const { doc, mock } = await bootFocus([]);

  mock.handlers.change({ active: true, questTitle: "X", remainingMs: 90000, durationMs: 1500000, paused: true });

  assert.equal(doc.getElementById("focusToggle").textContent, "Resume");
  assert.ok(doc.getElementById("focusClock").classList.contains("is-paused"));
});

test("stopping ends the session and returns the face to the chosen length", async () => {
  const calls = [];
  const { dom, doc, mock } = await bootFocus([], calls);

  mock.handlers.change({ active: true, questTitle: "X", remainingMs: 1000, durationMs: 1000, paused: false });
  click(dom, doc.getElementById("focusStop"));
  await new Promise((r) => setTimeout(r, 0));

  assert.ok(calls.some((c) => c[0] === "stop"));
  assert.equal(doc.getElementById("focusClock").textContent, "25:00");
  assert.equal(doc.getElementById("focusStart").hidden, false);
});

test("today's tally counts only sessions that ended today", async () => {
  const { doc, mod } = await bootFocus([]);
  const now = Date.now();
  const yesterday = new Date(now - 30 * 3600000).toISOString();

  mod.renderToday([
    { startedAt: new Date(now - 25 * 60000).toISOString(), endedAt: new Date(now).toISOString() },
    { startedAt: new Date(now - 80 * 60000).toISOString(), endedAt: new Date(now - 30 * 60000).toISOString() },
    { startedAt: yesterday, endedAt: yesterday },
  ]);

  assert.match(doc.getElementById("focusToday").textContent, /Today: 2 sessions/);
  assert.match(doc.getElementById("focusToday").textContent, /1h 15m/);
});

test("no sessions today says so rather than showing a zero", async () => {
  const { doc, mod } = await bootFocus([]);
  mod.renderToday([]);
  assert.equal(doc.getElementById("focusToday").textContent, "No sessions yet today.");
});
