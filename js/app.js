import { initTheme } from "./theme.js";
import { initTitlebar } from "./titlebar.js";
import { initQuests, loadQuests, cardHtml, bindQuestActions, getInProgressQuests } from "./quests.js";
import { initPinned, loadPinned, pinnedCardHtml, bindPinnedActions, getPinnedList } from "./pinned.js";

function renderProgress() {
  var progressGridEl = document.getElementById("progressGrid");
  progressGridEl.innerHTML =
    getPinnedList().map(pinnedCardHtml).join("") +
    getInProgressQuests().map(cardHtml).join("");

  bindPinnedActions(progressGridEl);
  bindQuestActions(progressGridEl);
}

initTheme();
initTitlebar();
initQuests(renderProgress);
initPinned(renderProgress);

Promise.all([loadQuests(), loadPinned()]).catch(function () {
  document.getElementById("board").innerHTML = '<div class="empty-state">Could not load the quest log right now.</div>';
});
