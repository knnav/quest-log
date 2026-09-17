// Theme selection and the picker menu.
//
// A theme is applied by setting data-theme on <html>; the palettes themselves
// live in assets/css. "system" is not a palette — it resolves to one of the
// two below at apply time and re-resolves when the OS preference changes.
//
// Both windows must agree, so the resolved id is pushed to the main process
// over window.themeSync and relayed to the other window. initTheme is safe to
// call in a document with no picker; the mini window does exactly that.

const THEME_KEY = "quest-log-theme";

const SYSTEM_LIGHT = "light";
const SYSTEM_DARK = "neon-arcade";

export const THEMES = [
  { id: "system", label: "System" },
  { id: "light", label: "Light" },
  { id: "neon-arcade", label: "Neon Arcade" },
  { id: "game-boy", label: "Game Boy" },
  { id: "sunset-cabinet", label: "Sunset Cabinet" },
  { id: "cyber-terminal", label: "Cyber Terminal" },
  { id: "dracula", label: "Dracula" },
  { id: "nord", label: "Nord" },
  { id: "tokyo-night", label: "Tokyo Night" },
  { id: "gruvbox", label: "Gruvbox" },
  { id: "catppuccin", label: "Catppuccin" },
  { id: "rose-pine", label: "Rosé Pine" },
  { id: "synthwave", label: "Synthwave" },
  { id: "matrix", label: "Matrix" },
  { id: "solarized-light", label: "Solarized Light" },
  { id: "paper", label: "Paper" },
  { id: "souls", label: "Souls" },
  { id: "monokai", label: "Monokai" },
  { id: "one-dark", label: "One Dark" },
  { id: "everforest", label: "Everforest" },
  { id: "kanagawa", label: "Kanagawa" },
  { id: "ayu-mirage", label: "Ayu Mirage" },
  { id: "night-owl", label: "Night Owl" },
  { id: "hallownest", label: "Hallownest" },
  { id: "blood-moon", label: "Blood Moon" },
  { id: "sakura", label: "Sakura" },
  { id: "latte", label: "Latte" },
  { id: "hyrule", label: "Hyrule" },
  { id: "vaporwave", label: "Vaporwave" },
  { id: "abyss", label: "Abyss" },
  { id: "magma", label: "Magma" },
  { id: "night-city", label: "Night City" },
  { id: "frostbite", label: "Frostbite" },
  { id: "mint", label: "Mint" },
  { id: "amber-crt", label: "Amber CRT" },
  { id: "starfield", label: "Starfield" },
  { id: "hexed", label: "Hexed" }
];

var menuEl, buttonEl;

function getStoredTheme() {
  try { return localStorage.getItem(THEME_KEY); } catch (e) { return null; }
}

function setStoredTheme(id) {
  try { localStorage.setItem(THEME_KEY, id); } catch (e) {}
}

function selectedTheme() {
  var stored = getStoredTheme();
  // "dark" was the stored id before the themes were named. Migrate it in place
  // rather than dropping those users back to "system".
  if (stored === "dark") return SYSTEM_DARK;
  return THEMES.some(function (t) { return t.id === stored; }) ? stored : "system";
}

function systemPrefersDark() {
  return !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
}

function resolveTheme(id) {
  if (id !== "system") return id;
  return systemPrefersDark() ? SYSTEM_DARK : SYSTEM_LIGHT;
}

function applyTheme() {
  var resolved = resolveTheme(selectedTheme());
  document.documentElement.setAttribute("data-theme", resolved);
  // Push the *resolved* id, never "system": the other window can't resolve it
  // itself, and would fall back to the OS default instead of this choice.
  if (window.themeSync) window.themeSync.set(resolved);
}

function renderMenu() {
  if (!menuEl) return;
  var current = selectedTheme();
  menuEl.innerHTML = THEMES.map(function (t) {
    return '<button type="button" class="theme-option' + (t.id === current ? " active" : "") +
      '" data-theme-id="' + t.id + '">' +
      '<span class="theme-swatch" data-swatch="' + t.id + '"></span>' + t.label +
      '</button>';
  }).join("");
}

function openMenu() {
  renderMenu();
  menuEl.hidden = false;
  buttonEl.setAttribute("aria-expanded", "true");
}

function closeMenu() {
  menuEl.hidden = true;
  buttonEl.setAttribute("aria-expanded", "false");
}

// Applies the theme, then wires the picker if this document has one. The early
// return keeps a picker-less window (the mini timer) working: it must not throw
// past the applyTheme call, or the rest of that window's setup never runs.
export function initTheme() {
  buttonEl = document.getElementById("themeMenuBtn");
  menuEl = document.getElementById("themeMenu");

  applyTheme();

  if (window.themeSync) {
    window.themeSync.onChange(function (resolved) {
      if (resolved) document.documentElement.setAttribute("data-theme", resolved);
    });
  }

  if (!buttonEl || !menuEl) return;

  renderMenu();

  buttonEl.addEventListener("click", function (e) {
    e.stopPropagation();
    if (menuEl.hidden) openMenu();
    else closeMenu();
  });

  menuEl.addEventListener("click", function (e) {
    var option = e.target.closest(".theme-option");
    if (!option) return;
    setStoredTheme(option.getAttribute("data-theme-id"));
    applyTheme();
    closeMenu();
  });

  document.addEventListener("click", function (e) {
    if (menuEl.hidden) return;
    if (buttonEl.contains(e.target) || menuEl.contains(e.target)) return;
    closeMenu();
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeMenu();
  });

  if (window.matchMedia) {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function () {
      if (selectedTheme() === "system") applyTheme();
    });
  }
}
