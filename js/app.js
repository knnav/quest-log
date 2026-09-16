import { initTheme } from "./theme.js";
import { initTitlebar } from "./titlebar.js";
import { initMotd } from "./motd.js";
import {
  initQuests, loadQuests, cardHtml, bindQuestActions, getInProgressQuests,
  openCreateQuest, getAllQuests, getStatusCounts as questCounts
} from "./quests.js";
import {
  initTasks, loadTasks, taskCardHtml, bindTaskActions,
  getTasksByStatus, openCreateTask, persistTaskOrder,
  getAllTasks, getStatusCounts as taskCounts
} from "./tasks.js";
import { enableDragSort } from "./dragSort.js";
import { initDetail } from "./detail.js";
import { initTabs, showTab } from "./tabs.js";
import { initHome, renderHome } from "./home.js";
import { initGates } from "./gates.js";

function renderProgress() {
  var section = document.getElementById("questsInProgress");
  var grid = document.getElementById("progressGrid");
  var inProgress = getInProgressQuests();

  section.hidden = inProgress.length === 0;
  grid.innerHTML = inProgress.map(cardHtml).join("");
  bindQuestActions(grid);

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

    // New items land in a backlog, so send the user to the tab that will
    // actually show what they just created.
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
// Only the create button for the tab you're looking at is shown — two of them
// plus the tab bar does not fit the 380px minimum window width.
function syncCreateButton(tab) {
  document.getElementById("addQuestBtn").hidden = tab === "tasks";
  document.getElementById("addTaskBtn").hidden = tab !== "tasks";
}

initTabs(syncCreateButton);
initDetail();
initGates();
initHome(homeData);
initQuests(renderProgress);
initTasks(renderTasks);

// The motd pool has to be in hand before the first home render, or the footer
// shows blank until something else happens to trigger a repaint.
initMotd().then(renderHome);

Promise.all([loadQuests(), loadTasks()]).catch(function () {
  document.getElementById("board").innerHTML = '<div class="empty-state">Could not load the quest log right now.</div>';
});
