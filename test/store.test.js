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

test("seeds default pinned repos and an empty quest list on first read", () => {
  const store = createStore(tempStorePath());
  assert.deepEqual(store.getQuests(), []);

  const pinned = store.getPinned();
  assert.equal(pinned.length, 2);
  assert.equal(pinned[0].id, "gb-emulator");
  assert.equal(pinned[1].id, "elixir-in-airflow");
});

test("createQuest assigns an id, defaults, and order 1 for the first quest", () => {
  const store = createStore(tempStorePath());
  const quest = store.createQuest({ title: "Test Quest", hook: "h", tier: "weekend", tags: ["a"], dod: "done" });

  assert.ok(quest.id);
  assert.equal(quest.order, 1);
  assert.equal(quest.status, "backlog");
  assert.deepEqual(store.getQuests().map((q) => q.id), [quest.id]);
});

test("createQuest increments order across successive quests", () => {
  const store = createStore(tempStorePath());
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
  const store = createStore(tempStorePath());
  const quest = store.createQuest({ title: "To delete" });
  store.deleteQuest(quest.id);

  assert.deepEqual(store.getQuests(), []);
});

test("updatePinned merges fields and persists across separate store instances", () => {
  const storePath = tempStorePath();
  const store = createStore(storePath);
  const updated = store.updatePinned("gb-emulator", { status: "shipped", next: "polish UI" });

  assert.equal(updated.status, "shipped");
  assert.equal(updated.next, "polish UI");

  const reopened = createStore(storePath);
  const reread = reopened.getPinned().find((p) => p.id === "gb-emulator");
  assert.equal(reread.status, "shipped");
  assert.equal(reread.next, "polish UI");
});

test("updatePinned throws for an unknown id", () => {
  const store = createStore(tempStorePath());
  assert.throws(() => store.updatePinned("nope", {}), /Pinned repo not found/);
});

test("writes are atomic: no leftover .tmp file after a write", () => {
  const storePath = tempStorePath();
  const store = createStore(storePath);
  store.createQuest({ title: "One" });

  const dir = path.dirname(storePath);
  const leftoverTmp = fs.readdirSync(dir).filter((f) => f.includes(".tmp"));
  assert.deepEqual(leftoverTmp, []);
});
