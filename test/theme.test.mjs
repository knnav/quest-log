import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { initTheme, THEMES } from "../js/theme.js";

const FIXTURE_HTML = `<!doctype html><body>
  <div class="theme-picker">
    <button id="themeMenuBtn" aria-expanded="false">brush</button>
    <div class="theme-menu" id="themeMenu" hidden></div>
  </div>
</body>`;

function setup({ matchesDark = false, stored = null } = {}) {
  const dom = new JSDOM(FIXTURE_HTML, { url: "http://localhost/" });
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

  if (stored !== null) dom.window.localStorage.setItem("quest-log-theme", stored);
  return dom;
}

function themeAttr(dom) {
  return dom.window.document.documentElement.getAttribute("data-theme");
}

function click(dom, el) {
  el.dispatchEvent(new dom.window.Event("click", { bubbles: true }));
}

test("system preference resolves to light when the OS is light", () => {
  const dom = setup({ matchesDark: false });
  initTheme();
  assert.equal(themeAttr(dom), "light");
});

test("system preference resolves to neon-arcade when the OS is dark", () => {
  const dom = setup({ matchesDark: true });
  initTheme();
  assert.equal(themeAttr(dom), "neon-arcade");
});

test("a stored theme wins over the system preference", () => {
  const dom = setup({ matchesDark: true, stored: "game-boy" });
  initTheme();
  assert.equal(themeAttr(dom), "game-boy");
});

test("an unknown stored theme falls back to system", () => {
  const dom = setup({ matchesDark: false, stored: "nonsense" });
  initTheme();
  assert.equal(themeAttr(dom), "light");
});

test("the legacy \"dark\" preference maps onto neon-arcade", () => {
  const dom = setup({ matchesDark: false, stored: "dark" });
  initTheme();
  assert.equal(themeAttr(dom), "neon-arcade");
});

test("the button toggles the menu open and closed", () => {
  const dom = setup();
  initTheme();

  const btn = dom.window.document.getElementById("themeMenuBtn");
  const menu = dom.window.document.getElementById("themeMenu");

  assert.equal(menu.hidden, true);

  click(dom, btn);
  assert.equal(menu.hidden, false);
  assert.equal(btn.getAttribute("aria-expanded"), "true");

  click(dom, btn);
  assert.equal(menu.hidden, true);
  assert.equal(btn.getAttribute("aria-expanded"), "false");
});

test("the menu lists every theme and marks the active one", () => {
  const dom = setup({ stored: "cyber-terminal" });
  initTheme();

  const options = dom.window.document.querySelectorAll(".theme-option");
  assert.equal(options.length, THEMES.length);

  const active = dom.window.document.querySelectorAll(".theme-option.active");
  assert.equal(active.length, 1);
  assert.equal(active[0].getAttribute("data-theme-id"), "cyber-terminal");
});

test("picking a theme applies it, persists it, and closes the menu", () => {
  const dom = setup();
  initTheme();

  const btn = dom.window.document.getElementById("themeMenuBtn");
  const menu = dom.window.document.getElementById("themeMenu");

  click(dom, btn);
  click(dom, menu.querySelector('[data-theme-id="sunset-cabinet"]'));

  assert.equal(themeAttr(dom), "sunset-cabinet");
  assert.equal(dom.window.localStorage.getItem("quest-log-theme"), "sunset-cabinet");
  assert.equal(menu.hidden, true);
});

test("clicking the swatch inside an option still selects that theme", () => {
  const dom = setup();
  initTheme();

  const btn = dom.window.document.getElementById("themeMenuBtn");
  const menu = dom.window.document.getElementById("themeMenu");

  click(dom, btn);
  click(dom, menu.querySelector('[data-theme-id="game-boy"] .theme-swatch'));

  assert.equal(themeAttr(dom), "game-boy");
});

test("clicking outside the picker closes the menu", () => {
  const dom = setup();
  initTheme();

  const btn = dom.window.document.getElementById("themeMenuBtn");
  const menu = dom.window.document.getElementById("themeMenu");

  click(dom, btn);
  assert.equal(menu.hidden, false);

  click(dom, dom.window.document.body);
  assert.equal(menu.hidden, true);
});
