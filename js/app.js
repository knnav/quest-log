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
  bindQuestActions, getInProgressQuests, openCreateQuest, getAllQuests,
  getStatusCounts as questCounts
} from "./features/quests.js";
import {
  initTasks, loadTasks, taskCardHtml, bindTaskActions,
  getTasksByStatus, openCreateTask, persistTaskOrder,
  getAllTasks, getStatusCounts as taskCounts
} from "./features/tasks.js";
import { enableDragSort } from "./ui/dragSort.js";
import { initDetail } from "./ui/detail.js";
import { initTabs, showTab } from "./ui/tabs.js";
import { initHome, renderHome } from "./features/home.js";
import { initGates } from "./features/gates.js";
import { initSession, renderFocusQuests, renderToday } from "./features/session.js";

function renderProgress() {
  var section = document.getElementById("questsInProgress");
  var grid = document.getElementById("progressGrid");
  var inProgress = getInProgressQuests();

  section.hidden = inProgress.length === 0;
  grid.innerHTML = inProgress.map(cardHtml).join("");
  bindQuestActions(grid);

  // Both depend on what's in progress, so they follow it rather than being
  // refreshed on their own schedule.
  renderFocusQuests();
  renderHome();
}

function renderTaskSection(sectionId, gridId, tasks) {
  var sectionEl = document.getElementById(sectionId);
  var gridEl = document.getElementById(gridId);

  sectionEl.hidden = tasks.length === 0;
  gridEl.innerHTML = tasks.map(taskCardHtml).join("");
  bindTaskActions(gridEl);
  enableDragSort(gridEl, persistTaskOrder);
}

function renderTasks() {
  renderTaskSection("progressTasks", "progressTasksGrid", getTasksByStatus("in_progress"));
  renderTaskSection("backlogTasks", "backlogTasksGrid", getTasksByStatus("backlog"));
  renderTaskSection("tasksHallOfFame", "tasksHallOfFameGrid", getTasksByStatus("done"));

  document.getElementById("tasksEmpty").hidden = getAllTasks().length > 0;
  renderHome();
}

function homeData() {
  return {
    quests: getAllQuests(),
    tasks: getAllTasks(),
    questCounts: questCounts(),
    taskCounts: taskCounts()
  };
}

function anyModalOpen() {
  return !!document.querySelector(".modal-overlay:not([hidden])");
}

function initShortcuts() {
  document.addEventListener("keydown", function (e) {
    if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "n") return;
    if (anyModalOpen()) return;
    e.preventDefault();

    // Switch tabs before opening the form: new items land in a backlog, so
    // creating one from another tab would otherwise appear to do nothing.
    if (e.shiftKey) {
      showTab("tasks");
      openCreateTask();
    } else {
      showTab("quests");
      openCreateQuest();
    }
  });
}

initTheme();
initTitlebar();
initShortcuts();
// One create button in the header, retargeted per tab — two buttons plus the
// tab bar do not fit the 380px minimum window width.
function syncCreateButton(tab) {
  document.getElementById("addQuestBtn").hidden = tab === "tasks";
  document.getElementById("addTaskBtn").hidden = tab !== "tasks";
}

initTabs(syncCreateButton);
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
initHome(homeData);
initQuests(renderProgress);
initTasks(renderTasks);

// Renders again once the motd pools land — the first render above runs before
// they arrive and would leave the footer blank until the next repaint.
initMotd().then(renderHome);
renderToday([]);

Promise.all([loadQuests(), loadTasks()]).then(function () {
  renderToday(getSessions());
}).catch(function () {
  document.getElementById("board").innerHTML = '<div class="empty-state">Could not load the quest log right now.</div>';
});
