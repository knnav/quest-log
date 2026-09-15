import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { cardHtml } from "../js/quests.js";

test("cardHtml escapes text, renders tags, and marks the active status button", () => {
  const html = cardHtml({
    id: "q1",
    title: "<script>",
    hook: "do the thing",
    tags: ["Elixir", "Gaming"],
    dod: "ship it",
    status: "in_progress",
  });

  assert.ok(html.includes("&lt;script&gt;"), "title should be escaped");
  assert.ok(html.includes('data-id="q1"'));
  assert.ok(html.includes('<span class="tag">Elixir</span>'));
  assert.ok(html.includes('<span class="tag">Gaming</span>'));
  assert.match(html, /class="status-btn on in_progress"[^>]*data-status="in_progress"/);
  assert.doesNotMatch(html, /class="status-btn on backlog"/);
});

test("cardHtml renders no tags when the quest has none", () => {
  const html = cardHtml({ id: "q2", title: "T", hook: "H", dod: "D", status: "backlog" });
  assert.ok(html.includes('<div class="tags"></div>'));
});

const FIXTURE_HTML = `<!doctype html><html><body>
  <div id="stats"></div>
  <div id="filters"></div>
  <div id="board"></div>
  <button id="addQuestBtn">+ Add Quest</button>
  <div class="modal-overlay" id="questModalOverlay" hidden>
    <div class="modal">
      <h2 id="questModalTitle">Add Quest</h2>
      <form id="questForm">
        <input id="questTitle">
        <textarea id="questHook"></textarea>
        <select id="questTier">
          <option value="weekend">Tier 1</option>
          <option value="medium">Tier 2</option>
          <option value="ongoing">Tier 3</option>
        </select>
        <input id="questTags">
        <textarea id="questDod"></textarea>
        <button type="button" id="questCancelBtn">Cancel</button>
        <button type="submit">Save</button>
      </form>
    </div>
  </div>
</body></html>`;

let moduleCounter = 0;

function installGlobals(dom, questLogMock) {
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  dom.window.questLog = questLogMock;
  dom.window.confirm = () => true;
}

async function freshQuestsModule() {
  moduleCounter += 1;
  return import(`../js/quests.js?instance=${moduleCounter}`);
}

test("bindQuestActions wires a status button click to questLog.updateQuest", async () => {
  const calls = [];
  const questLogMock = {
    updateQuest: (id, data) => { calls.push(["updateQuest", id, data]); return Promise.resolve({}); },
    listQuests: () => Promise.resolve([]),
  };

  const dom = new JSDOM(FIXTURE_HTML, { url: "http://localhost/" });
  installGlobals(dom, questLogMock);

  const quests = await freshQuestsModule();
  quests.initQuests(() => {});

  const boardEl = dom.window.document.getElementById("board");
  boardEl.innerHTML = quests.cardHtml({ id: "q1", title: "T", hook: "H", dod: "D", status: "backlog" });
  quests.bindQuestActions(boardEl);

  const shipBtn = boardEl.querySelector('.status-btn[data-status="shipped"]');
  shipBtn.dispatchEvent(new dom.window.Event("click", { bubbles: true }));

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], ["updateQuest", "q1", { status: "shipped" }]);
});

test("bindQuestActions wires delete to confirm() + questLog.deleteQuest", async () => {
  const calls = [];
  const questLogMock = {
    deleteQuest: (id) => { calls.push(id); return Promise.resolve(); },
    listQuests: () => Promise.resolve([]),
  };

  const dom = new JSDOM(FIXTURE_HTML, { url: "http://localhost/" });
  installGlobals(dom, questLogMock);
  let confirmCalled = false;
  dom.window.confirm = () => { confirmCalled = true; return true; };

  const quests = await freshQuestsModule();
  quests.initQuests(() => {});

  const boardEl = dom.window.document.getElementById("board");
  boardEl.innerHTML = quests.cardHtml({ id: "q1", title: "T", hook: "H", dod: "D", status: "backlog" });
  quests.bindQuestActions(boardEl);

  boardEl.querySelector(".quest-delete-btn").dispatchEvent(new dom.window.Event("click", { bubbles: true }));

  assert.ok(confirmCalled);
  assert.deepEqual(calls, ["q1"]);
});

test("bindQuestActions skips deleteQuest when confirm() is cancelled", async () => {
  const calls = [];
  const questLogMock = {
    deleteQuest: (id) => { calls.push(id); return Promise.resolve(); },
    listQuests: () => Promise.resolve([]),
  };

  const dom = new JSDOM(FIXTURE_HTML, { url: "http://localhost/" });
  installGlobals(dom, questLogMock);
  dom.window.confirm = () => false;

  const quests = await freshQuestsModule();
  quests.initQuests(() => {});

  const boardEl = dom.window.document.getElementById("board");
  boardEl.innerHTML = quests.cardHtml({ id: "q1", title: "T", hook: "H", dod: "D", status: "backlog" });
  quests.bindQuestActions(boardEl);

  boardEl.querySelector(".quest-delete-btn").dispatchEvent(new dom.window.Event("click", { bubbles: true }));

  assert.deepEqual(calls, []);
});

test("loadQuests renders fetched quests and edit click prefills the modal", async () => {
  const quest = {
    id: "q1", title: "Existing Quest", hook: "hook text", tier: "weekend",
    tags: ["Tag1"], dod: "dod text", status: "backlog", order: 1,
  };
  const questLogMock = { listQuests: () => Promise.resolve([quest]) };

  const dom = new JSDOM(FIXTURE_HTML, { url: "http://localhost/" });
  installGlobals(dom, questLogMock);

  const quests = await freshQuestsModule();
  quests.initQuests(() => {});
  await quests.loadQuests();

  const doc = dom.window.document;
  const editBtn = doc.querySelector(".quest-edit-btn");
  assert.ok(editBtn, "expected an edit button to be rendered");

  editBtn.dispatchEvent(new dom.window.Event("click", { bubbles: true }));

  assert.equal(doc.getElementById("questModalOverlay").hidden, false);
  assert.equal(doc.getElementById("questModalTitle").textContent, "Edit Quest");
  assert.equal(doc.getElementById("questTitle").value, "Existing Quest");
  assert.equal(doc.getElementById("questTags").value, "Tag1");
});

test("openCreateQuest opens the modal in create mode", async () => {
  const questLogMock = { listQuests: () => Promise.resolve([]) };

  const dom = new JSDOM(FIXTURE_HTML, { url: "http://localhost/" });
  installGlobals(dom, questLogMock);

  const quests = await freshQuestsModule();
  quests.initQuests(() => {});

  quests.openCreateQuest();

  const doc = dom.window.document;
  assert.equal(doc.getElementById("questModalOverlay").hidden, false);
  assert.equal(doc.getElementById("questModalTitle").textContent, "Add Quest");
  assert.equal(doc.getElementById("questTitle").value, "");
});

test("Escape closes an open quest modal", async () => {
  const questLogMock = { listQuests: () => Promise.resolve([]) };

  const dom = new JSDOM(FIXTURE_HTML, { url: "http://localhost/" });
  installGlobals(dom, questLogMock);

  const quests = await freshQuestsModule();
  quests.initQuests(() => {});
  quests.openCreateQuest();

  const doc = dom.window.document;
  assert.equal(doc.getElementById("questModalOverlay").hidden, false);

  doc.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

  assert.equal(doc.getElementById("questModalOverlay").hidden, true);
});

test("submitting the Add Quest form calls questLog.createQuest with parsed fields", async () => {
  const calls = [];
  const questLogMock = {
    listQuests: () => Promise.resolve([]),
    createQuest: (data) => { calls.push(data); return Promise.resolve({ id: "new-id", ...data }); },
  };

  const dom = new JSDOM(FIXTURE_HTML, { url: "http://localhost/" });
  installGlobals(dom, questLogMock);

  const quests = await freshQuestsModule();
  quests.initQuests(() => {});
  await quests.loadQuests();

  const doc = dom.window.document;
  doc.getElementById("addQuestBtn").dispatchEvent(new dom.window.Event("click", { bubbles: true }));
  assert.equal(doc.getElementById("questModalOverlay").hidden, false);

  doc.getElementById("questTitle").value = "New Quest";
  doc.getElementById("questHook").value = "New hook";
  doc.getElementById("questTier").value = "medium";
  doc.getElementById("questTags").value = "one, two ,  three";
  doc.getElementById("questDod").value = "New dod";

  doc.getElementById("questForm").dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    title: "New Quest",
    hook: "New hook",
    tier: "medium",
    tags: ["one", "two", "three"],
    dod: "New dod",
  });
});
