import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { sideQuestCardHtml } from "../js/sideQuests.js";
import { initDetail } from "../js/detail.js";
import { DETAIL_MODAL_HTML } from "./detailFixture.mjs";

test("sideQuestCardHtml escapes text and marks the active status button", () => {
  const html = sideQuestCardHtml({
    id: "s1",
    title: "<script>",
    note: "a & b",
    status: "in_progress",
  });

  assert.ok(html.includes("&lt;script&gt;"), "title should be escaped");
  assert.ok(html.includes('data-id="s1"'));
  assert.match(html, /class="status-btn side-quest-status-btn on in_progress"[^>]*data-status="in_progress"/);
  assert.doesNotMatch(html, /side-quest-status-btn on backlog/);
});

test("sideQuestCardHtml offers Done rather than Shipped as the third status", () => {
  const html = sideQuestCardHtml({ id: "s2", title: "T", status: "done" });

  assert.ok(html.includes('data-status="done"'));
  assert.ok(!html.includes('data-status="shipped"'));
  assert.match(html, /class="status-btn side-quest-status-btn on done"/);
});

test("sideQuestCardHtml keeps the note off the card", () => {
  const html = sideQuestCardHtml({ id: "s3", title: "Has note", note: "the note", status: "backlog" });
  assert.ok(!html.includes("the note"));
  assert.ok(!html.includes("card-hook"));
});

const FIXTURE_HTML = `<!doctype html><html><body>
  <button id="addSideQuestBtn">+ Create Side Quest</button>
  <div id="sideQuestGrid"></div>
  <div class="modal-overlay" id="sideQuestModalOverlay" hidden>
    <div class="modal">
      <h2 id="sideQuestModalTitle">Create Side Quest</h2>
      <form id="sideQuestForm">
        <input id="sideQuestTitle">
        <textarea id="sideQuestNote"></textarea>
        <button type="button" id="sideQuestCancelBtn">Cancel</button>
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
  dom.window.confirm = () => true;
}

async function freshSideQuestsModule() {
  moduleCounter += 1;
  return import(`../js/sideQuests.js?instance=${moduleCounter}`);
}

test("bindSideQuestActions wires a status click to questLog.updateSideQuest", async () => {
  const calls = [];
  const questLogMock = {
    updateSideQuest: (id, data) => { calls.push([id, data]); return Promise.resolve({}); },
    listSideQuests: () => Promise.resolve([]),
  };

  const dom = new JSDOM(FIXTURE_HTML, { url: "http://localhost/" });
  installGlobals(dom, questLogMock);

  const sideQuests = await freshSideQuestsModule();
  sideQuests.initSideQuests(() => {});

  const grid = dom.window.document.getElementById("sideQuestGrid");
  grid.innerHTML = sideQuests.sideQuestCardHtml({ id: "s1", title: "T", status: "backlog" });
  sideQuests.bindSideQuestActions(grid);

  grid.querySelector('.side-quest-status-btn[data-status="done"]')
    .dispatchEvent(new dom.window.Event("click", { bubbles: true }));

  assert.deepEqual(calls, [["s1", { status: "done" }]]);
});

test("bindSideQuestActions wires delete to confirm() + questLog.deleteSideQuest", async () => {
  const calls = [];
  const sideQuest = { id: "s1", title: "T", note: "", status: "backlog", order: 1 };
  const questLogMock = {
    deleteSideQuest: (id) => { calls.push(id); return Promise.resolve(); },
    listSideQuests: () => Promise.resolve([sideQuest]),
  };

  const dom = new JSDOM(FIXTURE_HTML, { url: "http://localhost/" });
  installGlobals(dom, questLogMock);

  const sideQuests = await freshSideQuestsModule();
  initDetail();
  sideQuests.initSideQuests(() => {});
  await sideQuests.loadSideQuests();

  const doc = dom.window.document;
  const grid = doc.getElementById("sideQuestGrid");
  grid.innerHTML = sideQuests.getSideQuestsByStatus("backlog").map(sideQuests.sideQuestCardHtml).join("");
  sideQuests.bindSideQuestActions(grid);

  grid.querySelector(".side-quest-card").dispatchEvent(new dom.window.Event("click", { bubbles: true }));
  doc.getElementById("detailDeleteBtn").dispatchEvent(new dom.window.Event("click", { bubbles: true }));

  assert.deepEqual(calls, ["s1"]);
});

test("bindSideQuestActions skips deleteSideQuest when confirm() is cancelled", async () => {
  const calls = [];
  const sideQuest = { id: "s1", title: "T", note: "", status: "backlog", order: 1 };
  const questLogMock = {
    deleteSideQuest: (id) => { calls.push(id); return Promise.resolve(); },
    listSideQuests: () => Promise.resolve([sideQuest]),
  };

  const dom = new JSDOM(FIXTURE_HTML, { url: "http://localhost/" });
  installGlobals(dom, questLogMock);
  dom.window.confirm = () => false;

  const sideQuests = await freshSideQuestsModule();
  initDetail();
  sideQuests.initSideQuests(() => {});
  await sideQuests.loadSideQuests();

  const doc = dom.window.document;
  const grid = doc.getElementById("sideQuestGrid");
  grid.innerHTML = sideQuests.getSideQuestsByStatus("backlog").map(sideQuests.sideQuestCardHtml).join("");
  sideQuests.bindSideQuestActions(grid);

  grid.querySelector(".side-quest-card").dispatchEvent(new dom.window.Event("click", { bubbles: true }));
  doc.getElementById("detailDeleteBtn").dispatchEvent(new dom.window.Event("click", { bubbles: true }));

  assert.deepEqual(calls, []);
});

test("clicking a side quest card shows the note in the detail modal", async () => {
  const questLogMock = {
    listSideQuests: () => Promise.resolve([{ id: "s1", title: "Fix the thing", note: "a & b", status: "backlog", order: 1 }]),
  };

  const dom = new JSDOM(FIXTURE_HTML, { url: "http://localhost/" });
  installGlobals(dom, questLogMock);

  const sideQuests = await freshSideQuestsModule();
  initDetail();
  sideQuests.initSideQuests(() => {});
  await sideQuests.loadSideQuests();

  const doc = dom.window.document;
  const grid = doc.getElementById("sideQuestGrid");
  grid.innerHTML = sideQuests.getSideQuestsByStatus("backlog").map(sideQuests.sideQuestCardHtml).join("");
  sideQuests.bindSideQuestActions(grid);

  grid.querySelector(".side-quest-card").dispatchEvent(new dom.window.Event("click", { bubbles: true }));

  assert.equal(doc.getElementById("detailModalOverlay").hidden, false);
  assert.equal(doc.getElementById("detailTitle").textContent, "Fix the thing");
  assert.equal(doc.getElementById("detailText").textContent, "a & b");
  assert.equal(doc.getElementById("detailTags").hidden, true);
});

test("a side quest with no note still opens a detail modal", async () => {
  const questLogMock = {
    listSideQuests: () => Promise.resolve([{ id: "s1", title: "Bare", status: "backlog", order: 1 }]),
  };

  const dom = new JSDOM(FIXTURE_HTML, { url: "http://localhost/" });
  installGlobals(dom, questLogMock);

  const sideQuests = await freshSideQuestsModule();
  initDetail();
  sideQuests.initSideQuests(() => {});
  await sideQuests.loadSideQuests();

  const doc = dom.window.document;
  const grid = doc.getElementById("sideQuestGrid");
  grid.innerHTML = sideQuests.getSideQuestsByStatus("backlog").map(sideQuests.sideQuestCardHtml).join("");
  sideQuests.bindSideQuestActions(grid);

  grid.querySelector(".side-quest-card").dispatchEvent(new dom.window.Event("click", { bubbles: true }));

  assert.equal(doc.getElementById("detailModalOverlay").hidden, false);
  assert.equal(doc.getElementById("detailText").textContent, "Nothing written down yet.");
});

test("getSideQuestsByStatus splits loaded side quests by status, ordered", async () => {
  const questLogMock = {
    listSideQuests: () => Promise.resolve([
      { id: "b", title: "Backlog one", status: "backlog", order: 2 },
      { id: "a", title: "Backlog two", status: "backlog", order: 1 },
      { id: "c", title: "Active", status: "in_progress", order: 1 },
      { id: "d", title: "Finished", status: "done", order: 1 },
    ]),
  };

  const dom = new JSDOM(FIXTURE_HTML, { url: "http://localhost/" });
  installGlobals(dom, questLogMock);

  const sideQuests = await freshSideQuestsModule();
  let changeCount = 0;
  sideQuests.initSideQuests(() => { changeCount += 1; });
  await sideQuests.loadSideQuests();

  assert.equal(changeCount, 1);
  assert.deepEqual(sideQuests.getSideQuestsByStatus("backlog").map((s) => s.id), ["a", "b"]);
  assert.deepEqual(sideQuests.getSideQuestsByStatus("in_progress").map((s) => s.id), ["c"]);
  assert.deepEqual(sideQuests.getSideQuestsByStatus("done").map((s) => s.id), ["d"]);
});

test("the detail modal's Edit button prefills the form with the existing title and note", async () => {
  const sideQuest = { id: "s1", title: "Water the plants", note: "Balcony one too", status: "backlog", order: 1 };
  const questLogMock = { listSideQuests: () => Promise.resolve([sideQuest]) };

  const dom = new JSDOM(FIXTURE_HTML, { url: "http://localhost/" });
  installGlobals(dom, questLogMock);

  const sideQuests = await freshSideQuestsModule();
  initDetail();
  sideQuests.initSideQuests(() => {});
  await sideQuests.loadSideQuests();

  const doc = dom.window.document;
  const grid = doc.getElementById("sideQuestGrid");
  grid.innerHTML = sideQuests.getSideQuestsByStatus("backlog").map(sideQuests.sideQuestCardHtml).join("");
  sideQuests.bindSideQuestActions(grid);

  const buttons = Array.from(grid.querySelectorAll(".side-quest-card button"));
  assert.ok(buttons.every((b) => b.classList.contains("status-btn")),
    "the only buttons left on a card are its status pills");

  grid.querySelector(".side-quest-card").dispatchEvent(new dom.window.Event("click", { bubbles: true }));
  doc.getElementById("detailEditBtn").dispatchEvent(new dom.window.Event("click", { bubbles: true }));

  assert.equal(doc.getElementById("sideQuestModalOverlay").hidden, false);
  assert.equal(doc.getElementById("sideQuestModalTitle").textContent, "Edit Side Quest");
  assert.equal(doc.getElementById("sideQuestTitle").value, "Water the plants");
  assert.equal(doc.getElementById("sideQuestNote").value, "Balcony one too");
});

test("openCreateSideQuest opens the modal in create mode", async () => {
  const questLogMock = { listSideQuests: () => Promise.resolve([]) };

  const dom = new JSDOM(FIXTURE_HTML, { url: "http://localhost/" });
  installGlobals(dom, questLogMock);

  const sideQuests = await freshSideQuestsModule();
  sideQuests.initSideQuests(() => {});

  sideQuests.openCreateSideQuest();

  const doc = dom.window.document;
  assert.equal(doc.getElementById("sideQuestModalOverlay").hidden, false);
  assert.equal(doc.getElementById("sideQuestModalTitle").textContent, "Create Side Quest");
  assert.equal(doc.getElementById("sideQuestTitle").value, "");
});

test("Escape closes an open side quest modal", async () => {
  const questLogMock = { listSideQuests: () => Promise.resolve([]) };

  const dom = new JSDOM(FIXTURE_HTML, { url: "http://localhost/" });
  installGlobals(dom, questLogMock);

  const sideQuests = await freshSideQuestsModule();
  sideQuests.initSideQuests(() => {});
  sideQuests.openCreateSideQuest();

  const doc = dom.window.document;
  assert.equal(doc.getElementById("sideQuestModalOverlay").hidden, false);

  doc.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

  assert.equal(doc.getElementById("sideQuestModalOverlay").hidden, true);
});

test("submitting the create form calls questLog.createSideQuest with title and note", async () => {
  const calls = [];
  const questLogMock = {
    listSideQuests: () => Promise.resolve([]),
    createSideQuest: (data) => { calls.push(data); return Promise.resolve({ id: "new", ...data }); },
  };

  const dom = new JSDOM(FIXTURE_HTML, { url: "http://localhost/" });
  installGlobals(dom, questLogMock);

  const sideQuests = await freshSideQuestsModule();
  sideQuests.initSideQuests(() => {});
  await sideQuests.loadSideQuests();

  const doc = dom.window.document;
  doc.getElementById("addSideQuestBtn").dispatchEvent(new dom.window.Event("click", { bubbles: true }));

  assert.equal(doc.getElementById("sideQuestModalOverlay").hidden, false);
  assert.equal(doc.getElementById("sideQuestModalTitle").textContent, "Create Side Quest");

  doc.getElementById("sideQuestTitle").value = "  Take out bins  ";
  doc.getElementById("sideQuestNote").value = "  Before 8pm  ";
  doc.getElementById("sideQuestForm").dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));

  assert.deepEqual(calls, [{ title: "Take out bins", note: "Before 8pm" }]);
});
