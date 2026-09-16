const TAB_KEY = "quest-log-tab";

export const TABS = ["home", "quests", "sideQuests"];

var tabsEl, onChange = null;
var active = "home";

function getStoredTab() {
  try { return localStorage.getItem(TAB_KEY); } catch (e) { return null; }
}

function setStoredTab(id) {
  try { localStorage.setItem(TAB_KEY, id); } catch (e) {}
}

export function activeTab() {
  return active;
}

export function initTabs(onTabChanged) {
  onChange = onTabChanged;
  tabsEl = document.getElementById("tabs");
  if (!tabsEl) return;

  var stored = getStoredTab();
  active = TABS.indexOf(stored) === -1 ? "home" : stored;

  tabsEl.addEventListener("click", function (e) {
    var btn = e.target.closest(".tab");
    if (!btn) return;
    showTab(btn.getAttribute("data-tab"));
  });

  applyTab();
}

export function showTab(id) {
  if (TABS.indexOf(id) === -1 || id === active) return;
  active = id;
  setStoredTab(id);
  applyTab();
}

function applyTab() {
  if (!tabsEl) return;

  tabsEl.querySelectorAll(".tab").forEach(function (btn) {
    var isActive = btn.getAttribute("data-tab") === active;
    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-selected", isActive ? "true" : "false");
  });

  TABS.forEach(function (id) {
    var screen = document.getElementById(id + "Screen");
    if (screen) screen.hidden = id !== active;
  });

  // Each screen scrolls independently; landing halfway down a list you just
  // switched to is disorienting.
  var scroller = document.querySelector(".app-scroll");
  if (scroller) scroller.scrollTop = 0;

  if (onChange) onChange(active);
}
