import { SIDE_QUEST_STATUSES, SIDE_QUEST_STATUS_LABEL } from "./constants.js";
import { escapeHtml } from "./utils.js";

var latestSideQuests = [];
var editingSideQuestId = null;
var onChange = null;

var addSideQuestBtn, sideQuestModalOverlay, sideQuestForm, sideQuestModalTitle, sideQuestCancelBtn;

export function initSideQuests(onSideQuestsChanged) {
  onChange = onSideQuestsChanged;

  addSideQuestBtn = document.getElementById("addSideQuestBtn");
  sideQuestModalOverlay = document.getElementById("sideQuestModalOverlay");
  sideQuestForm = document.getElementById("sideQuestForm");
  sideQuestModalTitle = document.getElementById("sideQuestModalTitle");
  sideQuestCancelBtn = document.getElementById("sideQuestCancelBtn");

  addSideQuestBtn.addEventListener("click", function () { openSideQuestModal(null); });
  sideQuestCancelBtn.addEventListener("click", closeSideQuestModal);
  sideQuestModalOverlay.addEventListener("click", function (e) {
    if (e.target === sideQuestModalOverlay) closeSideQuestModal();
  });
  sideQuestForm.addEventListener("submit", onSideQuestFormSubmit);

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !sideQuestModalOverlay.hidden) closeSideQuestModal();
  });
}

export function openCreateSideQuest() {
  openSideQuestModal(null);
}

export function persistSideQuestOrder(ids) {
  window.questLog.reorderSideQuests(ids).then(refetchSideQuests).catch(function () {});
}

export function loadSideQuests() {
  return window.questLog.listSideQuests().then(ingest);
}

export function refetchSideQuests() {
  return window.questLog.listSideQuests().then(ingest);
}

export function getSideQuestsByStatus(status) {
  return latestSideQuests
    .filter(function (s) { return s.status === status; })
    .sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
}

export function sideQuestCardHtml(sideQuest) {
  var statusBtns = SIDE_QUEST_STATUSES.map(function (s) {
    return '<button class="status-btn side-quest-status-btn ' + (sideQuest.status === s ? "on " + s : "") +
      '" data-id="' + sideQuest.id + '" data-status="' + s + '">' + SIDE_QUEST_STATUS_LABEL[s] + '</button>';
  }).join("");

  var note = sideQuest.note
    ? '<p class="card-hook">' + escapeHtml(sideQuest.note) + '</p>'
    : "";

  return (
    '<div class="card side-quest-card" data-drag-id="' + sideQuest.id + '">' +
    '<div class="card-head">' +
    '<h3 class="card-title">' + escapeHtml(sideQuest.title) + '</h3>' +
    '<div class="card-actions">' +
    '<button class="icon-btn side-quest-edit-btn" data-id="' + sideQuest.id + '">Edit</button>' +
    '<button class="icon-btn danger side-quest-delete-btn" data-id="' + sideQuest.id + '">Delete</button>' +
    '</div>' +
    '</div>' +
    note +
    '<div class="status-row">' + statusBtns + '</div>' +
    '</div>'
  );
}

export function bindSideQuestActions(container) {
  container.querySelectorAll(".side-quest-status-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      setSideQuestStatus(btn.getAttribute("data-id"), btn.getAttribute("data-status"));
    });
  });

  container.querySelectorAll(".side-quest-edit-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var id = btn.getAttribute("data-id");
      var sideQuest = latestSideQuests.filter(function (s) { return s.id === id; })[0];
      if (sideQuest) openSideQuestModal(sideQuest);
    });
  });

  container.querySelectorAll(".side-quest-delete-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      onDeleteSideQuest(btn.getAttribute("data-id"));
    });
  });
}

function setSideQuestStatus(id, status) {
  window.questLog.updateSideQuest(id, { status: status }).then(refetchSideQuests).catch(function () {});
}

function onDeleteSideQuest(id) {
  if (!window.confirm("Delete this side quest? This cannot be undone.")) return;
  window.questLog.deleteSideQuest(id).then(refetchSideQuests).catch(function () {});
}

function ingest(sideQuests) {
  latestSideQuests = (sideQuests || []).filter(function (s) { return s.title; });
  if (onChange) onChange();
}

function openSideQuestModal(sideQuest) {
  editingSideQuestId = sideQuest ? sideQuest.id : null;
  sideQuestModalTitle.textContent = sideQuest ? "Edit Side Quest" : "Create Side Quest";
  document.getElementById("sideQuestTitle").value = sideQuest ? sideQuest.title : "";
  document.getElementById("sideQuestNote").value = sideQuest && sideQuest.note ? sideQuest.note : "";
  sideQuestModalOverlay.hidden = false;
}

function closeSideQuestModal() {
  sideQuestModalOverlay.hidden = true;
  sideQuestForm.reset();
  editingSideQuestId = null;
}

function onSideQuestFormSubmit(e) {
  e.preventDefault();
  var data = {
    title: document.getElementById("sideQuestTitle").value.trim(),
    note: document.getElementById("sideQuestNote").value.trim(),
  };

  var promise = editingSideQuestId
    ? window.questLog.updateSideQuest(editingSideQuestId, data)
    : window.questLog.createSideQuest(data);

  promise.then(function () {
    closeSideQuestModal();
    return refetchSideQuests();
  }).catch(function () {});
}
