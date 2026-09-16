import { STATUSES, STATUS_LABEL } from "./constants.js";
import { escapeHtml } from "./utils.js";
import { bindCardDetail } from "./detail.js";

var latestPinned = [];
var editingPinnedId = null;
var onChange = null;

var pinnedModalOverlay, pinnedForm, pinnedCancelBtn;

export function initPinned(onPinnedChanged) {
  onChange = onPinnedChanged;

  pinnedModalOverlay = document.getElementById("pinnedModalOverlay");
  pinnedForm = document.getElementById("pinnedForm");
  pinnedCancelBtn = document.getElementById("pinnedCancelBtn");

  pinnedCancelBtn.addEventListener("click", closePinnedModal);
  pinnedModalOverlay.addEventListener("click", function (e) {
    if (e.target === pinnedModalOverlay) closePinnedModal();
  });
  pinnedForm.addEventListener("submit", onPinnedFormSubmit);

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !pinnedModalOverlay.hidden) closePinnedModal();
  });
}

export function loadPinned() {
  return window.questLog.listPinned().then(ingestPinned);
}

export function refetchPinned() {
  return window.questLog.listPinned().then(ingestPinned);
}

export function getPinnedList() {
  return latestPinned;
}

export function pinnedCardHtml(repo) {
  var state = repo.state || "in_progress";
  var statusBtns = STATUSES.map(function (s) {
    return '<button class="status-btn pinned-status-btn ' + (state === s ? "on " + s : "") + '" data-id="' + repo.id +
      '" data-status="' + s + '">' + STATUS_LABEL[s] + '</button>';
  }).join("");

  return (
    '<div class="card pinned-card" data-id="' + repo.id + '">' +
    '<div class="card-head">' +
    '<h3 class="card-title">' + escapeHtml(repo.title) + '</h3>' +
    '</div>' +
    '<div class="tags"><span class="tag pinned-tag">Pinned repo</span></div>' +
    '<div class="status-row">' + statusBtns + '</div>' +
    '</div>'
  );
}

export function bindPinnedActions(container) {
  container.querySelectorAll(".pinned-status-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      setPinnedState(btn.getAttribute("data-id"), btn.getAttribute("data-status"));
    });
  });

  bindCardDetail(container, ".pinned-card", function (id) {
    var repo = latestPinned.filter(function (p) { return p.id === id; })[0];
    if (!repo) return null;
    return {
      title: repo.title,
      tags: ["Pinned repo"],
      rows: [
        { label: "Status", value: repo.status },
        { label: "Next", value: repo.next },
        { label: "To-do", value: repo.todo }
      ],
      onEdit: function () { openPinnedModal(repo); }
    };
  });
}

function setPinnedState(id, state) {
  window.questLog.updatePinned(id, { state: state }).then(refetchPinned).catch(function () {});
}

function ingestPinned(pinnedList) {
  latestPinned = (pinnedList || []).slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
  if (onChange) onChange();
}

function openPinnedModal(repo) {
  editingPinnedId = repo.id;
  document.getElementById("pinnedStatus").value = repo.status || "";
  document.getElementById("pinnedNext").value = repo.next || "";
  document.getElementById("pinnedTodo").value = repo.todo || "";
  pinnedModalOverlay.hidden = false;
}

function closePinnedModal() {
  pinnedModalOverlay.hidden = true;
  pinnedForm.reset();
  editingPinnedId = null;
}

function onPinnedFormSubmit(e) {
  e.preventDefault();
  if (!editingPinnedId) return;
  var data = {
    status: document.getElementById("pinnedStatus").value.trim(),
    next: document.getElementById("pinnedNext").value.trim(),
    todo: document.getElementById("pinnedTodo").value.trim()
  };

  window.questLog.updatePinned(editingPinnedId, data).then(function () {
    closePinnedModal();
    return refetchPinned();
  }).catch(function () {});
}
