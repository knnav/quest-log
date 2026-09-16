import { TIERS, STATUSES, STATUS_LABEL, WIP_LIMIT } from "./constants.js";
import { escapeHtml } from "./utils.js";
import { enableDragSort } from "./dragSort.js";
import { bindCardDetail } from "./detail.js";
import { scopeRecord } from "./fire.js";
import { formatWorked } from "./sessionFormat.js";
import { confirmShip, confirmWip } from "./gates.js";

var allTags = [];
var activeTags = [];
var searchTerm = "";
var latestDocs = [];
var latestSessions = [];
var editingQuestId = null;
var onChange = null;

var boardEl, filtersEl, searchEl, scopeNoteEl;
var addQuestBtn, questModalOverlay, questForm, questModalTitle, questCancelBtn, questTierEl;

export function initQuests(onQuestsChanged) {
  onChange = onQuestsChanged;

  boardEl = document.getElementById("board");
  filtersEl = document.getElementById("filters");
  searchEl = document.getElementById("questSearch");
  scopeNoteEl = document.getElementById("questScopeNote");

  addQuestBtn = document.getElementById("addQuestBtn");
  questModalOverlay = document.getElementById("questModalOverlay");
  questForm = document.getElementById("questForm");
  questModalTitle = document.getElementById("questModalTitle");
  questCancelBtn = document.getElementById("questCancelBtn");
  questTierEl = document.getElementById("questTier");

  addQuestBtn.addEventListener("click", function () { openQuestModal(null); });
  questCancelBtn.addEventListener("click", closeQuestModal);
  questModalOverlay.addEventListener("click", function (e) {
    if (e.target === questModalOverlay) closeQuestModal();
  });
  questForm.addEventListener("submit", onQuestFormSubmit);
  questTierEl.addEventListener("change", renderScopeNote);

  if (searchEl) {
    searchEl.addEventListener("input", function () {
      searchTerm = searchEl.value.trim().toLowerCase();
      rerender();
    });
  }

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !questModalOverlay.hidden) closeQuestModal();
  });
}

export function openCreateQuest() {
  openQuestModal(null);
}

export function loadQuests() {
  return refreshSessions().then(function () {
    return window.questLog.listQuests().then(ingest);
  });
}

// Worked time only changes when a session ends, so this is pulled on load and
// whenever one finishes rather than on every render.
export function getSessions() {
  return latestSessions;
}

export function refreshSessions() {
  if (!window.questLog.listSessions) return Promise.resolve();
  return window.questLog.listSessions().then(function (rows) {
    latestSessions = rows || [];
  }).catch(function () {});
}

export function refetchQuests() {
  return window.questLog.listQuests().then(ingest);
}

// The filter row sits above the whole tab, so it filters the whole tab — the
// In Progress block included, not just the board underneath it. Tags are AND:
// each chip you add narrows further, which is the only useful direction.
function matchesFilter(q) {
  var tags = q.tags || [];
  var hasAllTags = activeTags.every(function (t) { return tags.indexOf(t) !== -1; });
  if (!hasAllTags) return false;
  if (!searchTerm) return true;

  var haystack = [q.title, q.hook, q.dod].concat(tags).join(" ").toLowerCase();
  return haystack.indexOf(searchTerm) !== -1;
}

function byOrder(a, b) {
  return (a.order || 0) - (b.order || 0);
}

// Most recently finished first: a trophy case reads newest-on-top.
function byFinishedDesc(a, b) {
  return new Date(b.finishedAt || 0) - new Date(a.finishedAt || 0);
}

export function getInProgressQuests() {
  return latestDocs
    .filter(function (q) { return q.status === "in_progress" && matchesFilter(q); })
    .sort(byOrder);
}

export function getAllQuests() {
  return latestDocs;
}

export function getStatusCounts() {
  var counts = { backlog: 0, in_progress: 0, shipped: 0, let_go: 0 };
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

  // Finished cards say when. That's the whole point of a Hall of Fame.
  var finished = "";
  if ((q.status === "shipped" || q.status === "let_go") && q.finishedAt) {
    finished = '<p class="card-when">' + (q.status === "let_go" ? "Let go " : "Shipped ") +
      escapeHtml(relativeDay(q.finishedAt)) + '</p>';
  }

  var classes = "card quest-card" + (q.status === "let_go" ? " let-go-card" : "");

  return (
    '<div class="' + classes + '" data-id="' + q.id + '" data-drag-id="' + q.id + '">' +
    '<div class="card-head">' +
    '<h3 class="card-title">' + escapeHtml(q.title) + '</h3>' +
    '</div>' +
    '<div class="tags">' + tags + '</div>' +
    finished +
    '<div class="status-row">' + statusBtns + '</div>' +
    '</div>'
  );
}

export function bindQuestActions(container) {
  container.querySelectorAll(".quest-card .status-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      requestStatus(btn.getAttribute("data-id"), btn.getAttribute("data-status"));
    });
  });

  bindCardDetail(container, ".quest-card", function (id) {
    var quest = latestDocs.filter(function (q) { return q.id === id; })[0];
    if (!quest) return null;
    return {
      title: quest.title,
      tags: quest.tags || [],
      text: quest.hook,
      rows: detailRows(quest),
      onEdit: function () { openQuestModal(quest); },
      onDelete: function () { return onDeleteQuest(quest.id); },
      letGo: quest.status === "let_go" ? null : function () { return onLetGo(quest); }
    };
  });
}

function detailRows(q) {
  var rows = [{ label: "Done when", value: q.dod }];

  if (q.status === "backlog" && q.createdAt) {
    rows.push({ label: "Waiting", value: daysSince(q.createdAt) + " days in the backlog" });
  }
  if (q.status === "in_progress" && q.startedAt) {
    rows.push({ label: "Started", value: relativeDay(q.startedAt) });
  }
  if (q.finishedAt && (q.status === "shipped" || q.status === "let_go")) {
    rows.push({
      label: q.status === "let_go" ? "Let go" : "Shipped",
      value: relativeDay(q.finishedAt) + (q.startedAt ? " · took " + spanDays(q.startedAt, q.finishedAt) + " days" : "")
    });
  }
  return rows;
}

function daysSince(iso) {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
}

function spanDays(fromIso, toIso) {
  var ms = new Date(toIso).getTime() - new Date(fromIso).getTime();
  return Math.max(1, Math.round(ms / 86400000));
}

function relativeDay(iso) {
  var days = daysSince(iso);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return days + " days ago";
  var months = Math.round(days / 30);
  return months === 1 ? "a month ago" : months + " months ago";
}

// Every status change routes through here so the gates can't be bypassed by
// clicking a pill instead of using a menu.
function requestStatus(id, status) {
  var quest = latestDocs.filter(function (q) { return q.id === id; })[0];
  if (!quest || quest.status === status) return;

  if (status === "shipped") {
    confirmShip(quest, function () { setStatus(id, status); });
    return;
  }

  if (status === "in_progress") {
    var inFlight = latestDocs.filter(function (q) { return q.status === "in_progress"; });
    if (inFlight.length >= WIP_LIMIT) {
      confirmWip(quest, inFlight, {
        onBenchAll: function () {
          benchAll(inFlight).then(function () { setStatus(id, status); });
        },
        onProceed: function () { setStatus(id, status); }
      });
      return;
    }
  }

  setStatus(id, status);
}

function benchAll(quests) {
  return Promise.all(quests.map(function (q) {
    return window.questLog.updateQuest(q.id, { status: "backlog" }).catch(function () {});
  }));
}

function setStatus(id, status) {
  window.questLog.updateQuest(id, { status: status }).then(refetchQuests).catch(function () {});
}

function onLetGo(quest) {
  if (!window.confirm('Let go of "' + quest.title + '"?\n\nIt moves to Ashes and gives the fire a little kindling. You can bring it back any time.')) return false;
  setStatus(quest.id, "let_go");
  return true;
}

function onDeleteQuest(id) {
  if (!window.confirm("Delete this quest? This cannot be undone.")) return false;
  window.questLog.deleteQuest(id).then(refetchQuests).catch(function () {});
  return true;
}

function renderFilters() {
  filtersEl.innerHTML = "";

  var all = document.createElement("button");
  all.className = "chip" + (activeTags.length ? "" : " active");
  all.textContent = "All";
  all.addEventListener("click", function () {
    activeTags = [];
    renderFilters();
    rerender();
  });
  filtersEl.appendChild(all);

  allTags.forEach(function (tag) {
    var btn = document.createElement("button");
    btn.className = "chip" + (activeTags.indexOf(tag) !== -1 ? " active" : "");
    btn.textContent = tag;
    btn.addEventListener("click", function () {
      var at = activeTags.indexOf(tag);
      if (at === -1) activeTags.push(tag);
      else activeTags.splice(at, 1);
      renderFilters();
      rerender();
    });
    filtersEl.appendChild(btn);
  });
}

function tierSection(title, quests, extraClass) {
  return '<section class="tier' + (extraClass ? " " + extraClass : "") + '">' +
    '<div class="tier-head"><h2 class="tier-title">' + escapeHtml(title) + '</h2></div>' +
    '<div class="grid">' + quests.map(cardHtml).join("") + '</div>' +
    '</section>';
}

function renderBoard(quests) {
  if (!quests.length) {
    boardEl.innerHTML = '<div class="empty-state">Quest log is empty.</div>';
    return;
  }

  var visible = quests.filter(matchesFilter);

  // Each quest lands in exactly one of four places: the In Progress block
  // above the board, a timebox section here, the Hall of Fame, or Ashes.
  var html = "";
  TIERS.forEach(function (tier) {
    var inTier = visible
      .filter(function (q) { return q.status === "backlog" && q.tier === tier.key; })
      .sort(byOrder);
    if (!inTier.length) return;
    html += tierSection(tier.title, inTier);
  });

  var shipped = visible.filter(function (q) { return q.status === "shipped"; }).sort(byFinishedDesc);
  if (shipped.length) html += tierSection("Hall of Fame", shipped);

  var letGo = visible.filter(function (q) { return q.status === "let_go"; }).sort(byFinishedDesc);
  if (letGo.length) html += tierSection("Ashes", letGo, "ashes-tier");

  if (!html) {
    html = (activeTags.length || searchTerm)
      ? '<div class="empty-state">Nothing matches that.</div>'
      : '<div class="empty-state">Everything you have is in progress. Nothing left on the board.</div>';
  }
  boardEl.innerHTML = html;

  bindQuestActions(boardEl);

  // Each section sorts independently, so drag-sorting is scoped to one grid.
  boardEl.querySelectorAll(".grid").forEach(function (grid) {
    enableDragSort(grid, persistQuestOrder);
  });
}

function persistQuestOrder(ids) {
  window.questLog.reorderQuests(ids).then(refetchQuests).catch(function () {});
}

function rerender() {
  renderBoard(latestDocs);
  // The In Progress block lives outside the board but inside the same filter.
  if (onChange) onChange();
}

function ingest(docs) {
  docs = (docs || []).filter(function (d) { return d.title; });

  var tagSet = {};
  docs.forEach(function (d) { (d.tags || []).forEach(function (t) { tagSet[t] = true; }); });
  allTags = Object.keys(tagSet).sort();

  // Drop any active tag that no longer exists on anything.
  activeTags = activeTags.filter(function (t) { return allTags.indexOf(t) !== -1; });

  latestDocs = docs;
  renderFilters();
  renderBoard(docs);
  if (onChange) onChange();
}

// Shown right under the Scope select, at the moment you're committing to one.
function renderScopeNote() {
  if (!scopeNoteEl) return;
  var record = scopeRecord(latestDocs, questTierEl.value, latestSessions);

  if (!record) {
    scopeNoteEl.textContent = "";
    scopeNoteEl.hidden = true;
    return;
  }

  var worked = record.workedMs ? ", " + formatWorked(record.workedMs) + " of tracked work" : "";
  scopeNoteEl.textContent = "Your " + questTierEl.options[questTierEl.selectedIndex].text.split(" \u2014")[0] +
    " quests have taken " + record.days + (record.days === 1 ? " day" : " days") +
    " on average (" + record.shipped + " shipped" + worked + ").";
  scopeNoteEl.hidden = false;
}

function openQuestModal(quest) {
  editingQuestId = quest ? quest.id : null;
  questModalTitle.textContent = quest ? "Edit Quest" : "Add Quest";
  document.getElementById("questTitle").value = quest ? quest.title : "";
  document.getElementById("questHook").value = quest ? quest.hook : "";
  questTierEl.value = quest ? quest.tier : "weekend";
  document.getElementById("questTags").value = quest && quest.tags ? quest.tags.join(", ") : "";
  document.getElementById("questDod").value = quest ? quest.dod : "";
  renderScopeNote();
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
    tier: questTierEl.value,
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
