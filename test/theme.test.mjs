import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { initTheme } from "../js/theme.js";

function installGlobals(dom, { matchesDark = false } = {}) {
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.localStorage = dom.window.localStorage;
  dom.window.matchMedia = (query) => ({
    matches: matchesDark,
    media: query,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
  });
}

function newDom() {
  return new JSDOM(`<!doctype html><body><button id="themeToggleBtn"></button></body>`, { url: "http://localhost/" });
}

test("defaults to light (no override) when system prefers light", () => {
  const dom = newDom();
  installGlobals(dom, { matchesDark: false });

  initTheme();

  assert.equal(dom.window.document.documentElement.hasAttribute("data-theme"), false);
  const btn = dom.window.document.getElementById("themeToggleBtn");
  assert.equal(btn.textContent, "☾");
  assert.equal(btn.title, "Switch to dark mode");
});

test("follows system dark preference when nothing is stored", () => {
  const dom = newDom();
  installGlobals(dom, { matchesDark: true });

  initTheme();

  assert.equal(dom.window.document.documentElement.hasAttribute("data-theme"), false);
  const btn = dom.window.document.getElementById("themeToggleBtn");
  assert.equal(btn.textContent, "☀");
  assert.equal(btn.title, "Switch to light mode");
});

test("a stored override wins over the system preference", () => {
  const dom = newDom();
  installGlobals(dom, { matchesDark: false });
  dom.window.localStorage.setItem("quest-log-theme", "dark");

  initTheme();

  assert.equal(dom.window.document.documentElement.getAttribute("data-theme"), "dark");
  assert.equal(dom.window.document.getElementById("themeToggleBtn").textContent, "☀");
});

test("clicking the toggle flips the theme and persists it", () => {
  const dom = newDom();
  installGlobals(dom, { matchesDark: false });

  initTheme();
  const btn = dom.window.document.getElementById("themeToggleBtn");

  btn.dispatchEvent(new dom.window.Event("click", { bubbles: true }));
  assert.equal(dom.window.document.documentElement.getAttribute("data-theme"), "dark");
  assert.equal(dom.window.localStorage.getItem("quest-log-theme"), "dark");
  assert.equal(btn.textContent, "☀");

  btn.dispatchEvent(new dom.window.Event("click", { bubbles: true }));
  assert.equal(dom.window.document.documentElement.getAttribute("data-theme"), "light");
  assert.equal(dom.window.localStorage.getItem("quest-log-theme"), "light");
  assert.equal(btn.textContent, "☾");
});
