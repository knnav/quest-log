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
// Archived quests stay in `latestDocs` — getAllQuests() hands them to the
// ledger, the fire and the scope record, which read history and must not lose
// it — and are only filtered out of the board's sections, where they sit
// folded under an Archive heading instead.
//
// `onChange` is app.js's hook: it re-renders everything outside this tab that
// depends on quests (the In Progress block, the focus picker, the home screen).
// `onFilterChange` is the narrower one for the search box and tag chips: only
// the In Progress block is filtered, so the home screen and focus picker are
// left alone rather than rebuilt (and the motd re-rolled) on every keystroke.

import {
  TIERS, TIER_LABEL, DEFAULT_TIER, STATUSES, STATUS_LABEL, WIP_LIMIT, countByStatus, isQuestTerminal, isImportant
} from "../core/domain.js";
import { escapeHtml } from "../core/html.js";
import { daysSince, spanMs, msOf, MS_PER_DAY } from "../core/dates.js";
import { enableDragSort } from "../ui/dragSort.js";
import { bindCardDetail } from "../ui/detail.js";
import { starHtml } from "../ui/star.js";
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
var onFilterChange = null;
var questModal = null;

var boardEl, filtersEl, searchEl, scopeNoteEl;

export function initQuests(onQuestsChanged, onQuestFilterChanged) {
  onChange = onQuestsChanged;
  onFilterChange = onQuestFilterChanged || onQuestsChanged;

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
      { id: "questTier", key: "tier", fallback: DEFAULT_TIER },
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

  // The filter state belongs to the document being wired up, not to whatever
  // this module last held (tests boot several documents through it).
  activeTags = [];
  searchTerm = searchEl ? searchEl.value.trim().toLowerCase() : "";

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

// Sessions and quests are independent reads, so they go out together; ingest
// waits for both because the scope note reads sessions.
export function loadQuests() {
  return Promise.all([refreshSessions(), window.questLog.listQuests()]).then(function (results) {
    return ingest(results[1]);
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

function isArchived(q) {
  return !!q.archivedAt;
}

// Newest finish first. Used for the Hall of Fame and Ashes, which are ordered
// by when they ended rather than by the drag order the backlog uses. The
// timestamp is parsed once per quest rather than twice per comparison.
function sortByFinishedDesc(quests) {
  return quests
    .map(function (q) { return { ms: msOf(q.finishedAt) || 0, quest: q }; })
    .sort(function (a, b) { return b.ms - a.ms; })
    .map(function (entry) { return entry.quest; });
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

  var classes = "card quest-card" +
    (q.status === "let_go" ? " let-go-card" : "") +
    (isArchived(q) ? " archived-card" : "") +
    (isImportant(q) ? " important-card" : "");

  // An archived card is read-only until it is restored: no pills, so nothing
  // on it can change a status the store would then un-archive it for.
  var statusRow = isArchived(q) ? "" : '<div class="status-row">' + statusBtns + '</div>';

  // Only an open card can be next up; the store ignores the flag on finished ones.
  var star = isArchived(q) || isQuestTerminal(q.status) ? "" : starHtml(q);

  return (
    '<div class="' + classes + '" data-id="' + q.id + '" data-drag-id="' + q.id + '">' +
    '<div class="card-head">' +
    '<h3 class="card-title">' + escapeHtml(q.title) + '</h3>' + star +
    '</div>' +
    '<div class="tags">' + tags + '</div>' +
    finished +
    statusRow +
    '</div>'
  );
}

export function bindQuestActions(container) {
  container.querySelectorAll(".quest-card .status-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      requestStatus(btn.getAttribute("data-id"), btn.getAttribute("data-status"));
    });
  });

  container.querySelectorAll(".quest-card .star-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      setImportant(btn.getAttribute("data-id"), btn.getAttribute("data-important") !== "1");
    });
  });

  // "Archive all" on a finished section sweeps what that section is showing.
  container.querySelectorAll(".quiet-action[data-archive-status]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      onArchiveSection(btn.getAttribute("data-archive-status"));
    });
  });

  bindCardDetail(container, ".quest-card", function (id) {
    var quest = latestDocs.filter(function (q) { return q.id === id; })[0];
    if (!quest) return null;
    var archived = isArchived(quest);
    return {
      title: quest.title,
      tags: quest.tags || [],
      text: quest.hook,
      rows: detailRows(quest),
      onEdit: function () { questModal.open(quest); },
      onDelete: function () { return onDeleteQuest(quest.id); },
      letGo: quest.status === "let_go" || archived ? null : function () { return onLetGo(quest); },
      // Only a finished card can be put away; the store enforces the same.
      archive: !archived && isQuestTerminal(quest.status)
        ? function () { archiveQuests([quest.id]); return true; }
        : null,
      restore: archived ? function () { restoreQuest(quest.id); return true; } : null,
      prioritize: !archived && !isQuestTerminal(quest.status) && !isImportant(quest)
        ? function () { setImportant(quest.id, true); return true; }
        : null,
      deprioritize: isImportant(quest)
        ? function () { setImportant(quest.id, false); return true; }
        : null
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

// Archiving is reversible, so a single card needs no confirmation; the sweep
// asks, since it moves everything the section is showing at once.
function archiveQuests(ids) {
  var now = new Date().toISOString();
  return Promise.all(ids.map(function (id) {
    return window.questLog.updateQuest(id, { archivedAt: now }).catch(function () {});
  })).then(refetchQuests);
}

function restoreQuest(id) {
  window.questLog.updateQuest(id, { archivedAt: null }).then(refetchQuests).catch(function () {});
}

function setImportant(id, flag) {
  window.questLog.updateQuest(id, { important: !!flag }).then(refetchQuests).catch(function () {});
}

function onArchiveSection(status) {
  var ids = latestDocs
    .filter(function (q) { return q.status === status && !isArchived(q) && matchesFilter(q); })
    .map(function (q) { return q.id; });
  if (!ids.length) return;

  var what = ids.length + " " + (status === "let_go" ? "let-go" : "shipped") +
    (ids.length === 1 ? " quest" : " quests");
  if (!window.confirm("Archive " + what + "?\n\nThey leave the board but keep their XP. Find them under Archive.")) return;
  archiveQuests(ids);
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

// `archiveStatus`, when given, puts an "Archive all" action in the head that
// sweeps that status — only the finished sections offer it.
function tierSection(title, quests, extraClass, archiveStatus) {
  var action = archiveStatus
    ? '<button type="button" class="quiet-action" data-archive-status="' + archiveStatus + '">Archive all</button>'
    : "";
  return '<section class="tier' + (extraClass ? " " + extraClass : "") + '">' +
    '<div class="tier-head"><h2 class="tier-title">' + escapeHtml(title) + '</h2>' + action + '</div>' +
    '<div class="grid">' + quests.map(cardHtml).join("") + '</div>' +
    '</section>';
}

// Folded by default. A <details>, so its open state is the DOM's — the board
// is rebuilt as a string on every change, so the caller carries it across.
function archiveSection(quests, open) {
  return '<details class="tier archive-tier"' + (open ? " open" : "") + '>' +
    '<summary class="tier-title">Archive · ' + quests.length + '</summary>' +
    '<div class="grid archive-grid">' + quests.map(cardHtml).join("") + '</div>' +
    '</details>';
}

function renderBoard(quests) {
  if (!quests.length) {
    boardEl.innerHTML = '<div class="empty-state">Quest log is empty.</div>';
    return;
  }

  var active = quests.filter(function (q) { return !isArchived(q); });
  var archived = sortByFinishedDesc(quests.filter(isArchived).filter(matchesFilter));
  var visible = active.filter(matchesFilter);

  // Sections are mutually exclusive, so every quest appears exactly once: in
  // progress (rendered by app.js above this board), Next up, its scope
  // section, the Hall of Fame, Ashes, or the Archive. Next up pulls the
  // starred backlog cards out of their scope tiers: it is the queue for the
  // next free slot, and a queue needs its own order, so it gets its own grid.
  var html = "";
  var nextUp = visible
    .filter(function (q) { return q.status === "backlog" && isImportant(q); })
    .sort(byOrder);
  if (nextUp.length) html += tierSection("Next up", nextUp, "next-up-tier");

  TIERS.forEach(function (tier) {
    var inTier = visible
      .filter(function (q) { return q.status === "backlog" && q.tier === tier.key && !isImportant(q); })
      .sort(byOrder);
    if (!inTier.length) return;
    html += tierSection(tier.title, inTier);
  });

  var shipped = sortByFinishedDesc(visible.filter(function (q) { return q.status === "shipped"; }));
  if (shipped.length) html += tierSection("Hall of Fame", shipped, "", "shipped");

  var letGo = sortByFinishedDesc(visible.filter(function (q) { return q.status === "let_go"; }));
  if (letGo.length) html += tierSection("Ashes", letGo, "ashes-tier", "let_go");

  if (!html) {
    if (activeTags.length || searchTerm) {
      html = '<div class="empty-state">Nothing matches that.</div>';
    } else if (!active.length) {
      html = '<div class="empty-state">Nothing on the board. Everything finished is in the archive.</div>';
    } else {
      html = '<div class="empty-state">Everything you have is in progress. Nothing left on the board.</div>';
    }
  }

  if (archived.length) {
    var previous = boardEl.querySelector(".archive-tier");
    html += archiveSection(archived, !!previous && previous.open);
  }
  boardEl.innerHTML = html;

  bindQuestActions(boardEl);

  // Per-grid, not per-board: dragging must not move a card between sections,
  // and each section persists its own order. The archive is ordered by when
  // things finished, not by hand.
  boardEl.querySelectorAll(".grid:not(.archive-grid)").forEach(function (grid) {
    enableDragSort(grid, persistQuestOrder);
  });
}

function persistQuestOrder(ids) {
  window.questLog.reorderQuests(ids).then(refetchQuests).catch(function () {});
}

// Filter-only redraw: the data hasn't changed, so only what the filter
// applies to is repainted.
function rerender() {
  renderBoard(latestDocs);
  // The In Progress block is owned by app.js but filtered from here.
  if (onFilterChange) onFilterChange();
}

function ingest(docs) {
  docs = (docs || []).filter(function (d) { return d.title; });

  // Chips come from the cards on the board; a tag that survives only in the
  // archive would be a chip that filters everything out.
  var tagSet = {};
  docs.forEach(function (d) {
    if (isArchived(d)) return;
    (d.tags || []).forEach(function (t) { tagSet[t] = true; });
  });
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

