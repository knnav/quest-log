import { TASK_STATUSES, TASK_STATUS_LABEL } from "./constants.js";
import { escapeHtml } from "./utils.js";
import { bindCardDetail } from "./detail.js";

var latestTasks = [];
var editingTaskId = null;
var onChange = null;

var addTaskBtn, taskModalOverlay, taskForm, taskModalTitle, taskCancelBtn;

export function initTasks(onTasksChanged) {
  onChange = onTasksChanged;

  addTaskBtn = document.getElementById("addTaskBtn");
  taskModalOverlay = document.getElementById("taskModalOverlay");
  taskForm = document.getElementById("taskForm");
  taskModalTitle = document.getElementById("taskModalTitle");
  taskCancelBtn = document.getElementById("taskCancelBtn");

  addTaskBtn.addEventListener("click", function () { openTaskModal(null); });
  taskCancelBtn.addEventListener("click", closeTaskModal);
  taskModalOverlay.addEventListener("click", function (e) {
    if (e.target === taskModalOverlay) closeTaskModal();
  });
  taskForm.addEventListener("submit", onTaskFormSubmit);

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !taskModalOverlay.hidden) closeTaskModal();
  });
}

export function openCreateTask() {
  openTaskModal(null);
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
  var counts = { backlog: 0, in_progress: 0, done: 0 };
  latestTasks.forEach(function (s) { counts[s.status] = (counts[s.status] || 0) + 1; });
  return counts;
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
      onEdit: function () { openTaskModal(task); },
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

function openTaskModal(task) {
  editingTaskId = task ? task.id : null;
  taskModalTitle.textContent = task ? "Edit Task" : "Create Task";
  document.getElementById("taskTitle").value = task ? task.title : "";
  document.getElementById("taskNote").value = task && task.note ? task.note : "";
  taskModalOverlay.hidden = false;
}

function closeTaskModal() {
  taskModalOverlay.hidden = true;
  taskForm.reset();
  editingTaskId = null;
}

function onTaskFormSubmit(e) {
  e.preventDefault();
  var data = {
    title: document.getElementById("taskTitle").value.trim(),
    note: document.getElementById("taskNote").value.trim(),
  };

  var promise = editingTaskId
    ? window.questLog.updateTask(editingTaskId, data)
    : window.questLog.createTask(data);

  promise.then(function () {
    closeTaskModal();
    return refetchTasks();
  }).catch(function () {});
}
