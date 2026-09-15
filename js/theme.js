const THEME_KEY = "quest-log-theme";

function getStoredTheme() {
  try { return localStorage.getItem(THEME_KEY); } catch (e) { return null; }
}

function setStoredTheme(theme) {
  try {
    if (theme) localStorage.setItem(THEME_KEY, theme);
    else localStorage.removeItem(THEME_KEY);
  } catch (e) {}
}

function systemPrefersDark() {
  return !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
}

function effectiveTheme() {
  return getStoredTheme() || (systemPrefersDark() ? "dark" : "light");
}

function applyTheme(theme, toggleBtn) {
  if (theme) document.documentElement.setAttribute("data-theme", theme);
  else document.documentElement.removeAttribute("data-theme");

  var isDark = effectiveTheme() === "dark";
  toggleBtn.textContent = isDark ? "☀" : "☾";
  toggleBtn.title = isDark ? "Switch to light mode" : "Switch to dark mode";
}

export function initTheme() {
  var toggleBtn = document.getElementById("themeToggleBtn");
  applyTheme(getStoredTheme(), toggleBtn);

  toggleBtn.addEventListener("click", function () {
    var next = effectiveTheme() === "dark" ? "light" : "dark";
    setStoredTheme(next);
    applyTheme(next, toggleBtn);
  });
}
