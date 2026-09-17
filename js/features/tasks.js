// The Tasks tab: a flat list of small things, with no scope, no tags and no
// Definition of Done — that separation is the point of having two item types.
//
// Mirrors features/quests.js in shape: holds the list in memory, writes only
// through window.questLog, and refetches rather than patching locally. There
// are no gates here, so status pills write straight through.

import { TASK_STATUSES, TASK_STATUS_LABEL, countByStatus } from "../core/domain.js";
import { escapeHtml } from "../core/html.js";
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

export function getTasksByStatus(status) {
  return latestTasks
    .filter(function (s) { return s.status === status; })
    .sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
}

export function taskCardHtml(task) {
  var statusBtns = TASK_STATUSES.map(function (s) {
    return '<button class="status-btn task-status-btn ' + (task.status === s ? "on " + s : "") +
      '" data-id="' + task.id + '" data-status="' + s + '">' + TASK_STATUS_LABEL[s] + '</button>';
  }).join("");

  return (
    '<div class="card task-card" data-id="' + task.id + '" data-drag-id="' + task.id + '">' +
    '<div class="card-head">' +
    '<h3 class="card-title">' + escapeHtml(task.title) + '</h3>' +
    '</div>' +
    '<div class="status-row">' + statusBtns + '</div>' +
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
    return {
      title: task.title,
      text: task.note,
      onEdit: function () { taskModal.open(task); },
      onDelete: function () { return onDeleteTask(task.id); }
    };
  });
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

