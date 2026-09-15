const THEME_KEY = "quest-log-theme";

const SYSTEM_LIGHT = "light";
const SYSTEM_DARK = "neon-arcade";

export const THEMES = [
  { id: "system", label: "System" },
  { id: "light", label: "Light" },
  { id: "neon-arcade", label: "Neon Arcade" },
  { id: "game-boy", label: "Game Boy" },
  { id: "sunset-cabinet", label: "Sunset Cabinet" },
  { id: "cyber-terminal", label: "Cyber Terminal" }
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
  // "dark" was the id before themes were named; keep those users on the same palette.
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
  document.documentElement.setAttribute("data-theme", resolveTheme(selectedTheme()));
}

function renderMenu() {
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

export function initTheme() {
  buttonEl = document.getElementById("themeMenuBtn");
  menuEl = document.getElementById("themeMenu");

  applyTheme();
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
