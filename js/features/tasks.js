// The Tasks tab: a flat list of small things, with no scope, no tags and no
// Definition of Done — that separation is the point of having two item types.
//
// Mirrors features/quests.js in shape: holds the list in memory, writes only
// through window.questLog, and refetches rather than patching locally. There
// are no gates here, so status pills write straight through.
//
// As with quests, archived tasks stay in the list for the ledger and the fire
// and only drop out of the by-status views the board is built from.

import { TASK_STATUSES, TASK_STATUS_LABEL, countByStatus } from "../core/domain.js";
import { escapeHtml } from "../core/html.js";
import { msOf } from "../core/dates.js";
import { bindCardDetail } from "../ui/detail.js";
import { createModal } from "../ui/modal.js";

var latestTasks = [];
var onChange = null;
var taskModal = null;

export function initTasks(onTasksChanged) {
  onChange = onTasksChanged;

  taskModal = createModal({
    overlay: "taskModalOverlay",
    form: "taskForm",
    heading: "taskModalTitle",
    cancel: "taskCancelBtn",
    addButton: "addTaskBtn",
    headings: { create: "Create Task", edit: "Edit Task" },
    fields: [
      { id: "taskTitle", key: "title" },
      { id: "taskNote", key: "note" }
    ],
    create: function (data) { return window.questLog.createTask(data); },
    update: function (id, data) { return window.questLog.updateTask(id, data); },
    onSaved: refetchTasks
  });
}

export function openCreateTask() {
  taskModal.open(null);
}

export function persistTaskOrder(ids) {
  window.questLog.reorderTasks(ids).then(refetchTasks).catch(function () {});
}

export function loadTasks() {
  return window.questLog.listTasks().then(ingest);
}

export function refetchTasks() {
  return window.questLog.listTasks().then(ingest);
}

export function getAllTasks() {
  return latestTasks;
}

export function getStatusCounts() {
  return countByStatus(latestTasks, TASK_STATUSES);
}

function isArchived(task) {
  return !!task.archivedAt;
}

// The board's sections: archived tasks are out of all of them.
export function getTasksByStatus(status) {
  return latestTasks
    .filter(function (s) { return s.status === status && !isArchived(s); })
    .sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
}

// Newest finish first, like the quest board's Hall of Fame.
export function getArchivedTasks() {
  return latestTasks
    .filter(isArchived)
    .map(function (s) { return { ms: msOf(s.finishedAt) || 0, task: s }; })
    .sort(function (a, b) { return b.ms - a.ms; })
    .map(function (entry) { return entry.task; });
}

export function taskCardHtml(task) {
  var statusBtns = TASK_STATUSES.map(function (s) {
    return '<button class="status-btn task-status-btn ' + (task.status === s ? "on " + s : "") +
      '" data-id="' + task.id + '" data-status="' + s + '">' + TASK_STATUS_LABEL[s] + '</button>';
  }).join("");

  // Read-only until restored, same as an archived quest.
  var archived = isArchived(task);
  var statusRow = archived ? "" : '<div class="status-row">' + statusBtns + '</div>';

  return (
    '<div class="card task-card' + (archived ? " archived-card" : "") +
    '" data-id="' + task.id + '" data-drag-id="' + task.id + '">' +
    '<div class="card-head">' +
    '<h3 class="card-title">' + escapeHtml(task.title) + '</h3>' +
    '</div>' +
    statusRow +
    '</div>'
  );
}

export function bindTaskActions(container) {
  container.querySelectorAll(".task-status-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      setTaskStatus(btn.getAttribute("data-id"), btn.getAttribute("data-status"));
    });
  });

  bindCardDetail(container, ".task-card", function (id) {
    var task = latestTasks.filter(function (s) { return s.id === id; })[0];
    if (!task) return null;
    var archived = isArchived(task);
    return {
      title: task.title,
      text: task.note,
      onEdit: function () { taskModal.open(task); },
      onDelete: function () { return onDeleteTask(task.id); },
      archive: !archived && task.status === "done"
        ? function () { archiveTasks([task.id]); return true; }
        : null,
      restore: archived ? function () { restoreTask(task.id); return true; } : null
    };
  });
}

// The Hall of Fame's "Archive all". Lives here rather than in app.js so this
// module stays the only writer of tasks; app.js just wires the click.
export function archiveDoneTasks() {
  var ids = getTasksByStatus("done").map(function (s) { return s.id; });
  if (!ids.length) return;

  var what = ids.length + (ids.length === 1 ? " done task" : " done tasks");
  if (!window.confirm("Archive " + what + "?\n\nThey leave the board but keep their XP. Find them under Archive.")) return;
  archiveTasks(ids);
}

function archiveTasks(ids) {
  var now = new Date().toISOString();
  return Promise.all(ids.map(function (id) {
    return window.questLog.updateTask(id, { archivedAt: now }).catch(function () {});
  })).then(refetchTasks);
}

function restoreTask(id) {
  window.questLog.updateTask(id, { archivedAt: null }).then(refetchTasks).catch(function () {});
}

function setTaskStatus(id, status) {
  window.questLog.updateTask(id, { status: status }).then(refetchTasks).catch(function () {});
}

function onDeleteTask(id) {
  if (!window.confirm("Delete this task? This cannot be undone.")) return false;
  window.questLog.deleteTask(id).then(refetchTasks).catch(function () {});
  return true;
}

function ingest(tasks) {
  latestTasks = (tasks || []).filter(function (s) { return s.title; });
  if (onChange) onChange();
}

