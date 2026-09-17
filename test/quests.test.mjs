import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { cardHtml } from "../js/features/quests.js";
import { initDetail } from "../js/ui/detail.js";
import { DETAIL_MODAL_HTML, GATE_MODAL_HTML, rowTexts } from "./detailFixture.mjs";
import { initGates } from "../js/features/gates.js";

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

test("cardHtml keeps hook and definition of done off the card", () => {
  const html = cardHtml({ id: "q3", title: "T", hook: "the hook", dod: "the dod", status: "backlog" });
  assert.ok(!html.includes("the hook"));
  assert.ok(!html.includes("the dod"));
  assert.ok(!html.includes("card-hook"));
  assert.ok(!html.includes('class="dod"'));
});

const FIXTURE_HTML = `<!doctype html><html><body>
  <div id="stats"></div>
  <input id="questSearch">
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
        <p id="questScopeNote" hidden></p>
        <input id="questTags">
        <textarea id="questDod"></textarea>
        <button type="button" id="questCancelBtn">Cancel</button>
        <button type="submit">Save</button>
      </form>
    </div>
  </div>
  ${DETAIL_MODAL_HTML}
  ${GATE_MODAL_HTML}
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
  return import(`../js/features/quests.js?instance=${moduleCounter}`);
}

function backlogQuest(over) {
  return Object.assign({
    id: "q1", title: "T", hook: "H", tier: "weekend", tags: [],
    dod: "D", status: "backlog", order: 1,
  }, over || {});
}

test("shipping asks whether the Definition of Done was met before it lands", async () => {
  const calls = [];
  const questLogMock = {
    updateQuest: (id, data) => { calls.push(["updateQuest", id, data]); return Promise.resolve({}); },
    listQuests: () => Promise.resolve([backlogQuest()]),
  };

  const dom = new JSDOM(FIXTURE_HTML, { url: "http://localhost/" });
  installGlobals(dom, questLogMock);

  const quests = await freshQuestsModule();
  initGates();
  quests.initQuests(() => {});
  await quests.loadQuests();

  const doc = dom.window.document;
  doc.querySelector('#board .status-btn[data-status="shipped"]')
    .dispatchEvent(new dom.window.Event("click", { bubbles: true }));

  assert.equal(doc.getElementById("shipModalOverlay").hidden, false, "the gate opens");
  assert.equal(doc.getElementById("shipDod").textContent, "D", "and shows what you said done meant");
  assert.deepEqual(calls, [], "nothing is written until you answer");

  doc.getElementById("shipConfirmBtn").dispatchEvent(new dom.window.Event("click", { bubbles: true }));

  assert.deepEqual(calls, [["updateQuest", "q1", { status: "shipped" }]]);
  assert.equal(doc.getElementById("shipModalOverlay").hidden, true);
});

test("answering \"not yet\" leaves the quest exactly where it was", async () => {
  const calls = [];
  const questLogMock = {
    updateQuest: (id, data) => { calls.push([id, data]); return Promise.resolve({}); },
    listQuests: () => Promise.resolve([backlogQuest()]),
  };

  const dom = new JSDOM(FIXTURE_HTML, { url: "http://localhost/" });
  installGlobals(dom, questLogMock);

  const quests = await freshQuestsModule();
  initGates();
  quests.initQuests(() => {});
  await quests.loadQuests();

  const doc = dom.window.document;
  doc.querySelector('#board .status-btn[data-status="shipped"]')
    .dispatchEvent(new dom.window.Event("click", { bubbles: true }));
  doc.getElementById("shipCancelBtn").dispatchEvent(new dom.window.Event("click", { bubbles: true }));

  assert.deepEqual(calls, []);
  assert.equal(doc.getElementById("shipModalOverlay").hidden, true);
});

test("a quest with no Definition of Done ships without a pointless dialog", async () => {
  const calls = [];
  const questLogMock = {
    updateQuest: (id, data) => { calls.push([id, data]); return Promise.resolve({}); },
    listQuests: () => Promise.resolve([backlogQuest({ dod: "" })]),
  };

  const dom = new JSDOM(FIXTURE_HTML, { url: "http://localhost/" });
  installGlobals(dom, questLogMock);

  const quests = await freshQuestsModule();
  initGates();
  quests.initQuests(() => {});
  await quests.loadQuests();

  const doc = dom.window.document;
  doc.querySelector('#board .status-btn[data-status="shipped"]')
    .dispatchEvent(new dom.window.Event("click", { bubbles: true }));

  assert.equal(doc.getElementById("shipModalOverlay").hidden, true);
  assert.deepEqual(calls, [["q1", { status: "shipped" }]]);
});

test("moving to backlog or in-progress needs no gate", async () => {
  const calls = [];
  const questLogMock = {
    updateQuest: (id, data) => { calls.push([id, data]); return Promise.resolve({}); },
    listQuests: () => Promise.resolve([backlogQuest()]),
  };

  const dom = new JSDOM(FIXTURE_HTML, { url: "http://localhost/" });
  installGlobals(dom, questLogMock);

  const quests = await freshQuestsModule();
  initGates();
  quests.initQuests(() => {});
  await quests.loadQuests();

  dom.window.document.querySelector('#board .status-btn[data-status="in_progress"]')
    .dispatchEvent(new dom.window.Event("click", { bubbles: true }));

  assert.deepEqual(calls, [["q1", { status: "in_progress" }]]);
});

test("bindQuestActions wires delete to confirm() + questLog.deleteQuest", async () => {
  const calls = [];
  const quest = { id: "q1", title: "T", hook: "H", tier: "weekend", tags: [], dod: "D", status: "backlog", order: 1 };
  const questLogMock = {
    deleteQuest: (id) => { calls.push(id); return Promise.resolve(); },
    listQuests: () => Promise.resolve([quest]),
  };

  const dom = new JSDOM(FIXTURE_HTML, { url: "http://localhost/" });
  installGlobals(dom, questLogMock);
  let confirmCalled = false;
  dom.window.confirm = () => { confirmCalled = true; return true; };

  const quests = await freshQuestsModule();
  initDetail();
  initGates();
  quests.initQuests(() => {});
  await quests.loadQuests();

  const doc = dom.window.document;
  doc.querySelector("#board .quest-card").dispatchEvent(new dom.window.Event("click", { bubbles: true }));
  doc.getElementById("detailDeleteBtn").dispatchEvent(new dom.window.Event("click", { bubbles: true }));

  assert.ok(confirmCalled);
  assert.deepEqual(calls, ["q1"]);
  assert.equal(doc.getElementById("detailModalOverlay").hidden, true, "a confirmed delete closes the modal");
});

test("bindQuestActions skips deleteQuest when confirm() is cancelled", async () => {
  const calls = [];
  const quest = { id: "q1", title: "T", hook: "H", tier: "weekend", tags: [], dod: "D", status: "backlog", order: 1 };
  const questLogMock = {
    deleteQuest: (id) => { calls.push(id); return Promise.resolve(); },
    listQuests: () => Promise.resolve([quest]),
  };

  const dom = new JSDOM(FIXTURE_HTML, { url: "http://localhost/" });
  installGlobals(dom, questLogMock);
  dom.window.confirm = () => false;

  const quests = await freshQuestsModule();
  initDetail();
  initGates();
  quests.initQuests(() => {});
  await quests.loadQuests();

  const doc = dom.window.document;
  doc.querySelector("#board .quest-card").dispatchEvent(new dom.window.Event("click", { bubbles: true }));
  doc.getElementById("detailDeleteBtn").dispatchEvent(new dom.window.Event("click", { bubbles: true }));

  assert.deepEqual(calls, []);
  assert.equal(doc.getElementById("detailModalOverlay").hidden, false, "a cancelled delete leaves you where you were");
});

test("cards carry no buttons at all — edit and delete live in the detail modal", async () => {
  const quest = { id: "q1", title: "Existing Quest", hook: "h", tier: "weekend", tags: ["Tag1"], dod: "d", status: "backlog", order: 1 };
  const questLogMock = { listQuests: () => Promise.resolve([quest]) };

  const dom = new JSDOM(FIXTURE_HTML, { url: "http://localhost/" });
  installGlobals(dom, questLogMock);

  const quests = await freshQuestsModule();
  initGates();
  quests.initQuests(() => {});
  await quests.loadQuests();

  const card = dom.window.document.querySelector("#board .quest-card");
  assert.ok(card, "expected a card to render");
  assert.equal(card.querySelector(".card-actions"), null);

  // Status pills are the only buttons a card should still carry.
  const buttons = Array.from(card.querySelectorAll("button"));
  assert.ok(buttons.length > 0);
  assert.ok(buttons.every((b) => b.classList.contains("status-btn")),
    "the only buttons left on a card are its status pills");
});

test("clicking a quest card opens the detail modal, and its Edit button opens the form", async () => {
  const quest = {
    id: "q1", title: "Existing Quest", hook: "hook text", tier: "weekend",
    tags: ["Tag1"], dod: "dod text", status: "backlog", order: 1,
  };
  const questLogMock = { listQuests: () => Promise.resolve([quest]) };

  const dom = new JSDOM(FIXTURE_HTML, { url: "http://localhost/" });
  installGlobals(dom, questLogMock);

  const quests = await freshQuestsModule();
  initDetail();
  initGates();
  quests.initQuests(() => {});
  await quests.loadQuests();

  const doc = dom.window.document;
  doc.querySelector(".quest-card").dispatchEvent(new dom.window.Event("click", { bubbles: true }));

  assert.equal(doc.getElementById("detailModalOverlay").hidden, false);
  assert.equal(doc.getElementById("detailTitle").textContent, "Existing Quest");
  assert.equal(doc.getElementById("detailText").textContent, "hook text");
  assert.deepEqual(rowTexts(doc), ["Done whendod text"]);
  assert.equal(doc.getElementById("detailTags").textContent, "Tag1");

  doc.getElementById("detailEditBtn").dispatchEvent(new dom.window.Event("click", { bubbles: true }));

  assert.equal(doc.getElementById("detailModalOverlay").hidden, true);
  assert.equal(doc.getElementById("questModalOverlay").hidden, false);
  assert.equal(doc.getElementById("questModalTitle").textContent, "Edit Quest");
  assert.equal(doc.getElementById("questTitle").value, "Existing Quest");
  assert.equal(doc.getElementById("questTags").value, "Tag1");
});

test("clicking a button on a quest card does not open the detail modal", async () => {
  const questLogMock = {
    listQuests: () => Promise.resolve([]),
    updateQuest: () => Promise.resolve({}),
  };

  const dom = new JSDOM(FIXTURE_HTML, { url: "http://localhost/" });
  installGlobals(dom, questLogMock);

  const quests = await freshQuestsModule();
  initDetail();
  initGates();
  quests.initQuests(() => {});

  const boardEl = dom.window.document.getElementById("board");
  boardEl.innerHTML = quests.cardHtml({ id: "q1", title: "T", hook: "H", dod: "D", status: "backlog" });
  quests.bindQuestActions(boardEl);

  boardEl.querySelector('.status-btn[data-status="shipped"]')
    .dispatchEvent(new dom.window.Event("click", { bubbles: true }));

  assert.equal(dom.window.document.getElementById("detailModalOverlay").hidden, true);
});

test("openCreateQuest opens the modal in create mode", async () => {
  const questLogMock = { listQuests: () => Promise.resolve([]) };

  const dom = new JSDOM(FIXTURE_HTML, { url: "http://localhost/" });
  installGlobals(dom, questLogMock);

  const quests = await freshQuestsModule();
  initGates();
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
  initGates();
  quests.initQuests(() => {});
  quests.openCreateQuest();

  const doc = dom.window.document;
  assert.equal(doc.getElementById("questModalOverlay").hidden, false);

  doc.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

  assert.equal(doc.getElementById("questModalOverlay").hidden, true);
});

// Clicking the backdrop closes; a click that lands inside the form must not,
// or picking a tag mid-edit would throw the whole form away.
test("only the backdrop closes the quest modal, not a click inside it", async () => {
  const questLogMock = { listQuests: () => Promise.resolve([]) };

  const dom = new JSDOM(FIXTURE_HTML, { url: "http://localhost/" });
  installGlobals(dom, questLogMock);

  const quests = await freshQuestsModule();
  initGates();
  quests.initQuests(() => {});
  quests.openCreateQuest();

  const doc = dom.window.document;
  const overlay = doc.getElementById("questModalOverlay");

  doc.getElementById("questTitle").dispatchEvent(new dom.window.Event("click", { bubbles: true }));
  assert.equal(overlay.hidden, false, "a click on a field stays open");

  overlay.dispatchEvent(new dom.window.Event("click", { bubbles: true }));
  assert.equal(overlay.hidden, true, "a click on the backdrop closes");
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
  initGates();
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


test("starting a fourth quest asks what you are actually working on", async () => {
  const calls = [];
  const inFlight = [1, 2, 3].map((n) => backlogQuest({
    id: "p" + n, title: "Flight " + n, status: "in_progress", order: n,
  }));
  const questLogMock = {
    updateQuest: (id, data) => { calls.push([id, data]); return Promise.resolve({}); },
    listQuests: () => Promise.resolve(inFlight.concat([backlogQuest({ id: "q9", order: 9 })])),
  };

  const dom = new JSDOM(FIXTURE_HTML, { url: "http://localhost/" });
  installGlobals(dom, questLogMock);

  const quests = await freshQuestsModule();
  initGates();
  quests.initQuests(() => {});
  await quests.loadQuests();

  const doc = dom.window.document;
  doc.querySelector('#board .quest-card[data-id="q9"] .status-btn[data-status="in_progress"]')
    .dispatchEvent(new dom.window.Event("click", { bubbles: true }));

  assert.equal(doc.getElementById("wipModalOverlay").hidden, false, "the nudge appears");
  assert.match(doc.getElementById("wipBody").textContent, /3 quests in flight/);
  assert.equal(doc.querySelectorAll("#wipList li").length, 3, "and names what is already open");
  assert.deepEqual(calls, [], "nothing moves until you choose");
});

test("the WIP nudge never blocks — start anyway just starts it", async () => {
  const calls = [];
  const inFlight = [1, 2, 3].map((n) => backlogQuest({
    id: "p" + n, title: "Flight " + n, status: "in_progress", order: n,
  }));
  const questLogMock = {
    updateQuest: (id, data) => { calls.push([id, data]); return Promise.resolve({}); },
    listQuests: () => Promise.resolve(inFlight.concat([backlogQuest({ id: "q9", order: 9 })])),
  };

  const dom = new JSDOM(FIXTURE_HTML, { url: "http://localhost/" });
  installGlobals(dom, questLogMock);

  const quests = await freshQuestsModule();
  initGates();
  quests.initQuests(() => {});
  await quests.loadQuests();

  const doc = dom.window.document;
  doc.querySelector('#board .quest-card[data-id="q9"] .status-btn[data-status="in_progress"]')
    .dispatchEvent(new dom.window.Event("click", { bubbles: true }));
  doc.getElementById("wipProceedBtn").dispatchEvent(new dom.window.Event("click", { bubbles: true }));

  assert.deepEqual(calls, [["q9", { status: "in_progress" }]]);
});

test("benching sends the open quests back to the backlog first", async () => {
  const calls = [];
  const inFlight = [1, 2, 3].map((n) => backlogQuest({
    id: "p" + n, title: "Flight " + n, status: "in_progress", order: n,
  }));
  const questLogMock = {
    updateQuest: (id, data) => { calls.push([id, data]); return Promise.resolve({}); },
    listQuests: () => Promise.resolve(inFlight.concat([backlogQuest({ id: "q9", order: 9 })])),
  };

  const dom = new JSDOM(FIXTURE_HTML, { url: "http://localhost/" });
  installGlobals(dom, questLogMock);

  const quests = await freshQuestsModule();
  initGates();
  quests.initQuests(() => {});
  await quests.loadQuests();

  const doc = dom.window.document;
  doc.querySelector('#board .quest-card[data-id="q9"] .status-btn[data-status="in_progress"]')
    .dispatchEvent(new dom.window.Event("click", { bubbles: true }));
  doc.getElementById("wipBenchBtn").dispatchEvent(new dom.window.Event("click", { bubbles: true }));

  await new Promise((r) => setTimeout(r, 0));

  assert.deepEqual(calls.slice(0, 3), [
    ["p1", { status: "backlog" }],
    ["p2", { status: "backlog" }],
    ["p3", { status: "backlog" }],
  ]);
  assert.deepEqual(calls[3], ["q9", { status: "in_progress" }]);
});

test("letting go moves a quest to Ashes rather than deleting it", async () => {
  const calls = [];
  const questLogMock = {
    updateQuest: (id, data) => { calls.push([id, data]); return Promise.resolve({}); },
    deleteQuest: () => { throw new Error("let go must never delete"); },
    listQuests: () => Promise.resolve([backlogQuest({ title: "Abandon me" })]),
  };

  const dom = new JSDOM(FIXTURE_HTML, { url: "http://localhost/" });
  installGlobals(dom, questLogMock);

  const quests = await freshQuestsModule();
  initDetail();
  initGates();
  quests.initQuests(() => {});
  await quests.loadQuests();

  const doc = dom.window.document;
  doc.querySelector("#board .quest-card").dispatchEvent(new dom.window.Event("click", { bubbles: true }));
  assert.equal(doc.getElementById("detailLetGoBtn").hidden, false);

  doc.getElementById("detailLetGoBtn").dispatchEvent(new dom.window.Event("click", { bubbles: true }));

  assert.deepEqual(calls, [["q1", { status: "let_go" }]]);
});

test("a quest already let go is not offered the let-go button again", async () => {
  const questLogMock = {
    listQuests: () => Promise.resolve([backlogQuest({ status: "let_go", finishedAt: new Date().toISOString() })]),
  };

  const dom = new JSDOM(FIXTURE_HTML, { url: "http://localhost/" });
  installGlobals(dom, questLogMock);

  const quests = await freshQuestsModule();
  initDetail();
  initGates();
  quests.initQuests(() => {});
  await quests.loadQuests();

  const doc = dom.window.document;
  doc.querySelector("#board .quest-card").dispatchEvent(new dom.window.Event("click", { bubbles: true }));

  assert.equal(doc.getElementById("detailLetGoBtn").hidden, true);
  assert.equal(doc.getElementById("detailDeleteBtn").hidden, false, "delete is still available");
});

test("let-go quests collect under Ashes, shipped ones under the Hall of Fame", async () => {
  const now = new Date().toISOString();
  const questLogMock = {
    listQuests: () => Promise.resolve([
      backlogQuest({ id: "a", title: "Shipped", status: "shipped", finishedAt: now, order: 1 }),
      backlogQuest({ id: "b", title: "Abandoned", status: "let_go", finishedAt: now, order: 2 }),
      backlogQuest({ id: "c", title: "Waiting", order: 3 }),
    ]),
  };

  const dom = new JSDOM(FIXTURE_HTML, { url: "http://localhost/" });
  installGlobals(dom, questLogMock);

  const quests = await freshQuestsModule();
  initGates();
  quests.initQuests(() => {});
  await quests.loadQuests();

  const doc = dom.window.document;
  const headings = Array.from(doc.querySelectorAll("#board .tier-title")).map((el) => el.textContent);
  assert.deepEqual(headings, ["Weekend", "Hall of Fame", "Ashes"]);

  const ashes = doc.querySelector("#board .ashes-tier");
  assert.equal(ashes.querySelector(".card-title").textContent, "Abandoned");
  assert.ok(ashes.querySelector(".quest-card").classList.contains("let-go-card"));
  assert.match(ashes.querySelector(".card-when").textContent, /Let go/);
});

test("search narrows by title, hook, dod and tags", async () => {
  const questLogMock = {
    listQuests: () => Promise.resolve([
      backlogQuest({ id: "a", title: "Emulator", hook: "gameboy", dod: "boots", tags: [], order: 1 }),
      backlogQuest({ id: "b", title: "Presskit", hook: "a site", dod: "deployed", tags: ["web"], order: 2 }),
    ]),
  };

  const dom = new JSDOM(FIXTURE_HTML, { url: "http://localhost/" });
  installGlobals(dom, questLogMock);

  const quests = await freshQuestsModule();
  initGates();
  quests.initQuests(() => {});
  await quests.loadQuests();

  const doc = dom.window.document;
  const titles = () => Array.from(doc.querySelectorAll("#board .card-title")).map((el) => el.textContent);
  const search = doc.getElementById("questSearch");

  const type = (value) => {
    search.value = value;
    search.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  };

  type("gameboy");
  assert.deepEqual(titles(), ["Emulator"], "matches the hook");

  type("deployed");
  assert.deepEqual(titles(), ["Presskit"], "matches the definition of done");

  type("web");
  assert.deepEqual(titles(), ["Presskit"], "matches a tag");

  type("PRESS");
  assert.deepEqual(titles(), ["Presskit"], "and ignores case");

  type("nothing here");
  assert.match(doc.getElementById("board").textContent, /Nothing matches that/);

  type("");
  assert.deepEqual(titles().sort(), ["Emulator", "Presskit"]);
});

test("tag chips stack: each one narrows further", async () => {
  const questLogMock = {
    listQuests: () => Promise.resolve([
      backlogQuest({ id: "a", title: "Both", tags: ["elixir", "web"], order: 1 }),
      backlogQuest({ id: "b", title: "Just elixir", tags: ["elixir"], order: 2 }),
      backlogQuest({ id: "c", title: "Just web", tags: ["web"], order: 3 }),
    ]),
  };

  const dom = new JSDOM(FIXTURE_HTML, { url: "http://localhost/" });
  installGlobals(dom, questLogMock);

  const quests = await freshQuestsModule();
  initGates();
  quests.initQuests(() => {});
  await quests.loadQuests();

  const doc = dom.window.document;
  const titles = () => Array.from(doc.querySelectorAll("#board .card-title")).map((el) => el.textContent);
  const chip = (name) => Array.from(doc.querySelectorAll("#filters .chip")).find((c) => c.textContent === name);
  const click = (el) => el.dispatchEvent(new dom.window.Event("click", { bubbles: true }));

  click(chip("elixir"));
  assert.deepEqual(titles().sort(), ["Both", "Just elixir"]);

  click(chip("web"));
  assert.deepEqual(titles(), ["Both"], "two tags means both, not either");

  click(chip("web"));
  assert.deepEqual(titles().sort(), ["Both", "Just elixir"], "clicking again removes it");

  click(chip("All"));
  assert.equal(titles().length, 3);
});

test("the quest form reports how long that scope has actually taken you", async () => {
  const day = 86400000;
  const questLogMock = {
    listQuests: () => Promise.resolve([
      backlogQuest({
        id: "a", status: "shipped", tier: "weekend",
        startedAt: new Date(Date.now() - 6 * day).toISOString(),
        finishedAt: new Date(Date.now() - 0 * day).toISOString(),
      }),
      backlogQuest({
        id: "b", status: "shipped", tier: "weekend",
        startedAt: new Date(Date.now() - 4 * day).toISOString(),
        finishedAt: new Date(Date.now() - 0 * day).toISOString(),
      }),
    ]),
  };

  const dom = new JSDOM(FIXTURE_HTML, { url: "http://localhost/" });
  installGlobals(dom, questLogMock);

  const quests = await freshQuestsModule();
  initGates();
  quests.initQuests(() => {});
  await quests.loadQuests();

  const doc = dom.window.document;
  doc.getElementById("addQuestBtn").dispatchEvent(new dom.window.Event("click", { bubbles: true }));

  const note = doc.getElementById("questScopeNote");
  assert.equal(note.hidden, false);
  assert.match(note.textContent, /5 days on average \(2 shipped\)/);
});

test("a scope with nothing shipped yet says nothing at all", async () => {
  const questLogMock = { listQuests: () => Promise.resolve([backlogQuest()]) };

  const dom = new JSDOM(FIXTURE_HTML, { url: "http://localhost/" });
  installGlobals(dom, questLogMock);

  const quests = await freshQuestsModule();
  initGates();
  quests.initQuests(() => {});
  await quests.loadQuests();

  const doc = dom.window.document;
  doc.getElementById("addQuestBtn").dispatchEvent(new dom.window.Event("click", { bubbles: true }));

  assert.equal(doc.getElementById("questScopeNote").hidden, true);
});

// Typing in the search box changes what is shown, not what exists. The full
// onChange rebuilds the focus picker and the home screen (and re-rolls the
// motd), so a filter change must take the narrower hook instead.
test("search and tag filters fire the filter hook, not the data-change hook", async () => {
  const questLogMock = {
    listQuests: () => Promise.resolve([backlogQuest({ tags: ["Elixir"] }), backlogQuest({ id: "q2", title: "Other" })]),
  };

  const dom = new JSDOM(FIXTURE_HTML, { url: "http://localhost/" });
  installGlobals(dom, questLogMock);

  const quests = await freshQuestsModule();
  let changes = 0;
  let filters = 0;
  quests.initQuests(() => { changes += 1; }, () => { filters += 1; });
  await quests.loadQuests();

  assert.equal(changes, 1, "loading is a data change");
  assert.equal(filters, 0);

  const doc = dom.window.document;
  const search = doc.getElementById("questSearch");
  search.value = "oth";
  search.dispatchEvent(new dom.window.Event("input", { bubbles: true }));

  assert.equal(filters, 1, "a keystroke only refilters");
  assert.equal(changes, 1, "and never counts as a data change");
  assert.equal(doc.querySelectorAll("#board .quest-card").length, 1);

  const chip = Array.from(doc.querySelectorAll("#filters .chip")).find((c) => c.textContent === "Elixir");
  chip.dispatchEvent(new dom.window.Event("click", { bubbles: true }));

  assert.equal(filters, 2);
  assert.equal(changes, 1);
});

test("initQuests with one callback uses it for filter changes too", async () => {
  const questLogMock = { listQuests: () => Promise.resolve([backlogQuest()]) };
  const dom = new JSDOM(FIXTURE_HTML, { url: "http://localhost/" });
  installGlobals(dom, questLogMock);

  const quests = await freshQuestsModule();
  let calls = 0;
  quests.initQuests(() => { calls += 1; });
  await quests.loadQuests();

  const search = dom.window.document.getElementById("questSearch");
  search.value = "x";
  search.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  assert.equal(calls, 2);
});
