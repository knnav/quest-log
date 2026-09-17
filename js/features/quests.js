// The Quests tab: the board, the search/tag filter, and the quest form.
//
// This module holds the quest list in memory (`latestDocs`) and is the only
// writer of quests — every change goes out over window.questLog and comes back
// through refetchQuests, so the store stays the source of truth and the board
// is always a render of what was actually persisted.
//
// It re-renders wholesale rather than patching cards, which is what lets the
// filter, the board and the In Progress block above it stay consistent.
//
// `onChange` is app.js's hook: it re-renders everything outside this tab that
// depends on quests (the In Progress block, the focus picker, the home screen).

import { TIERS, TIER_LABEL, STATUSES, STATUS_LABEL, WIP_LIMIT, countByStatus } from "../core/domain.js";
import { escapeHtml } from "../core/html.js";
import { daysSince, spanMs, MS_PER_DAY } from "../core/dates.js";
import { enableDragSort } from "../ui/dragSort.js";
import { bindCardDetail } from "../ui/detail.js";
import { scopeRecord } from "../core/records.js";
import { formatWorked } from "../core/sessionFormat.js";
import { confirmShip, confirmWip } from "./gates.js";
import { createModal } from "../ui/modal.js";

var allTags = [];
var activeTags = [];
var searchTerm = "";
var latestDocs = [];
var latestSessions = [];
var onChange = null;
var questModal = null;

var boardEl, filtersEl, searchEl, scopeNoteEl;

export function initQuests(onQuestsChanged) {
  onChange = onQuestsChanged;

  boardEl = document.getElementById("board");
  filtersEl = document.getElementById("filters");
  searchEl = document.getElementById("questSearch");
  scopeNoteEl = document.getElementById("questScopeNote");

  questModal = createModal({
    overlay: "questModalOverlay",
    form: "questForm",
    heading: "questModalTitle",
    cancel: "questCancelBtn",
    addButton: "addQuestBtn",
    headings: { create: "Add Quest", edit: "Edit Quest" },
    fields: [
      { id: "questTitle", key: "title" },
      { id: "questHook", key: "hook" },
      { id: "questTier", key: "tier", fallback: "weekend" },
      {
        id: "questTags", key: "tags",
        read: function (raw) {
          return raw.split(",").map(function (t) { return t.trim(); }).filter(Boolean);
        },
        write: function (tags) { return (tags || []).join(", "); }
      },
      { id: "questDod", key: "dod" }
    ],
    // Populated after the fields are set, so it reads the item's own scope.
    onOpen: renderScopeNote,
    create: function (data) { return window.questLog.createQuest(data); },
    update: function (id, data) { return window.questLog.updateQuest(id, data); },
    onSaved: refetchQuests
  });

  questModal.field("tier").addEventListener("change", renderScopeNote);

  if (searchEl) {
    searchEl.addEventListener("input", function () {
      searchTerm = searchEl.value.trim().toLowerCase();
      rerender();
    });
  }
}

export function openCreateQuest() {
  questModal.open(null);
}

export function loadQuests() {
  return refreshSessions().then(function () {
    return window.questLog.listQuests().then(ingest);
  });
}

// Sessions are only needed for the scope note's worked-time figure, and only
// change when a session ends — so they are fetched on load and on session end,
// not on every render.
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

// Applied to every quest the tab shows, including the In Progress block that
// renders outside this module. Tags combine with AND — each active chip must
// be present — while the search term is a substring match across all text.
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

// Newest finish first. Used for the Hall of Fame and Ashes, which are ordered
// by when they ended rather than by the drag order the backlog uses.
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
  return countByStatus(latestDocs, STATUSES.concat("let_go"));
}

export function cardHtml(q) {
  var tags = (q.tags || []).map(function (t) {
    return '<span class="tag">' + escapeHtml(t) + '</span>';
  }).join("");

  var statusBtns = STATUSES.map(function (s) {
    return '<button class="status-btn ' + (q.status === s ? "on " + s : "") + '" data-id="' + q.id +
      '" data-status="' + s + '">' + STATUS_LABEL[s] + '</button>';
  }).join("");

  // Only terminal cards carry a date line; backlog and in-progress ones don't.
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
      onEdit: function () { questModal.open(quest); },
      onDelete: function () { return onDeleteQuest(quest.id); },
      letGo: quest.status === "let_go" ? null : function () { return onLetGo(quest); }
    };
  });
}

function detailRows(q) {
  var rows = [{ label: "Done when", value: q.dod }];

  var waiting = q.status === "backlog" ? daysSince(q.createdAt) : null;
  if (waiting !== null) {
    rows.push({ label: "Waiting", value: waiting + " days in the backlog" });
  }
  if (q.status === "in_progress" && q.startedAt) {
    rows.push({ label: "Started", value: relativeDay(q.startedAt) });
  }
  if (q.finishedAt && (q.status === "shipped" || q.status === "let_go")) {
    // An undated or impossible span is left off rather than shown as nothing.
    var took = spanDays(q.startedAt, q.finishedAt);
    rows.push({
      label: q.status === "let_go" ? "Let go" : "Shipped",
      value: relativeDay(q.finishedAt) + (took === null ? "" : " · took " + took + " days")
    });
  }
  return rows;
}

// At least a day, because "took 0 days" reads as though nothing happened.
function spanDays(fromIso, toIso) {
  var ms = spanMs(fromIso, toIso);
  return ms === null ? null : Math.max(1, Math.round(ms / MS_PER_DAY));
}

function relativeDay(iso) {
  var days = daysSince(iso);
  if (days === null) return "at some point";
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return days + " days ago";
  var months = Math.round(days / 30);
  return months === 1 ? "a month ago" : months + " months ago";
}

// The single entry point for status changes from the board. Both gates live
// here rather than on the pill handler, so no path can set a status without
// passing them. setStatus is the raw write and must not be called directly.
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

  // Sections are mutually exclusive by status, so every quest appears exactly
  // once: in progress (rendered by app.js above this board), its scope section,
  // the Hall of Fame, or Ashes.
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

  // Per-grid, not per-board: dragging must not move a card between sections,
  // and each section persists its own order.
  boardEl.querySelectorAll(".grid").forEach(function (grid) {
    enableDragSort(grid, persistQuestOrder);
  });
}

function persistQuestOrder(ids) {
  window.questLog.reorderQuests(ids).then(refetchQuests).catch(function () {});
}

function rerender() {
  renderBoard(latestDocs);
  // onChange redraws the In Progress block, which app.js owns but this filters.
  if (onChange) onChange();
}

function ingest(docs) {
  docs = (docs || []).filter(function (d) { return d.title; });

  var tagSet = {};
  docs.forEach(function (d) { (d.tags || []).forEach(function (t) { tagSet[t] = true; }); });
  allTags = Object.keys(tagSet).sort();

  // Drop active tags that no longer exist on any quest, or the filter would
  // stick on a chip the user can no longer see or clear.
  activeTags = activeTags.filter(function (t) { return allTags.indexOf(t) !== -1; });

  latestDocs = docs;
  renderFilters();
  renderBoard(docs);
  if (onChange) onChange();
}

// The scope's track record, shown under the Scope select as it changes.
// Hidden rather than blanked when there is no history for that scope yet.
function renderScopeNote() {
  if (!scopeNoteEl) return;
  var record = scopeRecord(latestDocs, questModal.field("tier").value, latestSessions);

  if (!record) {
    scopeNoteEl.textContent = "";
    scopeNoteEl.hidden = true;
    return;
  }

  var worked = record.workedMs ? ", " + formatWorked(record.workedMs) + " of tracked work" : "";
  scopeNoteEl.textContent = "Your " + TIER_LABEL[questModal.field("tier").value] +
    " quests have taken " + record.days + (record.days === 1 ? " day" : " days") +
    " on average (" + record.shipped + " shipped" + worked + ").";
  scopeNoteEl.hidden = false;
}

