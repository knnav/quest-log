// Boots the real inflight.html through the real js/inflight.js, the way
// app.test.mjs boots the board: a renamed element id in the panel's document
// fails here rather than in front of the user.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const INFLIGHT_HTML = fs.readFileSync(path.join(ROOT, "inflight.html"), "utf-8");

let moduleCounter = 0;

function memoryStorage() {
  const data = {};
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
  };
}

// Stubs the bridges the panel talks to and records what it asked for.
function setup(options) {
  options = options || {};
  const dom = new JSDOM(`<!doctype html><html><body>${INFLIGHT_HTML}</body></html>`, {
    url: "http://localhost/",
  });

  const win = dom.window;
  const calls = [];
  const heights = [];
  let dataListener = null;

  win.panel = {
    get: () => Promise.resolve(options.data || null),
    onData: (cb) => { dataListener = cb; },
    hide: () => calls.push("hide"),
    menu: () => calls.push("menu"),
    resize: (h) => heights.push(h),
  };
  win.windowControls = {
    expand: () => calls.push("expand"),
    dragStart: () => calls.push("drag-start"),
    dragMove: (dx, dy) => calls.push("drag-move " + dx + "," + dy),
    dragEnd: () => calls.push("drag-end"),
  };
  win.matchMedia = () => ({ matches: false, addEventListener() {} });

  globalThis.window = win;
  globalThis.document = win.document;
  globalThis.localStorage = memoryStorage();

  moduleCounter += 1;
  return import(`../js/inflight.js?instance=${moduleCounter}`).then(() => {
    return new Promise((resolve) => setTimeout(() => resolve({
      dom, calls, heights,
      doc: win.document,
      push: (data) => dataListener(data),
    }), 0));
  });
}

const rows = (doc) => Array.from(doc.querySelectorAll(".panel-row")).map((row) => ({
  kind: row.querySelector(".panel-kind").textContent,
  title: row.querySelector(".panel-row-title").textContent,
}));

const IN_FLIGHT = {
  rows: [
    { kind: "quest", title: "Ship the thing" },
    { kind: "task", title: "Water the plants" },
  ],
  hidden: 0,
};

test("draws the kind and title of everything pushed to it", async () => {
  const { doc, push } = await setup();
  push(IN_FLIGHT);

  assert.deepEqual(rows(doc), [
    { kind: "Quest", title: "Ship the thing" },
    { kind: "Task", title: "Water the plants" },
  ]);
  assert.equal(doc.getElementById("panelEmpty").hidden, true);
  // Tasks are marked apart from quests, or the two read as one list.
  assert.ok(doc.querySelectorAll(".panel-row")[1].querySelector(".panel-kind").classList.contains("task"));
});

test("whatever was pushed before it opened is drawn immediately", async () => {
  const { doc } = await setup({ data: IN_FLIGHT });
  assert.deepEqual(rows(doc).map((r) => r.title), ["Ship the thing", "Water the plants"]);
});

test("nothing in flight says so rather than showing an empty box", async () => {
  const { doc, push } = await setup();

  assert.equal(doc.getElementById("panelEmpty").hidden, false);
  assert.match(doc.getElementById("panelEmpty").textContent, /Nothing in flight/);

  push(IN_FLIGHT);
  assert.equal(doc.getElementById("panelEmpty").hidden, true);

  push({ rows: [], hidden: 0 });
  assert.equal(doc.getElementById("panelEmpty").hidden, false);
  assert.deepEqual(rows(doc), []);
});

test("a missing or broken push draws the empty state, not a blank panel", async () => {
  const { doc, push } = await setup({ data: IN_FLIGHT });

  push(null);
  assert.deepEqual(rows(doc), []);
  assert.equal(doc.getElementById("panelEmpty").hidden, false);
});

test("rows that did not fit are counted", async () => {
  const { doc, push } = await setup();
  push({ rows: [{ kind: "quest", title: "One" }], hidden: 3 });

  assert.equal(doc.querySelector(".panel-more").textContent, "+3 more");

  push({ rows: [{ kind: "quest", title: "One" }], hidden: 0 });
  assert.equal(doc.querySelector(".panel-more"), null, "no overflow, no line");
});

test("titles are escaped", async () => {
  const { doc, push } = await setup();
  push({ rows: [{ kind: "quest", title: '<img src=x onerror="boom">' }], hidden: 0 });

  assert.equal(doc.querySelector(".panel-row-title").textContent, '<img src=x onerror="boom">');
  assert.equal(doc.querySelector("#panelList img"), null);
});

test("the height is reported after every render, so the window can follow it", async () => {
  const { heights, push } = await setup();
  const before = heights.length;
  push(IN_FLIGHT);
  assert.ok(heights.length > before, "a render reports a height");
});

test("a double-click brings the board back, but not from the ×", async () => {
  const { doc, calls } = await setup({ data: IN_FLIGHT });
  const dblclick = (el) => el.dispatchEvent(new doc.defaultView.MouseEvent("dblclick", { bubbles: true }));

  dblclick(doc.querySelector(".panel-row-title"));
  assert.deepEqual(calls, ["expand"]);

  dblclick(doc.getElementById("panelClose"));
  assert.deepEqual(calls, ["expand"], "double-clicking the × must not expand");
});

test("the × hides the panel", async () => {
  const { doc, calls } = await setup();
  doc.getElementById("panelClose").click();
  assert.deepEqual(calls, ["hide"]);
});

test("right-click asks the main process for the panel menu", async () => {
  const { doc, calls } = await setup();
  const ev = new doc.defaultView.MouseEvent("contextmenu", { bubbles: true, cancelable: true });
  doc.getElementById("panel").dispatchEvent(ev);

  assert.deepEqual(calls, ["menu"]);
  assert.equal(ev.defaultPrevented, true);
});

test("the panel can be dragged, and reports the deltas like the hearth", async () => {
  const { doc, calls } = await setup({ data: IN_FLIGHT });
  const el = doc.getElementById("panel");
  const pointer = (type, opts) => el.dispatchEvent(
    new doc.defaultView.MouseEvent(type, Object.assign({ bubbles: true, button: 0 }, opts))
  );

  pointer("pointerdown", { screenX: 40, screenY: 60 });
  pointer("pointermove", { screenX: 55, screenY: 50 });
  pointer("pointerup", { screenX: 55, screenY: 50 });
  await new Promise((r) => setTimeout(r, 30));

  assert.deepEqual(calls, ["drag-start", "drag-move 15,-10", "drag-end"]);
});

test("survives a document without the panel markup or the bridges", async () => {
  const dom = new JSDOM("<!doctype html><body><p>nothing</p></body>", { url: "http://localhost/" });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  moduleCounter += 1;
  await assert.doesNotReject(() => import(`../js/inflight.js?instance=${moduleCounter}`));
});
