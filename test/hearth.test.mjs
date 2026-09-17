import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

const HEARTH_HTML = `
<div class="hearth-view" id="hearthView">
  <div class="bonfire" data-stage="0"></div>
  <p class="hearth-view-stage" data-bonfire-stage>Embers</p>
  <div class="hearth-view-session" id="hearthSession" hidden>
    <p id="hearthQuest"></p>
    <p id="hearthClock">--:--</p>
  </div>
  <div class="hearth-view-actions" id="hearthActions" hidden>
    <button id="hearthToggle">II</button>
    <button id="hearthStop">■</button>
  </div>
  <div class="hearth-view-progress"><span id="hearthBar"></span></div>
</div>`;

let moduleCounter = 0;

// Stubs the two bridges the hearth talks to and records what it asked for.
function setup(options) {
  options = options || {};
  const dom = new JSDOM(`<!doctype html><body>${HEARTH_HTML}</body>`, { url: "http://localhost/" });
  const win = dom.window;
  globalThis.window = win;
  globalThis.document = win.document;

  const calls = [];
  let view = options.view || { active: false };
  let modeListener = null;
  let sessionListener = null;

  win.windowControls = {
    expand: () => calls.push("expand"),
    collapse: () => calls.push("collapse"),
    minimize: () => calls.push("minimize"),
    close: () => calls.push("close"),
    hearthMenu: () => calls.push("menu"),
    dragStart: () => calls.push("drag-start"),
    dragMove: (dx, dy) => calls.push("drag-move " + dx + "," + dy),
    dragEnd: () => calls.push("drag-end"),
    getMode: () => Promise.resolve(options.mode || "board"),
    onModeChange: (cb) => { modeListener = cb; },
  };
  win.session = {
    get: () => Promise.resolve(view),
    pause: () => { calls.push("pause"); view = Object.assign({}, view, { paused: true }); return Promise.resolve(view); },
    resume: () => { calls.push("resume"); view = Object.assign({}, view, { paused: false }); return Promise.resolve(view); },
    stop: () => { calls.push("stop"); view = { active: false }; return Promise.resolve(view); },
    onChange: (cb) => { sessionListener = cb; },
  };

  moduleCounter += 1;
  return import(`../js/features/hearth.js?instance=${moduleCounter}`).then((mod) => {
    mod.initHearth();
    return new Promise((resolve) => setTimeout(() => resolve({
      dom, calls, mod,
      pushMode: (m) => modeListener(m),
      pushSession: (v) => sessionListener(v),
    }), 0));
  });
}

function dblclick(dom, el) {
  el.dispatchEvent(new dom.window.MouseEvent("dblclick", { bubbles: true }));
}

function pointer(dom, el, type, opts) {
  el.dispatchEvent(new dom.window.MouseEvent(type, Object.assign({ bubbles: true, button: 0 }, opts)));
}

const RUNNING = { active: true, questTitle: "Ship it", durationMs: 60000, remainingMs: 45000, paused: false };

test("mirrors the mode pushed by the main process onto the body", async () => {
  const { dom, pushMode } = await setup();
  const body = dom.window.document.body;
  assert.equal(body.getAttribute("data-mode"), "board");

  pushMode("hearth");
  assert.equal(body.getAttribute("data-mode"), "hearth");
  pushMode("board");
  assert.equal(body.getAttribute("data-mode"), "board");
});

test("starts in whatever mode the window already is", async () => {
  const { dom } = await setup({ mode: "hearth" });
  assert.equal(dom.window.document.body.getAttribute("data-mode"), "hearth");
});

test("a double-click on the face asks for the board, but not on a button", async () => {
  const { dom, calls } = await setup({ view: RUNNING });
  const doc = dom.window.document;

  dblclick(dom, doc.querySelector(".bonfire"));
  assert.deepEqual(calls, ["expand"]);

  dblclick(dom, doc.getElementById("hearthToggle"));
  assert.deepEqual(calls, ["expand"], "double-clicking pause must not expand");
});

test("at rest the face shows only the stage word; a session swaps in the clock", async () => {
  const { dom, pushSession } = await setup();
  const doc = dom.window.document;
  const view = doc.getElementById("hearthView");

  assert.equal(doc.getElementById("hearthSession").hidden, true);
  assert.equal(doc.getElementById("hearthActions").hidden, true);
  assert.ok(!view.classList.contains("session-running"));

  pushSession(RUNNING);
  assert.equal(doc.getElementById("hearthSession").hidden, false);
  assert.equal(doc.getElementById("hearthActions").hidden, false);
  assert.ok(view.classList.contains("session-running"));
  assert.equal(doc.getElementById("hearthQuest").textContent, "Ship it");
  assert.equal(doc.getElementById("hearthClock").textContent, "00:45");
  assert.equal(doc.getElementById("hearthBar").style.width, "25%");

  pushSession({ active: false });
  assert.equal(doc.getElementById("hearthSession").hidden, true);
  assert.equal(doc.getElementById("hearthBar").style.width, "0%");
});

test("pause and stop go straight to the session bridge", async () => {
  const { dom, calls } = await setup({ view: RUNNING });
  const doc = dom.window.document;
  const toggle = doc.getElementById("hearthToggle");

  toggle.click();
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(calls, ["pause"]);
  assert.equal(toggle.textContent, "▶");
  assert.ok(doc.getElementById("hearthView").classList.contains("is-paused"));

  toggle.click();
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(calls, ["pause", "resume"]);
  assert.equal(toggle.textContent, "II");

  doc.getElementById("hearthStop").click();
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(calls, ["pause", "resume", "stop"]);
  assert.equal(doc.getElementById("hearthSession").hidden, true);
});

test("survives a document without the hearth markup or the bridges", async () => {
  const dom = new JSDOM("<!doctype html><body><p>nothing</p></body>", { url: "http://localhost/" });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  moduleCounter += 1;
  const mod = await import(`../js/features/hearth.js?instance=${moduleCounter}`);
  assert.doesNotThrow(() => mod.initHearth());
});

test("dragging the face reports pointer deltas, coalesced to one move per frame", async () => {
  const { dom, calls } = await setup();
  const doc = dom.window.document;
  const fire = doc.querySelector(".bonfire");

  pointer(dom, fire, "pointerdown", { screenX: 100, screenY: 200 });
  // Two moves inside one frame: only the latest position is sent.
  pointer(dom, fire, "pointermove", { screenX: 110, screenY: 195 });
  pointer(dom, fire, "pointermove", { screenX: 130, screenY: 180 });
  await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual(calls, ["drag-start", "drag-move 30,-20"]);

  // Release flushes whatever is pending before ending, and later moves are ignored.
  pointer(dom, fire, "pointermove", { screenX: 140, screenY: 170 });
  pointer(dom, fire, "pointerup", { screenX: 140, screenY: 170 });
  pointer(dom, fire, "pointermove", { screenX: 500, screenY: 500 });
  await new Promise((r) => setTimeout(r, 30));

  assert.deepEqual(calls, ["drag-start", "drag-move 30,-20", "drag-move 40,-30", "drag-end"]);
});

test("a drag never starts from the pause/stop buttons or the right button", async () => {
  const { dom, calls } = await setup({ view: RUNNING });
  const doc = dom.window.document;

  pointer(dom, doc.getElementById("hearthToggle"), "pointerdown", { screenX: 0, screenY: 0 });
  pointer(dom, doc.querySelector(".bonfire"), "pointerdown", { screenX: 0, screenY: 0, button: 2 });
  assert.deepEqual(calls, []);
});

test("right-click asks the main process for the hearth menu", async () => {
  const { dom, calls } = await setup();
  const ev = new dom.window.MouseEvent("contextmenu", { bubbles: true, cancelable: true });
  dom.window.document.querySelector(".bonfire").dispatchEvent(ev);
  assert.deepEqual(calls, ["menu"]);
  assert.equal(ev.defaultPrevented, true);
});

test("Escape brings the board back, but only from the hearth", async () => {
  const { dom, calls, pushMode } = await setup();
  const key = () => dom.window.document.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

  key();
  assert.deepEqual(calls, [], "in board mode Escape is left to the modals");

  pushMode("hearth");
  key();
  assert.deepEqual(calls, ["expand"]);
});
