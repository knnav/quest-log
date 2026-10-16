// The In Flight list beside the hearth, drawn into the real index.html
// markup by the real js/features/inflight.js — with hearth.js wired over the
// same face, since the list is dragged, double-clicked and right-clicked with
// the fire. A renamed element id fails here rather than in front of the user.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const INDEX_HTML = fs.readFileSync(path.join(ROOT, "index.html"), "utf-8");

let moduleCounter = 0;

// Stubs the bridges the face talks to and records what it asked for.
function setup(options) {
  options = options || {};
  const dom = new JSDOM(`<!doctype html><html><body>${INDEX_HTML}</body></html>`, {
    url: "http://localhost/",
  });

  const win = dom.window;
  const calls = [];

  const heights = [];
  win.panel = { reportHeight: (h) => heights.push(h) };
  win.windowControls = {
    expand: () => calls.push("expand"),
    hearthMenu: () => calls.push("menu"),
    dragStart: () => calls.push("drag-start"),
    dragMove: (dx, dy) => calls.push("drag-move " + dx + "," + dy),
    dragEnd: () => calls.push("drag-end"),
    getMode: () => Promise.resolve("hearth"),
    onModeChange: () => {},
  };

  globalThis.window = win;
  globalThis.document = win.document;

  moduleCounter += 1;
  return Promise.all([
    import(`../js/features/hearth.js?instance=${moduleCounter}`),
    import(`../js/features/inflight.js?instance=${moduleCounter}`),
  ]).then(([hearth, inflight]) => {
    hearth.initHearth();
    inflight.initInFlight();
    if (options.data) inflight.renderInFlight(options.data);
    return new Promise((resolve) => setTimeout(() => resolve({
      dom, calls, heights,
      doc: win.document,
      push: inflight.renderInFlight,
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

test("a missing or broken render draws the empty state, not a blank list", async () => {
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

// ---- next up ----

const NEXT_UP = {
  rows: [{ kind: "quest", title: "Doing" }],
  nextUp: [{ kind: "quest", title: "Then this" }, { kind: "task", title: "And that" }],
  hidden: 0,
};

const nextUpRows = (doc) =>
  Array.from(doc.querySelectorAll("#panelNextUpList .panel-row-title")).map((el) => el.textContent);

test("next-up rows are drawn under their own heading, apart from what is in flight", async () => {
  const { doc, push } = await setup();
  push(NEXT_UP);

  const section = doc.getElementById("panelNextUp");
  assert.equal(section.hidden, false);
  assert.match(section.querySelector(".panel-subhead").textContent, /NEXT UP/);
  assert.deepEqual(nextUpRows(doc), ["Then this", "And that"]);
  assert.deepEqual(
    Array.from(doc.querySelectorAll("#panelList .panel-row-title")).map((el) => el.textContent),
    ["Doing"], "the in-flight list holds only what is in flight");
});

test("the next-up section is hidden when nothing is queued, and on a push without it", async () => {
  const { doc, push } = await setup();
  push(NEXT_UP);
  push({ rows: [{ kind: "quest", title: "Doing" }], nextUp: [], hidden: 0 });
  assert.equal(doc.getElementById("panelNextUp").hidden, true);
  assert.deepEqual(nextUpRows(doc), []);

  push(IN_FLIGHT);
  assert.equal(doc.getElementById("panelNextUp").hidden, true);
});

test("a queue with nothing in flight is not 'nothing in flight'", async () => {
  const { doc, push } = await setup();
  push({ rows: [], nextUp: [{ kind: "task", title: "Soon" }], hidden: 0 });

  assert.equal(doc.getElementById("panelEmpty").hidden, true);
  assert.equal(doc.getElementById("panelNextUp").hidden, false);
});

test("the overflow line sits under whichever list comes last", async () => {
  const { doc, push } = await setup();
  push({ rows: [{ kind: "quest", title: "One" }], nextUp: [{ kind: "task", title: "Two" }], hidden: 2 });
  assert.equal(doc.querySelector("#panelNextUpList .panel-more").textContent, "+2 more");
  assert.equal(doc.querySelector("#panelList .panel-more"), null);

  push({ rows: [{ kind: "quest", title: "One" }], nextUp: [], hidden: 1 });
  assert.equal(doc.querySelector("#panelList .panel-more").textContent, "+1 more");
  assert.equal(doc.querySelector("#panelNextUpList .panel-more"), null);
});

test("titles are escaped", async () => {
  const { doc, push } = await setup();
  push({ rows: [{ kind: "quest", title: '<img src=x onerror="boom">' }], hidden: 0 });

  assert.equal(doc.querySelector(".panel-row-title").textContent, '<img src=x onerror="boom">');
  assert.equal(doc.querySelector("#panelList img"), null);
});

test("a double-click on the list brings the board back", async () => {
  const { doc, calls } = await setup({ data: IN_FLIGHT });
  doc.querySelector(".panel-row-title").dispatchEvent(new doc.defaultView.MouseEvent("dblclick", { bubbles: true }));
  assert.deepEqual(calls, ["expand"]);
});

test("the list has no close button: the switch is the only way to turn it off", async () => {
  const { doc } = await setup({ data: IN_FLIGHT });
  assert.equal(doc.querySelector("#inflight button"), null);
});

test("the measured height is reported so the window can fit the rows", async () => {
  const { doc, heights, push } = await setup();
  Object.defineProperty(doc.getElementById("inflight"), "offsetHeight", { configurable: true, get: () => 150 });
  push(IN_FLIGHT);
  assert.equal(heights[heights.length - 1], 150);
});

test("a list that cannot be measured (hidden, or no layout) reports nothing", async () => {
  const { heights, push } = await setup();
  push(IN_FLIGHT);
  assert.deepEqual(heights, [], "jsdom has no layout, as a hidden list has no height");
});

test("right-click on the list opens the hearth's menu", async () => {
  const { doc, calls } = await setup();
  const ev = new doc.defaultView.MouseEvent("contextmenu", { bubbles: true, cancelable: true });
  doc.getElementById("inflight").dispatchEvent(ev);

  assert.deepEqual(calls, ["menu"]);
  assert.equal(ev.defaultPrevented, true);
});

test("the list drags the window like the fire does", async () => {
  const { doc, calls } = await setup({ data: IN_FLIGHT });
  const el = doc.getElementById("inflight");
  const pointer = (type, opts) => el.dispatchEvent(
    new doc.defaultView.MouseEvent(type, Object.assign({ bubbles: true, button: 0 }, opts))
  );

  pointer("pointerdown", { screenX: 40, screenY: 60 });
  pointer("pointermove", { screenX: 55, screenY: 50 });
  pointer("pointerup", { screenX: 55, screenY: 50 });
  await new Promise((r) => setTimeout(r, 30));

  assert.deepEqual(calls, ["drag-start", "drag-move 15,-10", "drag-end"]);
});

test("survives a document without the list markup or the bridges", async () => {
  const dom = new JSDOM("<!doctype html><body><p>nothing</p></body>", { url: "http://localhost/" });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  moduleCounter += 1;
  const mod = await import(`../js/features/inflight.js?instance=${moduleCounter}`);
  assert.doesNotThrow(() => { mod.initInFlight(); mod.renderInFlight({ rows: [{ kind: "quest", title: "x" }] }); });
});
