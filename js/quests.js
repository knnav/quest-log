import { TIERS, STATUSES, STATUS_LABEL } from "./constants.js";
import { escapeHtml } from "./utils.js";
import { enableDragSort } from "./dragSort.js";
import { bindCardDetail } from "./detail.js";

var allTags = [];
var activeFilter = "all";
var latestDocs = [];
var editingQuestId = null;
var onChange = null;

var boardEl, filtersEl;
var addQuestBtn, questModalOverlay, questForm, questModalTitle, questCancelBtn;

export function initQuests(onQuestsChanged) {
  onChange = onQuestsChanged;

  boardEl = document.getElementById("board");
  filtersEl = document.getElementById("filters");

  addQuestBtn = document.getElementById("addQuestBtn");
  questModalOverlay = document.getElementById("questModalOverlay");
  questForm = document.getElementById("questForm");
  questModalTitle = document.getElementById("questModalTitle");
  questCancelBtn = document.getElementById("questCancelBtn");

  addQuestBtn.addEventListener("click", function () { openQuestModal(null); });
  questCancelBtn.addEventListener("click", closeQuestModal);
  questModalOverlay.addEventListener("click", function (e) {
    if (e.target === questModalOverlay) closeQuestModal();
  });
  questForm.addEventListener("submit", onQuestFormSubmit);

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !questModalOverlay.hidden) closeQuestModal();
  });
}

export function openCreateQuest() {
  openQuestModal(null);
}

export function loadQuests() {
  return window.questLog.listQuests().then(ingest);
}

export function refetchQuests() {
  return window.questLog.listQuests().then(ingest);
}

// The tag chips sit above the whole tab, so they filter the whole tab —
// the In Progress block included, not just the board underneath it.
function matchesFilter(q) {
  return activeFilter === "all" || (q.tags || []).indexOf(activeFilter) !== -1;
}

export function getInProgressQuests() {
  return latestDocs
    .filter(function (q) { return q.status === "in_progress" && matchesFilter(q); })
    .sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
}

export function getAllQuests() {
  return latestDocs;
}

export function getStatusCounts() {
  var counts = { backlog: 0, in_progress: 0, shipped: 0 };
  latestDocs.forEach(function (q) { counts[q.status] = (counts[q.status] || 0) + 1; });
  return counts;
}

export function cardHtml(q) {
  var tags = (q.tags || []).map(function (t) {
    return '<span class="tag">' + escapeHtml(t) + '</span>';
  }).join("");

  var statusBtns = STATUSES.map(function (s) {
    return '<button class="status-btn ' + (q.status === s ? "on " + s : "") + '" data-id="' + q.id +
      '" data-status="' + s + '">' + STATUS_LABEL[s] + '</button>';
  }).join("");

  return (
    '<div class="card quest-card" data-id="' + q.id + '" data-drag-id="' + q.id + '">' +
    '<div class="card-head">' +
    '<h3 class="card-title">' + escapeHtml(q.title) + '</h3>' +
    '</div>' +
    '<div class="tags">' + tags + '</div>' +
    '<div class="status-row">' + statusBtns + '</div>' +
    '</div>'
  );
}

export function bindQuestActions(container) {
  container.querySelectorAll(".quest-card .status-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      setStatus(btn.getAttribute("data-id"), btn.getAttribute("data-status"));
    });
  });

  bindCardDetail(container, ".quest-card", function (id) {
    var quest = latestDocs.filter(function (q) { return q.id === id; })[0];
    if (!quest) return null;
    return {
      title: quest.title,
      tags: quest.tags || [],
      text: quest.hook,
      rows: [{ label: "Done when", value: quest.dod }],
      onEdit: function () { openQuestModal(quest); },
      onDelete: function () { return onDeleteQuest(quest.id); }
    };
  });
}

function setStatus(id, status) {
  window.questLog.updateQuest(id, { status: status }).then(refetchQuests).catch(function () {});
}

function onDeleteQuest(id) {
  if (!window.confirm("Delete this quest? This cannot be undone.")) return false;
  window.questLog.deleteQuest(id).then(refetchQuests).catch(function () {});
  return true;
}

function renderFilters() {
  var tags = ["all"].concat(allTags);
  filtersEl.innerHTML = "";
  tags.forEach(function (tag) {
    var btn = document.createElement("button");
    btn.className = "chip" + (activeFilter === tag ? " active" : "");
    btn.textContent = tag === "all" ? "All" : tag;
    btn.addEventListener("click", function () {
      activeFilter = tag;
      renderFilters();
      renderBoard(latestDocs);
      // Re-renders the In Progress block, which the filter now covers too.
      if (onChange) onChange();
    });
    filtersEl.appendChild(btn);
  });
}

function renderBoard(quests) {
  if (!quests.length) {
    boardEl.innerHTML = '<div class="empty-state">Quest log is empty.</div>';
    return;
  }

  // In-progress quests have their own block above the board. Excluding them
  // here is the point: without it the same card renders twice on one screen.
  var filtered = quests.filter(function (q) {
    return q.status !== "in_progress" && matchesFilter(q);
  });

  var html = "";
  TIERS.forEach(function (tier) {
    var inTier = filtered.filter(function (q) { return q.tier === tier.key; })
      .sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    if (!inTier.length) return;
    html +=
      '<section class="tier">' +
      '<div class="tier-head"><h2 class="tier-title">' + tier.title + '</h2></div>' +
      '<div class="grid">' + inTier.map(cardHtml).join("") + '</div>' +
      '</section>';
  });

  if (!html) {
    html = activeFilter === "all"
      ? '<div class="empty-state">Everything you have is in progress. Nothing left on the board.</div>'
      : '<div class="empty-state">No quests match this filter.</div>';
  }
  boardEl.innerHTML = html;

  bindQuestActions(boardEl);

  // Each tier sorts independently, so drag-sorting is scoped to one tier's grid.
  boardEl.querySelectorAll(".grid").forEach(function (grid) {
    enableDragSort(grid, persistQuestOrder);
  });
}

function persistQuestOrder(ids) {
  window.questLog.reorderQuests(ids).then(refetchQuests).catch(function () {});
}

function ingest(docs) {
  docs = (docs || []).filter(function (d) { return d.title; });

  var tagSet = {};
  docs.forEach(function (d) { (d.tags || []).forEach(function (t) { tagSet[t] = true; }); });
  allTags = Object.keys(tagSet).sort();

  latestDocs = docs;
  renderFilters();
  renderBoard(docs);
  if (onChange) onChange();
}

function openQuestModal(quest) {
  editingQuestId = quest ? quest.id : null;
  questModalTitle.textContent = quest ? "Edit Quest" : "Add Quest";
  document.getElementById("questTitle").value = quest ? quest.title : "";
  document.getElementById("questHook").value = quest ? quest.hook : "";
  document.getElementById("questTier").value = quest ? quest.tier : "weekend";
  document.getElementById("questTags").value = quest && quest.tags ? quest.tags.join(", ") : "";
  document.getElementById("questDod").value = quest ? quest.dod : "";
  questModalOverlay.hidden = false;
}

function closeQuestModal() {
  questModalOverlay.hidden = true;
  questForm.reset();
  editingQuestId = null;
}

function onQuestFormSubmit(e) {
  e.preventDefault();
  var data = {
    title: document.getElementById("questTitle").value.trim(),
    hook: document.getElementById("questHook").value.trim(),
    tier: document.getElementById("questTier").value,
    tags: document.getElementById("questTags").value.split(",")
      .map(function (t) { return t.trim(); })
      .filter(Boolean),
    dod: document.getElementById("questDod").value.trim()
  };

  var promise = editingQuestId
    ? window.questLog.updateQuest(editingQuestId, data)
    : window.questLog.createQuest(data);

  promise.then(function () {
    closeQuestModal();
    return refetchQuests();
  }).catch(function () {});
}
