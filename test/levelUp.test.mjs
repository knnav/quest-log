import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

let counter = 0;

async function setup(markup) {
  const dom = new JSDOM(`<!doctype html><html><body>${markup}</body></html>`);
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  counter += 1;
  const mod = await import(`../js/ui/levelUp.js?instance=${counter}`);
  mod.initLevelUp();
  return { dom, mod };
}

const MARKUP = '<div class="levelup" id="levelUp" hidden><p id="levelUpLevel"></p></div>';

test("showing the card reveals it with the level, and hiding puts it away", async () => {
  const { dom, mod } = await setup(MARKUP);
  const doc = dom.window.document;
  const card = doc.getElementById("levelUp");

  mod.showLevelUp(7);
  assert.equal(card.hidden, false);
  assert.ok(card.classList.contains("is-on"));
  assert.equal(doc.getElementById("levelUpLevel").textContent, "Lv 7");

  mod.hideLevelUp();
  assert.equal(card.hidden, true);
  assert.equal(card.classList.contains("is-on"), false);
});

test("the card takes itself down after its run", async () => {
  const { dom, mod } = await setup(MARKUP);
  const card = dom.window.document.getElementById("levelUp");

  mod.showLevelUp(3);
  await new Promise((resolve) => setTimeout(resolve, mod.LEVEL_UP_CARD_MS + 50));
  assert.equal(card.hidden, true);
});

test("a second level-up while the card is up restarts it with the newer level", async () => {
  const { dom, mod } = await setup(MARKUP);
  const doc = dom.window.document;

  mod.showLevelUp(3);
  mod.showLevelUp(4);
  assert.equal(doc.getElementById("levelUpLevel").textContent, "Lv 4");
  assert.equal(doc.getElementById("levelUp").hidden, false);
});

test("without the markup it is a no-op rather than a crash", async () => {
  const { mod } = await setup("<div></div>");
  assert.doesNotThrow(() => { mod.showLevelUp(2); mod.hideLevelUp(); });
});
