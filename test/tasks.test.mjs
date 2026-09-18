import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { taskCardHtml } from "../js/features/tasks.js";
import { initDetail } from "../js/ui/detail.js";
import { DETAIL_MODAL_HTML } from "./detailFixture.mjs";

test("taskCardHtml escapes text and marks the active status button", () => {
  const html = taskCardHtml({
    id: "s1",
    title: "<script>",
    note: "a & b",
    status: "in_progress",
  });

  assert.ok(html.includes("&lt;script&gt;"), "title should be escaped");
  assert.ok(html.includes('data-id="s1"'));
  assert.match(html, /class="status-btn task-status-btn on in_progress"[^>]*data-status="in_progress"/);
  assert.doesNotMatch(html, /task-status-btn on backlog/);
});

test("taskCardHtml offers Done rather than Shipped as the third status", () => {
  const html = taskCardHtml({ id: "s2", title: "T", status: "done" });

  assert.ok(html.includes('data-status="done"'));
  assert.ok(!html.includes('data-status="shipped"'));
  assert.match(html, /class="status-btn task-status-btn on done"/);
});

test("taskCardHtml keeps the note off the card", () => {
  const html = taskCardHtml({ id: "s3", title: "Has note", note: "the note", status: "backlog" });
  assert.ok(!html.includes("the note"));
  assert.ok(!html.includes("card-hook"));
});

const FIXTURE_HTML = `<!doctype html><html><body>
  <button id="addTaskBtn">+ Create Task</button>
  <div id="taskGrid"></div>
  <div class="modal-overlay" id="taskModalOverlay" hidden>
    <div class="modal">
      <h2 id="taskModalTitle">Create Task</h2>
      <form id="taskForm">
        <input id="taskTitle">
        <textarea id="taskNote"></textarea>
        <button type="button" id="taskCancelBtn">Cancel</button>
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

async function freshTasksModule() {
  moduleCounter += 1;
  return import(`../js/features/tasks.js?instance=${moduleCounter}`);
}

test("bindTaskActions wires a status click to questLog.updateTask", async () => {
  const calls = [];
  const questLogMock = {
    updateTask: (id, data) => { calls.push([id, data]); return Promise.resolve({}); },
    listTasks: () => Promise.resolve([]),
  };

  const dom = new JSDOM(FIXTURE_HTML, { url: "http://localhost/" });
  installGlobals(dom, questLogMock);

  const tasks = await freshTasksModule();
  tasks.initTasks(() => {});

  const grid = dom.window.document.getElementById("taskGrid");
  grid.innerHTML = tasks.taskCardHtml({ id: "s1", title: "T", status: "backlog" });
  tasks.bindTaskActions(grid);

  grid.querySelector('.task-status-btn[data-status="done"]')
    .dispatchEvent(new dom.window.Event("click", { bubbles: true }));

  assert.deepEqual(calls, [["s1", { status: "done" }]]);
});

test("bindTaskActions wires delete to confirm() + questLog.deleteTask", async () => {
  const calls = [];
  const task = { id: "s1", title: "T", note: "", status: "backlog", order: 1 };
  const questLogMock = {
    deleteTask: (id) => { calls.push(id); return Promise.resolve(); },
    listTasks: () => Promise.resolve([task]),
  };

  const dom = new JSDOM(FIXTURE_HTML, { url: "http://localhost/" });
  installGlobals(dom, questLogMock);

  const tasks = await freshTasksModule();
  initDetail();
  tasks.initTasks(() => {});
  await tasks.loadTasks();

  const doc = dom.window.document;
  const grid = doc.getElementById("taskGrid");
  grid.innerHTML = tasks.getTasksByStatus("backlog").map(tasks.taskCardHtml).join("");
  tasks.bindTaskActions(grid);

  grid.querySelector(".task-card").dispatchEvent(new dom.window.Event("click", { bubbles: true }));
  doc.getElementById("detailDeleteBtn").dispatchEvent(new dom.window.Event("click", { bubbles: true }));

  assert.deepEqual(calls, ["s1"]);
});

test("bindTaskActions skips deleteTask when confirm() is cancelled", async () => {
  const calls = [];
  const task = { id: "s1", title: "T", note: "", status: "backlog", order: 1 };
  const questLogMock = {
    deleteTask: (id) => { calls.push(id); return Promise.resolve(); },
    listTasks: () => Promise.resolve([task]),
  };

  const dom = new JSDOM(FIXTURE_HTML, { url: "http://localhost/" });
  installGlobals(dom, questLogMock);
  dom.window.confirm = () => false;

  const tasks = await freshTasksModule();
  initDetail();
  tasks.initTasks(() => {});
  await tasks.loadTasks();

  const doc = dom.window.document;
  const grid = doc.getElementById("taskGrid");
  grid.innerHTML = tasks.getTasksByStatus("backlog").map(tasks.taskCardHtml).join("");
  tasks.bindTaskActions(grid);

  grid.querySelector(".task-card").dispatchEvent(new dom.window.Event("click", { bubbles: true }));
  doc.getElementById("detailDeleteBtn").dispatchEvent(new dom.window.Event("click", { bubbles: true }));

  assert.deepEqual(calls, []);
});

test("clicking a task card shows the note in the detail modal", async () => {
  const questLogMock = {
    listTasks: () => Promise.resolve([{ id: "s1", title: "Fix the thing", note: "a & b", status: "backlog", order: 1 }]),
  };

  const dom = new JSDOM(FIXTURE_HTML, { url: "http://localhost/" });
  installGlobals(dom, questLogMock);

  const tasks = await freshTasksModule();
  initDetail();
  tasks.initTasks(() => {});
  await tasks.loadTasks();

  const doc = dom.window.document;
  const grid = doc.getElementById("taskGrid");
  grid.innerHTML = tasks.getTasksByStatus("backlog").map(tasks.taskCardHtml).join("");
  tasks.bindTaskActions(grid);

  grid.querySelector(".task-card").dispatchEvent(new dom.window.Event("click", { bubbles: true }));

  assert.equal(doc.getElementById("detailModalOverlay").hidden, false);
  assert.equal(doc.getElementById("detailTitle").textContent, "Fix the thing");
  assert.equal(doc.getElementById("detailText").textContent, "a & b");
  assert.equal(doc.getElementById("detailTags").hidden, true);
});

test("a task with no note still opens a detail modal", async () => {
  const questLogMock = {
    listTasks: () => Promise.resolve([{ id: "s1", title: "Bare", status: "backlog", order: 1 }]),
  };

  const dom = new JSDOM(FIXTURE_HTML, { url: "http://localhost/" });
  installGlobals(dom, questLogMock);

  const tasks = await freshTasksModule();
  initDetail();
  tasks.initTasks(() => {});
  await tasks.loadTasks();

  const doc = dom.window.document;
  const grid = doc.getElementById("taskGrid");
  grid.innerHTML = tasks.getTasksByStatus("backlog").map(tasks.taskCardHtml).join("");
  tasks.bindTaskActions(grid);

  grid.querySelector(".task-card").dispatchEvent(new dom.window.Event("click", { bubbles: true }));

  assert.equal(doc.getElementById("detailModalOverlay").hidden, false);
  assert.equal(doc.getElementById("detailText").textContent, "Nothing written down yet.");
});

test("getTasksByStatus splits loaded tasks by status, ordered", async () => {
  const questLogMock = {
    listTasks: () => Promise.resolve([
      { id: "b", title: "Backlog one", status: "backlog", order: 2 },
      { id: "a", title: "Backlog two", status: "backlog", order: 1 },
      { id: "c", title: "Active", status: "in_progress", order: 1 },
      { id: "d", title: "Finished", status: "done", order: 1 },
    ]),
  };

  const dom = new JSDOM(FIXTURE_HTML, { url: "http://localhost/" });
  installGlobals(dom, questLogMock);

  const tasks = await freshTasksModule();
  let changeCount = 0;
  tasks.initTasks(() => { changeCount += 1; });
  await tasks.loadTasks();

  assert.equal(changeCount, 1);
  assert.deepEqual(tasks.getTasksByStatus("backlog").map((s) => s.id), ["a", "b"]);
  assert.deepEqual(tasks.getTasksByStatus("in_progress").map((s) => s.id), ["c"]);
  assert.deepEqual(tasks.getTasksByStatus("done").map((s) => s.id), ["d"]);
});

test("the detail modal's Edit button prefills the form with the existing title and note", async () => {
  const task = { id: "s1", title: "Water the plants", note: "Balcony one too", status: "backlog", order: 1 };
  const questLogMock = { listTasks: () => Promise.resolve([task]) };

  const dom = new JSDOM(FIXTURE_HTML, { url: "http://localhost/" });
  installGlobals(dom, questLogMock);

  const tasks = await freshTasksModule();
  initDetail();
  tasks.initTasks(() => {});
  await tasks.loadTasks();

  const doc = dom.window.document;
  const grid = doc.getElementById("taskGrid");
  grid.innerHTML = tasks.getTasksByStatus("backlog").map(tasks.taskCardHtml).join("");
  tasks.bindTaskActions(grid);

  const buttons = Array.from(grid.querySelectorAll(".task-card button"));
  assert.ok(buttons.every((b) => b.classList.contains("status-btn")),
    "the only buttons left on a card are its status pills");

  grid.querySelector(".task-card").dispatchEvent(new dom.window.Event("click", { bubbles: true }));
  doc.getElementById("detailEditBtn").dispatchEvent(new dom.window.Event("click", { bubbles: true }));

  assert.equal(doc.getElementById("taskModalOverlay").hidden, false);
  assert.equal(doc.getElementById("taskModalTitle").textContent, "Edit Task");
  assert.equal(doc.getElementById("taskTitle").value, "Water the plants");
  assert.equal(doc.getElementById("taskNote").value, "Balcony one too");
});

test("openCreateTask opens the modal in create mode", async () => {
  const questLogMock = { listTasks: () => Promise.resolve([]) };

  const dom = new JSDOM(FIXTURE_HTML, { url: "http://localhost/" });
  installGlobals(dom, questLogMock);

  const tasks = await freshTasksModule();
  tasks.initTasks(() => {});

  tasks.openCreateTask();

  const doc = dom.window.document;
  assert.equal(doc.getElementById("taskModalOverlay").hidden, false);
  assert.equal(doc.getElementById("taskModalTitle").textContent, "Create Task");
  assert.equal(doc.getElementById("taskTitle").value, "");
});

test("only the backdrop closes the task modal, not a click inside it", async () => {
  const questLogMock = { listTasks: () => Promise.resolve([]) };

  const dom = new JSDOM(FIXTURE_HTML, { url: "http://localhost/" });
  installGlobals(dom, questLogMock);

  const tasks = await freshTasksModule();
  tasks.initTasks(() => {});
  tasks.openCreateTask();

  const doc = dom.window.document;
  const overlay = doc.getElementById("taskModalOverlay");

  doc.getElementById("taskTitle").dispatchEvent(new dom.window.Event("click", { bubbles: true }));
  assert.equal(overlay.hidden, false, "a click on a field stays open");

  overlay.dispatchEvent(new dom.window.Event("click", { bubbles: true }));
  assert.equal(overlay.hidden, true, "a click on the backdrop closes");
});

test("Escape closes an open task modal", async () => {
  const questLogMock = { listTasks: () => Promise.resolve([]) };

  const dom = new JSDOM(FIXTURE_HTML, { url: "http://localhost/" });
  installGlobals(dom, questLogMock);

  const tasks = await freshTasksModule();
  tasks.initTasks(() => {});
  tasks.openCreateTask();

  const doc = dom.window.document;
  assert.equal(doc.getElementById("taskModalOverlay").hidden, false);

  doc.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

  assert.equal(doc.getElementById("taskModalOverlay").hidden, true);
});

test("submitting the create form calls questLog.createTask with title and note", async () => {
  const calls = [];
  const questLogMock = {
    listTasks: () => Promise.resolve([]),
    createTask: (data) => { calls.push(data); return Promise.resolve({ id: "new", ...data }); },
  };

  const dom = new JSDOM(FIXTURE_HTML, { url: "http://localhost/" });
  installGlobals(dom, questLogMock);

  const tasks = await freshTasksModule();
  tasks.initTasks(() => {});
  await tasks.loadTasks();

  const doc = dom.window.document;
  doc.getElementById("addTaskBtn").dispatchEvent(new dom.window.Event("click", { bubbles: true }));

  assert.equal(doc.getElementById("taskModalOverlay").hidden, false);
  assert.equal(doc.getElementById("taskModalTitle").textContent, "Create Task");

  doc.getElementById("taskTitle").value = "  Take out bins  ";
  doc.getElementById("taskNote").value = "  Before 8pm  ";
  doc.getElementById("taskForm").dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));

  assert.deepEqual(calls, [{ title: "Take out bins", note: "Before 8pm" }]);
});

// ---- archive ----

function doneTask(over) {
  return Object.assign({
    id: "t1", title: "T", note: "", status: "done", order: 1,
    finishedAt: "2026-09-10T10:00:00.000Z", finishedAs: "done", completedAt: "2026-09-10T10:00:00.000Z",
  }, over || {});
}

async function bootTasks(list, questLogMock) {
  const mock = Object.assign({ listTasks: () => Promise.resolve(list) }, questLogMock || {});
  const dom = new JSDOM(FIXTURE_HTML, { url: "http://localhost/" });
  installGlobals(dom, mock);

  const tasks = await freshTasksModule();
  initDetail();
  tasks.initTasks(() => {});
  await tasks.loadTasks();
  return { dom, doc: dom.window.document, tasks };
}

function click(dom, el) {
  el.dispatchEvent(new dom.window.Event("click", { bubbles: true }));
}

test("taskCardHtml renders an archived task read-only", () => {
  const html = taskCardHtml(doneTask({ archivedAt: "2026-09-11T00:00:00.000Z" }));
  assert.ok(html.includes("archived-card"));
  assert.ok(!html.includes("status-btn"));
});

test("archived tasks drop out of the by-status views but not the list", async () => {
  const { tasks } = await bootTasks([
    doneTask({ id: "a", title: "Kept", order: 1 }),
    doneTask({ id: "b", title: "Older", order: 2, finishedAt: "2026-09-01T10:00:00.000Z", archivedAt: "2026-09-11T00:00:00.000Z" }),
    doneTask({ id: "c", title: "Newer", order: 3, finishedAt: "2026-09-09T10:00:00.000Z", archivedAt: "2026-09-11T00:00:00.000Z" }),
  ]);

  assert.deepEqual(tasks.getTasksByStatus("done").map((t) => t.id), ["a"]);
  assert.deepEqual(tasks.getArchivedTasks().map((t) => t.id), ["c", "b"], "newest finish first");
  assert.equal(tasks.getAllTasks().length, 3, "the ledger still sees all three");
  assert.equal(tasks.getStatusCounts().done, 3, "so does the home column");
});

test("the detail view archives a done task and restores an archived one", async () => {
  const calls = [];
  const { dom, doc, tasks } = await bootTasks([
    { id: "open", title: "Open", note: "", status: "backlog", order: 1 },
    doneTask({ id: "done", title: "Done", order: 2 }),
    doneTask({ id: "gone", title: "Gone", order: 3, archivedAt: "2026-09-11T00:00:00.000Z" }),
  ], {
    updateTask: (id, data) => { calls.push([id, data]); return Promise.resolve({}); },
  });

  const grid = doc.getElementById("taskGrid");
  grid.innerHTML = tasks.getAllTasks().map(tasks.taskCardHtml).join("");
  tasks.bindTaskActions(grid);
  const cardFor = (id) => grid.querySelector(`.task-card[data-id="${id}"]`);
  const archiveBtn = doc.getElementById("detailArchiveBtn");
  const restoreBtn = doc.getElementById("detailRestoreBtn");

  click(dom, cardFor("open"));
  assert.equal(archiveBtn.hidden, true);
  assert.equal(restoreBtn.hidden, true);
  click(dom, doc.getElementById("detailCloseBtn"));

  click(dom, cardFor("done"));
  assert.equal(archiveBtn.hidden, false);
  click(dom, archiveBtn);
  assert.equal(calls[0][0], "done");
  assert.match(calls[0][1].archivedAt, /^\d{4}-/);
  assert.equal(doc.getElementById("detailModalOverlay").hidden, true);

  click(dom, cardFor("gone"));
  assert.equal(archiveBtn.hidden, true);
  assert.equal(restoreBtn.hidden, false);
  click(dom, restoreBtn);
  assert.deepEqual(calls[1], ["gone", { archivedAt: null }]);
});

test("archiveDoneTasks sweeps every done task after a confirm, and none without", async () => {
  const calls = [];
  const asked = [];
  const { dom, tasks } = await bootTasks([
    doneTask({ id: "a", order: 1 }),
    doneTask({ id: "b", order: 2 }),
    doneTask({ id: "c", order: 3, archivedAt: "2026-09-11T00:00:00.000Z" }),
    { id: "d", title: "Open", note: "", status: "backlog", order: 4 },
  ], {
    updateTask: (id, data) => { calls.push([id, data]); return Promise.resolve({}); },
  });
  dom.window.confirm = (msg) => { asked.push(msg); return asked.length > 1; };

  tasks.archiveDoneTasks();
  assert.match(asked[0], /Archive 2 done tasks\?/);
  assert.equal(calls.length, 0);

  tasks.archiveDoneTasks();
  assert.deepEqual(calls.map((c) => c[0]), ["a", "b"], "the already-archived and the open one are left alone");
});
