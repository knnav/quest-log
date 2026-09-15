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
  fs.writeFileSync(storePath, JSON.stringify({ quests: [], pinned: [] }));
  return storePath;
}

test("seeds a welcome tutorial quest and an empty pinned list on first read", () => {
  const store = createStore(tempStorePath());

  const quests = store.getQuests();
  assert.equal(quests.length, 1);
  assert.equal(quests[0].id, "welcome");
  assert.equal(quests[0].status, "backlog");

  assert.deepEqual(store.getPinned(), []);
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

test("updatePinned merges fields and persists across separate store instances", () => {
  const storePath = tempStorePath();
  fs.writeFileSync(storePath, JSON.stringify({
    quests: [],
    pinned: [{ id: "gb-emulator", title: "GB Emulator", status: "old", next: "", todo: "", state: "in_progress", order: 1 }],
  }));

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
