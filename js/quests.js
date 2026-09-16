import { TIERS, STATUSES, STATUS_LABEL } from "./constants.js";
import { escapeHtml } from "./utils.js";
import { enableDragSort } from "./dragSort.js";

var allTags = [];
var activeFilter = "all";
var latestDocs = [];
var editingQuestId = null;
var onChange = null;

var boardEl, statsEl, filtersEl;
var addQuestBtn, questModalOverlay, questForm, questModalTitle, questCancelBtn;

export function initQuests(onQuestsChanged) {
  onChange = onQuestsChanged;

  boardEl = document.getElementById("board");
  statsEl = document.getElementById("stats");
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

export function getInProgressQuests() {
  return latestDocs
    .filter(function (q) { return q.status === "in_progress"; })
    .sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
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
    '<div class="card" data-drag-id="' + q.id + '">' +
    '<div class="card-head">' +
    '<h3 class="card-title">' + escapeHtml(q.title) + '</h3>' +
    '<div class="card-actions">' +
    '<button class="icon-btn quest-edit-btn" data-id="' + q.id + '">Edit</button>' +
    '<button class="icon-btn danger quest-delete-btn" data-id="' + q.id + '">Delete</button>' +
    '</div>' +
    '</div>' +
    '<p class="card-hook">' + escapeHtml(q.hook) + '</p>' +
    '<div class="tags">' + tags + '</div>' +
    '<div class="dod"><b>Done when</b>' + escapeHtml(q.dod) + '</div>' +
    '<div class="status-row">' + statusBtns + '</div>' +
    '</div>'
  );
}

export function bindQuestActions(container) {
  container.querySelectorAll(".status-btn:not(.pinned-status-btn)").forEach(function (btn) {
    btn.addEventListener("click", function () {
      setStatus(btn.getAttribute("data-id"), btn.getAttribute("data-status"));
    });
  });

  container.querySelectorAll(".quest-edit-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var id = btn.getAttribute("data-id");
      var quest = latestDocs.filter(function (q) { return q.id === id; })[0];
      if (quest) openQuestModal(quest);
    });
  });

  container.querySelectorAll(".quest-delete-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      onDeleteQuest(btn.getAttribute("data-id"));
    });
  });
}

function setStatus(id, status) {
  window.questLog.updateQuest(id, { status: status }).then(refetchQuests).catch(function () {});
}

function onDeleteQuest(id) {
  if (!window.confirm("Delete this quest? This cannot be undone.")) return;
  window.questLog.deleteQuest(id).then(refetchQuests).catch(function () {});
}

function renderStats(quests) {
  var counts = { backlog: 0, in_progress: 0, shipped: 0 };
  quests.forEach(function (q) { counts[q.status] = (counts[q.status] || 0) + 1; });
  statsEl.innerHTML =
    '<div class="stat backlog"><div class="n">' + counts.backlog + '</div><div class="l">Backlog</div></div>' +
    '<div class="stat progress"><div class="n">' + counts.in_progress + '</div><div class="l">In Progress</div></div>' +
    '<div class="stat shipped"><div class="n">' + counts.shipped + '</div><div class="l">Shipped</div></div>';
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
    });
    filtersEl.appendChild(btn);
  });
}

function renderBoard(quests) {
  if (!quests.length) {
    boardEl.innerHTML = '<div class="empty-state">Quest log is empty.</div>';
    return;
  }

  renderStats(quests);

  var filtered = activeFilter === "all"
    ? quests
    : quests.filter(function (q) { return (q.tags || []).indexOf(activeFilter) !== -1; });

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

  boardEl.innerHTML = html || '<div class="empty-state">No quests match this filter.</div>';

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
