import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { enableDragSort } from "../js/ui/dragSort.js";

function setup(ids) {
  const dom = new JSDOM(`<!doctype html><body><div id="grid"></div></body>`, { url: "http://localhost/" });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;

  const grid = dom.window.document.getElementById("grid");
  grid.innerHTML = ids.map((id) => `<div class="card" data-drag-id="${id}">${id}</div>`).join("");
  return { dom, grid };
}

// jsdom has no DataTransfer, so drag events carry a stub the handlers can write to.
function dragEvent(dom, type) {
  const event = new dom.window.Event(type, { bubbles: true, cancelable: true });
  event.dataTransfer = { effectAllowed: "", dropEffect: "", setData() {}, getData() { return ""; } };
  return event;
}

function currentOrder(grid) {
  return Array.from(grid.querySelectorAll("[data-drag-id]")).map((el) => el.getAttribute("data-drag-id"));
}

test("marks every card draggable when sorting is enabled", () => {
  const { grid } = setup(["a", "b", "c"]);
  enableDragSort(grid, () => {});

  const flags = Array.from(grid.querySelectorAll("[data-drag-id]")).map((el) => el.getAttribute("draggable"));
  assert.deepEqual(flags, ["true", "true", "true"]);
});

test("dragging one card over another reorders the DOM and reports the new order", () => {
  const { dom, grid } = setup(["a", "b", "c"]);

  const reorders = [];
  enableDragSort(grid, (ids) => reorders.push(ids));

  const cardC = grid.querySelector('[data-drag-id="c"]');
  const cardA = grid.querySelector('[data-drag-id="a"]');

  cardC.dispatchEvent(dragEvent(dom, "dragstart"));
  assert.ok(cardC.classList.contains("dragging"));

  cardA.dispatchEvent(dragEvent(dom, "dragover"));
  cardC.dispatchEvent(dragEvent(dom, "dragend"));

  assert.deepEqual(currentOrder(grid), ["c", "a", "b"]);
  assert.deepEqual(reorders, [["c", "a", "b"]]);
  assert.ok(!cardC.classList.contains("dragging"));
});

test("a drag that ends where it started does not report a reorder", () => {
  const { dom, grid } = setup(["a", "b", "c"]);

  const reorders = [];
  enableDragSort(grid, (ids) => reorders.push(ids));

  const cardB = grid.querySelector('[data-drag-id="b"]');
  cardB.dispatchEvent(dragEvent(dom, "dragstart"));
  cardB.dispatchEvent(dragEvent(dom, "dragend"));

  assert.deepEqual(currentOrder(grid), ["a", "b", "c"]);
  assert.deepEqual(reorders, []);
});

test("dragging over the card itself changes nothing", () => {
  const { dom, grid } = setup(["a", "b"]);

  const reorders = [];
  enableDragSort(grid, (ids) => reorders.push(ids));

  const cardA = grid.querySelector('[data-drag-id="a"]');
  cardA.dispatchEvent(dragEvent(dom, "dragstart"));
  cardA.dispatchEvent(dragEvent(dom, "dragover"));
  cardA.dispatchEvent(dragEvent(dom, "dragend"));

  assert.deepEqual(currentOrder(grid), ["a", "b"]);
  assert.deepEqual(reorders, []);
});
