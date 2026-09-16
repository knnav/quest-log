import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { pinnedCardHtml } from "../js/pinned.js";
import { initDetail } from "../js/detail.js";
import { DETAIL_MODAL_HTML, rowTexts } from "./detailFixture.mjs";

test("pinnedCardHtml keeps status/next/todo off the card", () => {
  const html = pinnedCardHtml({ id: "p1", title: "Repo", status: "S", next: "N", todo: "T", state: "shipped" });
  assert.ok(!html.includes("<b>Status</b>"));
  assert.ok(!html.includes("<b>Next</b>"));
  assert.ok(!html.includes("<b>To-do</b>"));
  assert.match(html, /class="status-btn pinned-status-btn on shipped"/);
});

test("pinnedCardHtml escapes the title and defaults state to in_progress", () => {
  const html = pinnedCardHtml({ id: "p3", title: "<img>" });
  assert.ok(html.includes("&lt;img&gt;"));
  assert.match(html, /class="status-btn pinned-status-btn on in_progress"/);
});

const FIXTURE_HTML = `<!doctype html><html><body>
  <div id="progressGrid"></div>
  <div class="modal-overlay" id="pinnedModalOverlay" hidden>
    <div class="modal">
      <form id="pinnedForm">
        <input id="pinnedStatus">
        <input id="pinnedNext">
        <textarea id="pinnedTodo"></textarea>
        <button type="button" id="pinnedCancelBtn">Cancel</button>
        <button type="submit">Save</button>
      </form>
    </div>
  </div>
  ${DETAIL_MODAL_HTML}
</body></html>`;

let moduleCounter = 0;

function installGlobals(dom, questLogMock) {
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  dom.window.questLog = questLogMock;
}

async function freshPinnedModule() {
  moduleCounter += 1;
  return import(`../js/pinned.js?instance=${moduleCounter}`);
}

test("bindPinnedActions wires a status click to questLog.updatePinned", async () => {
  const calls = [];
  const questLogMock = {
    updatePinned: (id, data) => { calls.push([id, data]); return Promise.resolve({}); },
    listPinned: () => Promise.resolve([]),
  };

  const dom = new JSDOM(FIXTURE_HTML, { url: "http://localhost/" });
  installGlobals(dom, questLogMock);

  const pinned = await freshPinnedModule();
  pinned.initPinned(() => {});

  const grid = dom.window.document.getElementById("progressGrid");
  grid.innerHTML = pinned.pinnedCardHtml({ id: "gb-emulator", title: "GB", state: "backlog" });
  pinned.bindPinnedActions(grid);

  grid.querySelector('.pinned-status-btn[data-status="shipped"]')
    .dispatchEvent(new dom.window.Event("click", { bubbles: true }));

  assert.deepEqual(calls, [["gb-emulator", { state: "shipped" }]]);
});

test("loadPinned reports the fetched repos and renders cards without an edit button", async () => {
  const repo = {
    id: "gb-emulator", title: "GB Emulator", status: "active",
    next: "polish", todo: "fix bug", state: "in_progress", order: 1,
  };
  const questLogMock = { listPinned: () => Promise.resolve([repo]) };

  const dom = new JSDOM(FIXTURE_HTML, { url: "http://localhost/" });
  installGlobals(dom, questLogMock);

  const pinned = await freshPinnedModule();
  let changeCount = 0;
  pinned.initPinned(() => { changeCount += 1; });
  await pinned.loadPinned();

  assert.equal(changeCount, 1);
  assert.deepEqual(pinned.getPinnedList().map((p) => p.id), ["gb-emulator"]);

  const grid = dom.window.document.getElementById("progressGrid");
  grid.innerHTML = pinned.getPinnedList().map(pinned.pinnedCardHtml).join("");

  assert.equal(grid.querySelector(".icon-btn"), null);
});

test("clicking a pinned card shows status/next/todo in the detail modal", async () => {
  const repo = {
    id: "gb-emulator", title: "GB Emulator", status: "active",
    next: "polish", todo: "fix bug", state: "in_progress", order: 1,
  };
  const questLogMock = { listPinned: () => Promise.resolve([repo]) };

  const dom = new JSDOM(FIXTURE_HTML, { url: "http://localhost/" });
  installGlobals(dom, questLogMock);

  const pinned = await freshPinnedModule();
  initDetail();
  pinned.initPinned(() => {});
  await pinned.loadPinned();

  const doc = dom.window.document;
  const grid = doc.getElementById("progressGrid");
  grid.innerHTML = pinned.getPinnedList().map(pinned.pinnedCardHtml).join("");
  pinned.bindPinnedActions(grid);

  grid.querySelector(".pinned-card").dispatchEvent(new dom.window.Event("click", { bubbles: true }));

  assert.equal(doc.getElementById("detailModalOverlay").hidden, false);
  assert.equal(doc.getElementById("detailTitle").textContent, "GB Emulator");
  assert.deepEqual(rowTexts(doc), ["Statusactive", "Nextpolish", "To-dofix bug"]);

  doc.getElementById("detailEditBtn").dispatchEvent(new dom.window.Event("click", { bubbles: true }));

  assert.equal(doc.getElementById("detailModalOverlay").hidden, true);
  assert.equal(doc.getElementById("pinnedModalOverlay").hidden, false);
  assert.equal(doc.getElementById("pinnedStatus").value, "active");
});

test("a pinned card with only some fields set shows just those rows", async () => {
  const repo = { id: "gb-emulator", title: "GB Emulator", next: "polish", state: "in_progress", order: 1 };
  const questLogMock = { listPinned: () => Promise.resolve([repo]) };

  const dom = new JSDOM(FIXTURE_HTML, { url: "http://localhost/" });
  installGlobals(dom, questLogMock);

  const pinned = await freshPinnedModule();
  initDetail();
  pinned.initPinned(() => {});
  await pinned.loadPinned();

  const doc = dom.window.document;
  const grid = doc.getElementById("progressGrid");
  grid.innerHTML = pinned.getPinnedList().map(pinned.pinnedCardHtml).join("");
  pinned.bindPinnedActions(grid);

  grid.querySelector(".pinned-card").dispatchEvent(new dom.window.Event("click", { bubbles: true }));

  assert.deepEqual(rowTexts(doc), ["Nextpolish"]);
});

test("submitting the pinned form calls questLog.updatePinned with the edited fields", async () => {
  const calls = [];
  const repo = { id: "gb-emulator", title: "GB Emulator", status: "old", next: "", todo: "", state: "in_progress", order: 1 };
  const questLogMock = {
    listPinned: () => Promise.resolve([repo]),
    updatePinned: (id, data) => { calls.push([id, data]); return Promise.resolve({ ...repo, ...data }); },
  };

  const dom = new JSDOM(FIXTURE_HTML, { url: "http://localhost/" });
  installGlobals(dom, questLogMock);

  const pinned = await freshPinnedModule();
  initDetail();
  pinned.initPinned(() => {});
  await pinned.loadPinned();

  const grid = dom.window.document.getElementById("progressGrid");
  grid.innerHTML = pinned.getPinnedList().map(pinned.pinnedCardHtml).join("");
  pinned.bindPinnedActions(grid);

  const doc = dom.window.document;
  grid.querySelector(".pinned-card").dispatchEvent(new dom.window.Event("click", { bubbles: true }));
  doc.getElementById("detailEditBtn").dispatchEvent(new dom.window.Event("click", { bubbles: true }));

  doc.getElementById("pinnedStatus").value = "new status";
  doc.getElementById("pinnedNext").value = "new next";
  doc.getElementById("pinnedTodo").value = "new todo";
  doc.getElementById("pinnedForm").dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));

  assert.deepEqual(calls, [["gb-emulator", { status: "new status", next: "new next", todo: "new todo" }]]);
});
