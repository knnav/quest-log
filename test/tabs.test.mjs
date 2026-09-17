import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

const FIXTURE_HTML = `<!doctype html><html><body>
  <nav class="tabs" id="tabs">
    <button class="tab" data-tab="home"><svg></svg><span class="sr-only">Home</span></button>
    <button class="tab" data-tab="quests">Quests</button>
    <button class="tab" data-tab="tasks">Tasks</button>
  </nav>
  <main class="app-scroll">
    <section class="screen" id="homeScreen"></section>
    <section class="screen" id="questsScreen" hidden></section>
    <section class="screen" id="tasksScreen" hidden></section>
  </main>
</body></html>`;

let moduleCounter = 0;

function installGlobals(dom, storage) {
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.localStorage = storage;
}

function memoryStorage(seed) {
  const data = Object.assign({}, seed);
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    _data: data,
  };
}

async function freshTabsModule() {
  moduleCounter += 1;
  return import(`../js/ui/tabs.js?instance=${moduleCounter}`);
}

function setup(storage) {
  const dom = new JSDOM(FIXTURE_HTML, { url: "http://localhost/" });
  installGlobals(dom, storage || memoryStorage());
  return dom;
}

function visibleScreen(doc) {
  return Array.from(doc.querySelectorAll(".screen")).filter((s) => !s.hidden).map((s) => s.id);
}

test("opens on home and shows only that screen", async () => {
  const dom = setup();
  const tabs = await freshTabsModule();
  tabs.initTabs();

  const doc = dom.window.document;
  assert.equal(tabs.activeTab(), "home");
  assert.deepEqual(visibleScreen(doc), ["homeScreen"]);
  assert.equal(doc.querySelector('.tab[data-tab="home"]').classList.contains("active"), true);
  assert.equal(doc.querySelector('.tab[data-tab="home"]').getAttribute("aria-selected"), "true");
});

test("clicking a tab swaps the visible screen", async () => {
  const dom = setup();
  const tabs = await freshTabsModule();
  tabs.initTabs();

  const doc = dom.window.document;
  doc.querySelector('.tab[data-tab="tasks"]')
    .dispatchEvent(new dom.window.Event("click", { bubbles: true }));

  assert.equal(tabs.activeTab(), "tasks");
  assert.deepEqual(visibleScreen(doc), ["tasksScreen"]);
});

test("clicking the label inside a tab still selects it", async () => {
  const dom = setup();
  const tabs = await freshTabsModule();
  tabs.initTabs();

  const doc = dom.window.document;
  doc.querySelector('.tab[data-tab="home"] .sr-only')
    .dispatchEvent(new dom.window.Event("click", { bubbles: true }));
  assert.equal(tabs.activeTab(), "home");
});

test("the active tab is remembered across launches", async () => {
  const storage = memoryStorage();
  const dom = setup(storage);
  const tabs = await freshTabsModule();
  tabs.initTabs();

  tabs.showTab("quests");
  assert.equal(storage._data["quest-log-tab"], "quests");

  // Relaunch with the same storage.
  setup(storage);
  const relaunched = await freshTabsModule();
  relaunched.initTabs();
  assert.equal(relaunched.activeTab(), "quests");
});

test("an unknown stored tab falls back to home", async () => {
  const dom = setup(memoryStorage({ "quest-log-tab": "nonsense" }));
  const tabs = await freshTabsModule();
  tabs.initTabs();

  assert.equal(tabs.activeTab(), "home");
  assert.deepEqual(visibleScreen(dom.window.document), ["homeScreen"]);
});

test("onChange fires with the new tab so the chrome can follow it", async () => {
  const seen = [];
  setup();
  const tabs = await freshTabsModule();
  tabs.initTabs((id) => seen.push(id));

  tabs.showTab("tasks");
  tabs.showTab("quests");
  tabs.showTab("quests"); // already active, should not re-fire

  assert.deepEqual(seen, ["home", "tasks", "quests"]);
});

test("showTab ignores a tab that does not exist", async () => {
  setup();
  const tabs = await freshTabsModule();
  tabs.initTabs();

  tabs.showTab("nope");
  assert.equal(tabs.activeTab(), "home");
});
