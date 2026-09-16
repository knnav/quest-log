import { initTheme } from "./theme.js";
import { initTitlebar } from "./titlebar.js";
import { initMotd } from "./motd.js";
import {
  initQuests, loadQuests, cardHtml, bindQuestActions, getInProgressQuests,
  openCreateQuest, getAllQuests, getStatusCounts as questCounts
} from "./quests.js";
import {
  initSideQuests, loadSideQuests, sideQuestCardHtml, bindSideQuestActions,
  getSideQuestsByStatus, openCreateSideQuest, persistSideQuestOrder,
  getAllSideQuests, getStatusCounts as sideQuestCounts
} from "./sideQuests.js";
import { enableDragSort } from "./dragSort.js";
import { initDetail } from "./detail.js";
import { initTabs, showTab } from "./tabs.js";
import { initHome, renderHome } from "./home.js";

function renderProgress() {
  var section = document.getElementById("questsInProgress");
  var grid = document.getElementById("progressGrid");
  var inProgress = getInProgressQuests();

  section.hidden = inProgress.length === 0;
  grid.innerHTML = inProgress.map(cardHtml).join("");
  bindQuestActions(grid);

  renderHome();
}

function renderSideQuestSection(sectionId, gridId, sideQuests) {
  var sectionEl = document.getElementById(sectionId);
  var gridEl = document.getElementById(gridId);

  sectionEl.hidden = sideQuests.length === 0;
  gridEl.innerHTML = sideQuests.map(sideQuestCardHtml).join("");
  bindSideQuestActions(gridEl);
  enableDragSort(gridEl, persistSideQuestOrder);
}

function renderSideQuests() {
  renderSideQuestSection("progressSideQuests", "progressSideQuestsGrid", getSideQuestsByStatus("in_progress"));
  renderSideQuestSection("backlogSideQuests", "backlogSideQuestsGrid", getSideQuestsByStatus("backlog"));
  renderSideQuestSection("hallOfFame", "hallOfFameGrid", getSideQuestsByStatus("done"));

  document.getElementById("sideQuestsEmpty").hidden = getAllSideQuests().length > 0;
  renderHome();
}

function homeData() {
  return {
    quests: getAllQuests(),
    sideQuests: getAllSideQuests(),
    questCounts: questCounts(),
    sideQuestCounts: sideQuestCounts()
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
      showTab("sideQuests");
      openCreateSideQuest();
    } else {
      showTab("quests");
      openCreateQuest();
    }
  });
}

initTheme();
initTitlebar();
initMotd();
initShortcuts();
// Only the create button for the tab you're looking at is shown — two of them
// plus the tab bar does not fit the 380px minimum window width.
function syncCreateButton(tab) {
  document.getElementById("addQuestBtn").hidden = tab === "sideQuests";
  document.getElementById("addSideQuestBtn").hidden = tab !== "sideQuests";
}

initTabs(syncCreateButton);
initDetail();
initHome(homeData);
initQuests(renderProgress);
initSideQuests(renderSideQuests);

Promise.all([loadQuests(), loadSideQuests()]).catch(function () {
  document.getElementById("board").innerHTML = '<div class="empty-state">Could not load the quest log right now.</div>';
});
