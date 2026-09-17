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

  // What you can focus on is whatever is in flight, so it follows this.
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

// A finished session changes both the worked-time record and today's tally.
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

// The motd pool has to be in hand before the first home render, or the footer
// shows blank until something else happens to trigger a repaint.
initMotd().then(renderHome);
renderToday([]);

Promise.all([loadQuests(), loadTasks()]).then(function () {
  renderToday(getSessions());
}).catch(function () {
  document.getElementById("board").innerHTML = '<div class="empty-state">Could not load the quest log right now.</div>';
});
