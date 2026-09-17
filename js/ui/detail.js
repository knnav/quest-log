import { escapeHtml } from "../core/html.js";

var overlay, titleEl, tagsEl, textEl, rowsEl, closeBtn, editBtn, deleteBtn, letGoBtn;
var pendingEdit = null;
var pendingDelete = null;
var pendingLetGo = null;

export function initDetail() {
  overlay = document.getElementById("detailModalOverlay");
  if (!overlay) return;

  titleEl = document.getElementById("detailTitle");
  tagsEl = document.getElementById("detailTags");
  textEl = document.getElementById("detailText");
  rowsEl = document.getElementById("detailRows");
  closeBtn = document.getElementById("detailCloseBtn");
  editBtn = document.getElementById("detailEditBtn");
  deleteBtn = document.getElementById("detailDeleteBtn");
  letGoBtn = document.getElementById("detailLetGoBtn");

  closeBtn.addEventListener("click", closeDetail);
  overlay.addEventListener("click", function (e) {
    if (e.target === overlay) closeDetail();
  });

  editBtn.addEventListener("click", function () {
    var edit = pendingEdit;
    closeDetail();
    if (edit) edit();
  });

  // Delete confirms for itself, so the modal only closes if it actually went
  // through — a cancelled delete leaves you where you were.
  deleteBtn.addEventListener("click", function () {
    if (pendingDelete && pendingDelete()) closeDetail();
  });

  letGoBtn.addEventListener("click", function () {
    if (pendingLetGo && pendingLetGo()) closeDetail();
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !overlay.hidden) closeDetail();
  });
}

// detail: { title, tags, text, rows: [{ label, value }], onEdit, onDelete, letGo }
export function showDetail(detail) {
  if (!overlay) return;

  pendingEdit = detail.onEdit || null;
  pendingDelete = detail.onDelete || null;
  pendingLetGo = detail.letGo || null;

  titleEl.textContent = detail.title || "";

  var tags = detail.tags || [];
  tagsEl.innerHTML = tags.map(function (t) {
    return '<span class="tag">' + escapeHtml(t) + '</span>';
  }).join("");
  tagsEl.hidden = !tags.length;

  textEl.textContent = detail.text || "";
  textEl.hidden = !detail.text;

  var rows = (detail.rows || []).filter(function (row) { return row.value; });
  rowsEl.innerHTML = rows.map(function (row) {
    return '<div class="dod"><b>' + escapeHtml(row.label) + '</b>' + escapeHtml(row.value) + '</div>';
  }).join("");

  // A card with nothing but a title still opens, so say so rather than showing a blank sheet.
  if (!detail.text && !rows.length) {
    textEl.textContent = "Nothing written down yet.";
    textEl.hidden = false;
  }

  editBtn.hidden = !pendingEdit;
  deleteBtn.hidden = !pendingDelete;
  letGoBtn.hidden = !pendingLetGo;
  overlay.hidden = false;
}

export function closeDetail() {
  if (!overlay) return;
  overlay.hidden = true;
  pendingEdit = null;
  pendingDelete = null;
  pendingLetGo = null;
}

// Cards are clickable except on their own buttons, which have their own handlers.
export function bindCardDetail(container, selector, buildDetail) {
  container.querySelectorAll(selector).forEach(function (card) {
    card.addEventListener("click", function (e) {
      if (e.target.closest("button")) return;
      var detail = buildDetail(card.getAttribute("data-id"));
      if (detail) showDetail(detail);
    });
  });
}
