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
  fs.writeFileSync(storePath, JSON.stringify({ quests: [], sideQuests: [], pinned: [] }));
  return storePath;
}

test("seeds a welcome tutorial quest and empty side-quest/pinned lists on first read", () => {
  const store = createStore(tempStorePath());

  const quests = store.getQuests();
  assert.equal(quests.length, 1);
  assert.equal(quests[0].id, "welcome");
  assert.equal(quests[0].status, "backlog");

  assert.deepEqual(store.getSideQuests(), []);
  assert.deepEqual(store.getPinned(), []);
});

test("backfills a missing sideQuests array for stores written before side quests existed", () => {
  const storePath = tempStorePath();
  fs.writeFileSync(storePath, JSON.stringify({ quests: [], pinned: [] }));

  const store = createStore(storePath);
  assert.deepEqual(store.getSideQuests(), []);
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

test("createSideQuest assigns an id, defaults to backlog, and increments order", () => {
  const store = createStore(emptyStorePath());
  const first = store.createSideQuest({ title: "Water the plants", note: "The balcony one too" });
  const second = store.createSideQuest({ title: "Reply to Tom" });

  assert.ok(first.id);
  assert.equal(first.title, "Water the plants");
  assert.equal(first.note, "The balcony one too");
  assert.equal(first.status, "backlog");
  assert.equal(first.order, 1);
  assert.equal(second.order, 2);
});

test("createSideQuest defaults note to an empty string when omitted", () => {
  const store = createStore(emptyStorePath());
  const sideQuest = store.createSideQuest({ title: "Take out bins" });

  assert.equal(sideQuest.note, "");
});

test("updateSideQuest merges fields without changing the id", () => {
  const store = createStore(emptyStorePath());
  const sideQuest = store.createSideQuest({ title: "Original" });
  const updated = store.updateSideQuest(sideQuest.id, { title: "Updated", status: "done" });

  assert.equal(updated.id, sideQuest.id);
  assert.equal(updated.title, "Updated");
  assert.equal(updated.status, "done");
});

test("updateSideQuest throws for an unknown id", () => {
  const store = createStore(emptyStorePath());
  assert.throws(() => store.updateSideQuest("nope", {}), /Side quest not found/);
});

test("deleteSideQuest removes the side quest", () => {
  const store = createStore(emptyStorePath());
  const sideQuest = store.createSideQuest({ title: "To delete" });
  store.deleteSideQuest(sideQuest.id);

  assert.deepEqual(store.getSideQuests(), []);
});

test("side quests persist across separate store instances", () => {
  const storePath = emptyStorePath();
  const store = createStore(storePath);
  store.createSideQuest({ title: "Survives a restart" });

  const reopened = createStore(storePath);
  assert.deepEqual(reopened.getSideQuests().map((s) => s.title), ["Survives a restart"]);
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

test("reorderSideQuests renumbers order and persists", () => {
  const storePath = emptyStorePath();
  const store = createStore(storePath);
  const a = store.createSideQuest({ title: "A" });
  const b = store.createSideQuest({ title: "B" });

  store.reorderSideQuests([b.id, a.id]);

  const reopened = createStore(storePath);
  const byId = Object.fromEntries(reopened.getSideQuests().map((s) => [s.id, s.order]));
  assert.equal(byId[b.id], 1);
  assert.equal(byId[a.id], 2);
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
