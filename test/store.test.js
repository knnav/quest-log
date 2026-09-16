const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createStore } = require("../store.js");

function tempStorePath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "quest-log-test-"));
  return path.join(dir, "quest-log.json");
}

// Bypasses the "welcome" tutorial seed for tests that care about a clean slate.
function emptyStorePath() {
  const storePath = tempStorePath();
  fs.writeFileSync(storePath, JSON.stringify({ quests: [], tasks: [] }));
  return storePath;
}

test("seeds a welcome tutorial quest and an empty task list on first read", () => {
  const store = createStore(tempStorePath());

  const quests = store.getQuests();
  assert.equal(quests.length, 1);
  assert.equal(quests[0].id, "welcome");
  assert.equal(quests[0].status, "backlog");

  assert.deepEqual(store.getTasks(), []);
});

test("backfills a missing tasks array for stores written before tasks existed", () => {
  const storePath = tempStorePath();
  fs.writeFileSync(storePath, JSON.stringify({ quests: [] }));

  const store = createStore(storePath);
  assert.deepEqual(store.getTasks(), []);
});

test("createQuest assigns an id, defaults, and order 1 for the first quest", () => {
  const store = createStore(emptyStorePath());
  const quest = store.createQuest({ title: "Test Quest", hook: "h", tier: "weekend", tags: ["a"], dod: "done" });

  assert.ok(quest.id);
  assert.equal(quest.order, 1);
  assert.equal(quest.status, "backlog");
  assert.deepEqual(store.getQuests().map((q) => q.id), [quest.id]);
});

test("createQuest increments order across successive quests", () => {
  const store = createStore(emptyStorePath());
  const a = store.createQuest({ title: "A" });
  const b = store.createQuest({ title: "B" });

  assert.equal(a.order, 1);
  assert.equal(b.order, 2);
});

test("updateQuest merges fields without changing the id", () => {
  const store = createStore(tempStorePath());
  const quest = store.createQuest({ title: "Original" });
  const updated = store.updateQuest(quest.id, { title: "Updated", status: "shipped" });

  assert.equal(updated.id, quest.id);
  assert.equal(updated.title, "Updated");
  assert.equal(updated.status, "shipped");
});

test("updateQuest throws for an unknown id", () => {
  const store = createStore(tempStorePath());
  assert.throws(() => store.updateQuest("nope", {}), /Quest not found/);
});

test("deleteQuest removes the quest", () => {
  const store = createStore(emptyStorePath());
  const quest = store.createQuest({ title: "To delete" });
  store.deleteQuest(quest.id);

  assert.deepEqual(store.getQuests(), []);
});

test("createTask assigns an id, defaults to backlog, and increments order", () => {
  const store = createStore(emptyStorePath());
  const first = store.createTask({ title: "Water the plants", note: "The balcony one too" });
  const second = store.createTask({ title: "Reply to Tom" });

  assert.ok(first.id);
  assert.equal(first.title, "Water the plants");
  assert.equal(first.note, "The balcony one too");
  assert.equal(first.status, "backlog");
  assert.equal(first.order, 1);
  assert.equal(second.order, 2);
});

test("createTask defaults note to an empty string when omitted", () => {
  const store = createStore(emptyStorePath());
  const task = store.createTask({ title: "Take out bins" });

  assert.equal(task.note, "");
});

test("updateTask merges fields without changing the id", () => {
  const store = createStore(emptyStorePath());
  const task = store.createTask({ title: "Original" });
  const updated = store.updateTask(task.id, { title: "Updated", status: "done" });

  assert.equal(updated.id, task.id);
  assert.equal(updated.title, "Updated");
  assert.equal(updated.status, "done");
});

test("updateTask throws for an unknown id", () => {
  const store = createStore(emptyStorePath());
  assert.throws(() => store.updateTask("nope", {}), /Task not found/);
});

test("deleteTask removes the task", () => {
  const store = createStore(emptyStorePath());
  const task = store.createTask({ title: "To delete" });
  store.deleteTask(task.id);

  assert.deepEqual(store.getTasks(), []);
});

test("tasks persist across separate store instances", () => {
  const storePath = emptyStorePath();
  const store = createStore(storePath);
  store.createTask({ title: "Survives a restart" });

  const reopened = createStore(storePath);
  assert.deepEqual(reopened.getTasks().map((s) => s.title), ["Survives a restart"]);
});

test("reorderQuests renumbers order to match the given id sequence", () => {
  const store = createStore(emptyStorePath());
  const a = store.createQuest({ title: "A" });
  const b = store.createQuest({ title: "B" });
  const c = store.createQuest({ title: "C" });

  store.reorderQuests([c.id, a.id, b.id]);

  const byId = Object.fromEntries(store.getQuests().map((q) => [q.id, q.order]));
  assert.equal(byId[c.id], 1);
  assert.equal(byId[a.id], 2);
  assert.equal(byId[b.id], 3);
});

test("reorderQuests leaves quests outside the given ids untouched", () => {
  const store = createStore(emptyStorePath());
  const a = store.createQuest({ title: "A" });
  const b = store.createQuest({ title: "B" });
  const untouched = store.createQuest({ title: "Other tier" });

  store.reorderQuests([b.id, a.id]);

  const byId = Object.fromEntries(store.getQuests().map((q) => [q.id, q.order]));
  assert.equal(byId[b.id], 1);
  assert.equal(byId[a.id], 2);
  assert.equal(byId[untouched.id], 3);
});

test("reorderQuests ignores unknown ids", () => {
  const store = createStore(emptyStorePath());
  const a = store.createQuest({ title: "A" });

  store.reorderQuests(["ghost", a.id]);

  assert.equal(store.getQuests()[0].order, 2);
});

test("reorderTasks renumbers order and persists", () => {
  const storePath = emptyStorePath();
  const store = createStore(storePath);
  const a = store.createTask({ title: "A" });
  const b = store.createTask({ title: "B" });

  store.reorderTasks([b.id, a.id]);

  const reopened = createStore(storePath);
  const byId = Object.fromEntries(reopened.getTasks().map((s) => [s.id, s.order]));
  assert.equal(byId[b.id], 1);
  assert.equal(byId[a.id], 2);
});

// Pinned repos were dropped from the app, but an old store file still has the key.
// Leave it alone rather than rewriting it away, so nothing is destroyed on upgrade.
test("a leftover pinned array from an older version survives a write", () => {
  const storePath = tempStorePath();
  fs.writeFileSync(storePath, JSON.stringify({
    quests: [],
    tasks: [],
    pinned: [{ id: "gb-emulator", title: "GB Emulator", state: "in_progress", order: 1 }],
  }));

  const store = createStore(storePath);
  store.createQuest({ title: "One" });

  const onDisk = JSON.parse(fs.readFileSync(storePath, "utf-8"));
  assert.deepEqual(onDisk.pinned, [{ id: "gb-emulator", title: "GB Emulator", state: "in_progress", order: 1 }]);
});

test("completedAt is stamped when a quest ships and cleared when it un-ships", () => {
  const store = createStore(emptyStorePath());
  const quest = store.createQuest({ title: "Ship me" });
  assert.equal(quest.completedAt, null, "a new backlog quest is undated");

  const shipped = store.updateQuest(quest.id, { status: "shipped" });
  assert.ok(shipped.completedAt, "shipping stamps a completion time");
  assert.ok(!Number.isNaN(Date.parse(shipped.completedAt)), "and it parses as a date");

  const backlogged = store.updateQuest(quest.id, { status: "backlog" });
  assert.equal(backlogged.completedAt, null, "moving back out clears the stamp");
});

test("re-saving an already-shipped quest keeps its original completion time", () => {
  const store = createStore(emptyStorePath());
  const quest = store.createQuest({ title: "Ship me" });
  const first = store.updateQuest(quest.id, { status: "shipped" }).completedAt;

  const renamed = store.updateQuest(quest.id, { title: "Shipped it" });

  assert.equal(renamed.completedAt, first, "an unrelated edit must not re-stamp");
});

// Otherwise every quest you ever shipped would light the bonfire at once.
test("a quest shipped before completedAt existed is not backfilled", () => {
  const storePath = tempStorePath();
  fs.writeFileSync(storePath, JSON.stringify({
    quests: [{ id: "old", title: "Ancient", status: "shipped", order: 1 }],
    tasks: [],
  }));

  const store = createStore(storePath);
  const edited = store.updateQuest("old", { title: "Ancient, renamed" });

  assert.equal(edited.completedAt, null);
});

test("tasks stamp on done rather than shipped", () => {
  const store = createStore(emptyStorePath());
  const task = store.createTask({ title: "Water the plants" });

  assert.equal(store.updateTask(task.id, { status: "shipped" }).completedAt, null,
    "shipped is not a task's done state");

  assert.ok(store.updateTask(task.id, { status: "done" }).completedAt);
  assert.equal(store.updateTask(task.id, { status: "in_progress" }).completedAt, null);
});

test("completedAt survives a round trip to disk", () => {
  const storePath = emptyStorePath();
  const store = createStore(storePath);
  const quest = store.createQuest({ title: "Ship me" });
  const stamped = store.updateQuest(quest.id, { status: "shipped" }).completedAt;

  const reopened = createStore(storePath);
  assert.equal(reopened.getQuests().find((q) => q.id === quest.id).completedAt, stamped);
});

test("writes are atomic: no leftover .tmp file after a write", () => {
  const storePath = tempStorePath();
  const store = createStore(storePath);
  store.createQuest({ title: "One" });

  const dir = path.dirname(storePath);
  const leftoverTmp = fs.readdirSync(dir).filter((f) => f.includes(".tmp"));
  assert.deepEqual(leftoverTmp, []);
});


test("createdAt is stamped on every new quest and task", () => {
  const store = createStore(emptyStorePath());
  assert.ok(Date.parse(store.createQuest({ title: "Q" }).createdAt));
  assert.ok(Date.parse(store.createTask({ title: "T" }).createdAt));
});

test("startedAt records the first time you began, and never moves again", () => {
  const store = createStore(emptyStorePath());
  const quest = store.createQuest({ title: "Q" });
  assert.equal(quest.startedAt, null);

  const started = store.updateQuest(quest.id, { status: "in_progress" }).startedAt;
  assert.ok(started);

  const parked = store.updateQuest(quest.id, { status: "backlog" });
  assert.equal(parked.startedAt, started, "parking it does not erase when you began");

  const restarted = store.updateQuest(quest.id, { status: "in_progress" });
  assert.equal(restarted.startedAt, started, "restarting does not reset the clock");
});

// The defect this replaced: a stray click used to wipe the ship date forever.
test("finishedAt survives a stray click that completedAt does not", () => {
  const store = createStore(emptyStorePath());
  const quest = store.createQuest({ title: "Q" });

  const shipped = store.updateQuest(quest.id, { status: "shipped" });
  assert.ok(shipped.completedAt);
  assert.equal(shipped.finishedAt, shipped.completedAt);

  const oops = store.updateQuest(quest.id, { status: "backlog" });
  assert.equal(oops.completedAt, null, "fuel stops, as it must");
  assert.equal(oops.finishedAt, shipped.finishedAt, "but the day you shipped is not destroyed");
});

test("letting a quest go is a terminal state that stamps like any other finish", () => {
  const store = createStore(emptyStorePath());
  const quest = store.createQuest({ title: "Q" });

  const letGo = store.updateQuest(quest.id, { status: "let_go" });
  assert.ok(letGo.completedAt, "it burns as kindling");
  assert.ok(letGo.finishedAt);

  const revived = store.updateQuest(quest.id, { status: "backlog" });
  assert.equal(revived.completedAt, null);
  assert.equal(revived.finishedAt, letGo.finishedAt);
});

test("moving straight from shipped to let go keeps the original finish", () => {
  const store = createStore(emptyStorePath());
  const quest = store.createQuest({ title: "Q" });
  const shipped = store.updateQuest(quest.id, { status: "shipped" });

  const letGo = store.updateQuest(quest.id, { status: "let_go" });
  assert.equal(letGo.completedAt, shipped.completedAt, "terminal to terminal is not a fresh finish");
  assert.equal(letGo.finishedAt, shipped.finishedAt);
});
