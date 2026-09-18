// Renderer entry point for the main window.
//
// Owns no state and renders nothing itself: it wires the feature modules to
// each other and to the DOM. The pattern throughout is that a feature that
// changes data calls back into here, and here re-renders whatever else depends
// on it — which is why quests and tasks don't import each other or home.js.
//
// Init order matters at the bottom of the file: everything must be initialised
// before the first load resolves and triggers a render.

import { initTheme } from "./ui/theme.js";
import { initTitlebar } from "./ui/titlebar.js";
import { initMotd } from "./features/motd.js";
import {
  initQuests, loadQuests, refetchQuests, refreshSessions, getSessions, cardHtml,
  bindQuestActions, getInProgressQuests, openCreateQuest, getAllQuests, questDetail,
  getStatusCounts as questCounts
} from "./features/quests.js";
import {
  initTasks, loadTasks, taskCardHtml, bindTaskActions,
  getTasksByStatus, getNextUpTasks, getArchivedTasks, archiveDoneTasks, openCreateTask, persistTaskOrder,
  getAllTasks, taskDetail, getStatusCounts as taskCounts
} from "./features/tasks.js";
import { initStandup, renderStandup } from "./features/standup.js";
import { enableDragSort } from "./ui/dragSort.js";
import { initDetail } from "./ui/detail.js";
import { initTabs, showTab } from "./ui/tabs.js";
import { initHome, renderHome, armLedger } from "./features/home.js";
import { initLevelUp } from "./ui/levelUp.js";
import { initGates } from "./features/gates.js";
import { initSession, renderFocusQuests, renderToday, chime } from "./features/session.js";
import { initHearth } from "./features/hearth.js";
import { wipItems } from "./core/wip.js";

// The In Progress block above the board. Split out because it is the only
// thing outside quests.js that the search/tag filter applies to.
function renderProgressGrid() {
  var section = document.getElementById("questsInProgress");
  var grid = document.getElementById("progressGrid");
  var inProgress = getInProgressQuests();

  section.hidden = inProgress.length === 0;
  grid.innerHTML = inProgress.map(cardHtml).join("");
  bindQuestActions(grid);
}

function renderProgress() {
  renderProgressGrid();

  // All of these depend on what's in progress, so they follow it rather than
  // being refreshed on their own schedule.
  renderFocusQuests();
  renderHome();
  renderStandup();
  pushInFlight();
}

// The In Flight panel is a window of its own, so it is pushed to rather than
// rendered: main.js relays whatever the board sends. Built from the unfiltered
// lists, because a search term in the Quests tab must not empty the panel —
// see core/wip.js. Called from the two data-change paths only, not from the
// filter-only redraw.
function pushInFlight() {
  if (!window.panel) return;
  window.panel.push(wipItems(getAllQuests(), getAllTasks()));
}

function renderTaskSection(sectionId, gridId, tasks) {
  var sectionEl = document.getElementById(sectionId);
  var gridEl = document.getElementById(gridId);

  sectionEl.hidden = tasks.length === 0;
  gridEl.innerHTML = tasks.map(taskCardHtml).join("");
  bindTaskActions(gridEl);
  enableDragSort(gridEl, persistTaskOrder);
}

// The archive is a <details>, so it keeps its own folded state across renders;
// no drag sort, because it is ordered by finish date rather than by hand.
function renderTaskArchive() {
  var archived = getArchivedTasks();
  var detailsEl = document.getElementById("tasksArchive");
  var gridEl = document.getElementById("tasksArchiveGrid");

  detailsEl.hidden = archived.length === 0;
  document.getElementById("tasksArchiveCount").textContent = String(archived.length);
  gridEl.innerHTML = archived.map(taskCardHtml).join("");
  bindTaskActions(gridEl);
}

function renderTasks() {
  renderTaskSection("progressTasks", "progressTasksGrid", getTasksByStatus("in_progress"));
  renderTaskSection("nextUpTasks", "nextUpTasksGrid", getNextUpTasks());
  renderTaskSection("backlogTasks", "backlogTasksGrid", getTasksByStatus("backlog"));
  renderTaskSection("tasksHallOfFame", "tasksHallOfFameGrid", getTasksByStatus("done"));
  renderTaskArchive();

  document.getElementById("tasksEmpty").hidden = getAllTasks().length > 0;
  renderHome();
  renderStandup();
  pushInFlight();
}

function homeData() {
  return {
    quests: getAllQuests(),
    tasks: getAllTasks(),
    questCounts: questCounts(),
    taskCounts: taskCounts()
  };
}

function standupData() {
  return { quests: getAllQuests(), tasks: getAllTasks(), sessions: getSessions() };
}

function anyModalOpen() {
  return !!document.querySelector(".modal-overlay:not([hidden])");
}

// Switch tabs before opening the form: new items land in a backlog, so
// creating one from another tab would otherwise appear to do nothing.
function startCreate(kind) {
  if (anyModalOpen()) return;
  if (kind === "task") {
    showTab("tasks");
    openCreateTask();
  } else {
    showTab("quests");
    openCreateQuest();
  }
}

function initShortcuts() {
  document.addEventListener("keydown", function (e) {
    if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "n") return;
    // Not in peace: a form would open unseen under it, and the Escape meant
    // to leave would close the form as well.
    if (anyModalOpen() || document.body.getAttribute("data-mode") === "peace") return;
    e.preventDefault();
    startCreate(e.shiftKey ? "task" : "quest");
  });

  // The hearth's right-click menu: main.js expands to the board first, then
  // says which form to open.
  if (window.windowControls && window.windowControls.onCreate) {
    window.windowControls.onCreate(startCreate);
  }
}

initTheme();
initTitlebar();
initShortcuts();
initTabs(function (tab) {
  // The standup groups by day, so it is redrawn on the way in rather than
  // trusting a render from before midnight.
  if (tab === "standup") renderStandup();
});
initDetail();
initGates();

// A finished session changes the worked-time totals the scope note reads, so
// refresh sessions before re-rendering the quests that depend on them.
initSession({
  quests: getAllQuests,
  onEnded: function () {
    refreshSessions().then(function () {
      renderToday(getSessions());
      return refetchQuests();
    });
  }
});
initLevelUp();
initHome(homeData, { onLevelUp: chime });
initStandup(standupData, { quest: questDetail, task: taskDetail });
// The quote comes from a different pool in peace mode, so every switch
// repaints it.
initHearth({ onModeChange: renderHome });
initQuests(renderProgress, renderProgressGrid);
initTasks(renderTasks);
// Static markup, so bound once; the quest board binds its own on each render.
document.getElementById("archiveDoneTasksBtn").addEventListener("click", archiveDoneTasks);

// Renders again once the motd pools land — the first render above runs before
// they arrive and would leave the footer blank until the next repaint.
initMotd().then(renderHome);
renderToday([]);

Promise.all([loadQuests(), loadTasks()]).then(function () {
  renderToday(getSessions());
  armLedger();
}).catch(function () {
  document.getElementById("board").innerHTML = '<div class="empty-state">Could not load the quest log right now.</div>';
});
