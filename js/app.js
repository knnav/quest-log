import { initTheme } from "./theme.js";
import { initTitlebar } from "./titlebar.js";
import { initMotd } from "./motd.js";
import { initQuests, loadQuests, cardHtml, bindQuestActions, getInProgressQuests } from "./quests.js";
import { initPinned, loadPinned, pinnedCardHtml, bindPinnedActions, getPinnedList } from "./pinned.js";
import { initSideQuests, loadSideQuests, sideQuestCardHtml, bindSideQuestActions, getSideQuestsByStatus } from "./sideQuests.js";

function renderProgress() {
  var progressGridEl = document.getElementById("progressGrid");
  progressGridEl.innerHTML =
    getPinnedList().map(pinnedCardHtml).join("") +
    getInProgressQuests().map(cardHtml).join("");

  bindPinnedActions(progressGridEl);
  bindQuestActions(progressGridEl);
}

function renderSideQuestSection(sectionId, gridId, sideQuests) {
  var sectionEl = document.getElementById(sectionId);
  var gridEl = document.getElementById(gridId);

  sectionEl.hidden = sideQuests.length === 0;
  gridEl.innerHTML = sideQuests.map(sideQuestCardHtml).join("");
  bindSideQuestActions(gridEl);
}

function renderSideQuests() {
  renderSideQuestSection("progressSideQuests", "progressSideQuestsGrid", getSideQuestsByStatus("in_progress"));
  renderSideQuestSection("backlogSideQuests", "backlogSideQuestsGrid", getSideQuestsByStatus("backlog"));
  renderSideQuestSection("hallOfFame", "hallOfFameGrid", getSideQuestsByStatus("done"));
}

initTheme();
initTitlebar();
initMotd();
initQuests(renderProgress);
initPinned(renderProgress);
initSideQuests(renderSideQuests);

Promise.all([loadQuests(), loadPinned(), loadSideQuests()]).catch(function () {
  document.getElementById("board").innerHTML = '<div class="empty-state">Could not load the quest log right now.</div>';
});
