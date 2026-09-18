// The shared card-detail modal. One instance serves every card on the board:
// callers don't render it, they hand showDetail a plain description and it
// fills the single #detailModalOverlay in index.html.
//
// Actions are passed in as callbacks. onDelete, letGo, archive, restore,
// prioritize and deprioritize return a boolean — true means the action went
// through and the modal should close — so the caller owns its own
// confirmation and a cancelled action leaves the modal up.

import { escapeHtml } from "../core/html.js";

var overlay, titleEl, tagsEl, textEl, rowsEl, closeBtn, editBtn, deleteBtn, letGoBtn;
var archiveBtn, restoreBtn, prioritizeBtn, deprioritizeBtn;
var pendingEdit = null;
var pendingDelete = null;
var pendingLetGo = null;
var pendingArchive = null;
var pendingRestore = null;
var pendingPrioritize = null;
var pendingDeprioritize = null;

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
  archiveBtn = document.getElementById("detailArchiveBtn");
  restoreBtn = document.getElementById("detailRestoreBtn");
  prioritizeBtn = document.getElementById("detailPrioritizeBtn");
  deprioritizeBtn = document.getElementById("detailDeprioritizeBtn");

  closeBtn.addEventListener("click", closeDetail);
  overlay.addEventListener("click", function (e) {
    if (e.target === overlay) closeDetail();
  });

  editBtn.addEventListener("click", function () {
    var edit = pendingEdit;
    closeDetail();
    if (edit) edit();
  });

  // Closes only on a truthy return; see the contract at the top of the file.
  deleteBtn.addEventListener("click", function () {
    if (pendingDelete && pendingDelete()) closeDetail();
  });

  letGoBtn.addEventListener("click", function () {
    if (pendingLetGo && pendingLetGo()) closeDetail();
  });

  archiveBtn.addEventListener("click", function () {
    if (pendingArchive && pendingArchive()) closeDetail();
  });

  restoreBtn.addEventListener("click", function () {
    if (pendingRestore && pendingRestore()) closeDetail();
  });

  prioritizeBtn.addEventListener("click", function () {
    if (pendingPrioritize && pendingPrioritize()) closeDetail();
  });

  deprioritizeBtn.addEventListener("click", function () {
    if (pendingDeprioritize && pendingDeprioritize()) closeDetail();
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !overlay.hidden) closeDetail();
  });
}

// detail: { title, tags, text, rows: [{ label, value }], onEdit, onDelete,
//           letGo, archive, restore, prioritize, deprioritize }
// Each action is optional; its button is hidden when the callback is absent.
// Rows with an empty value are dropped, so callers can build them unconditionally.
export function showDetail(detail) {
  if (!overlay) return;

  pendingEdit = detail.onEdit || null;
  pendingDelete = detail.onDelete || null;
  pendingLetGo = detail.letGo || null;
  pendingArchive = detail.archive || null;
  pendingRestore = detail.restore || null;
  pendingPrioritize = detail.prioritize || null;
  pendingDeprioritize = detail.deprioritize || null;

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

  // Every card opens, including one carrying nothing but a title — fill the
  // body rather than showing an empty sheet.
  if (!detail.text && !rows.length) {
    textEl.textContent = "Nothing written down yet.";
    textEl.hidden = false;
  }

  editBtn.hidden = !pendingEdit;
  deleteBtn.hidden = !pendingDelete;
  letGoBtn.hidden = !pendingLetGo;
  archiveBtn.hidden = !pendingArchive;
  restoreBtn.hidden = !pendingRestore;
  prioritizeBtn.hidden = !pendingPrioritize;
  deprioritizeBtn.hidden = !pendingDeprioritize;
  overlay.hidden = false;
}

export function closeDetail() {
  if (!overlay) return;
  overlay.hidden = true;
  pendingEdit = null;
  pendingDelete = null;
  pendingLetGo = null;
  pendingArchive = null;
  pendingRestore = null;
  pendingPrioritize = null;
  pendingDeprioritize = null;
}

// Makes every `selector` card in `container` open its detail view. Clicks that
// land on a button are ignored so status pills keep their own handlers.
// buildDetail receives the card's data-id and may return null to do nothing.
export function bindCardDetail(container, selector, buildDetail) {
  container.querySelectorAll(selector).forEach(function (card) {
    card.addEventListener("click", function (e) {
      if (e.target.closest("button")) return;
      var detail = buildDetail(card.getAttribute("data-id"));
      if (detail) showDetail(detail);
    });
  });
}
