// The two confirmation dialogs that sit in front of a status change: shipping
// a quest, and starting one past WIP_LIMIT.
//
// Both are continuation-style — the caller hands over what to do next and the
// gate runs it, so the status change happens inside the confirm path rather
// than being undone afterwards. Both degrade to running the callback straight
// away when their markup is absent, so a document without the modals still
// works. Neither can cancel the action outright: dismissing simply drops it.

import { escapeHtml } from "../core/html.js";

var shipOverlay, shipTitleEl, shipDodEl, shipCancelBtn, shipConfirmBtn;
var wipOverlay, wipBodyEl, wipListEl, wipBenchBtn, wipProceedBtn, wipCancelBtn;
var pendingShip = null;
var pendingWip = null;

export function initGates() {
  shipOverlay = document.getElementById("shipModalOverlay");
  wipOverlay = document.getElementById("wipModalOverlay");
  if (!shipOverlay || !wipOverlay) return;

  shipTitleEl = document.getElementById("shipQuestTitle");
  shipDodEl = document.getElementById("shipDod");
  shipCancelBtn = document.getElementById("shipCancelBtn");
  shipConfirmBtn = document.getElementById("shipConfirmBtn");

  wipBodyEl = document.getElementById("wipBody");
  wipListEl = document.getElementById("wipList");
  wipBenchBtn = document.getElementById("wipBenchBtn");
  wipProceedBtn = document.getElementById("wipProceedBtn");
  wipCancelBtn = document.getElementById("wipCancelBtn");

  shipCancelBtn.addEventListener("click", closeShip);
  shipOverlay.addEventListener("click", function (e) {
    if (e.target === shipOverlay) closeShip();
  });
  shipConfirmBtn.addEventListener("click", function () {
    var go = pendingShip;
    closeShip();
    if (go) go();
  });

  wipCancelBtn.addEventListener("click", closeWip);
  wipOverlay.addEventListener("click", function (e) {
    if (e.target === wipOverlay) closeWip();
  });
  wipBenchBtn.addEventListener("click", function () {
    var handlers = pendingWip;
    closeWip();
    if (handlers) handlers.onBenchAll();
  });
  wipProceedBtn.addEventListener("click", function () {
    var handlers = pendingWip;
    closeWip();
    if (handlers) handlers.onProceed();
  });

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (!shipOverlay.hidden) closeShip();
    if (!wipOverlay.hidden) closeWip();
  });
}

export function confirmShip(quest, onConfirm) {
  // Nothing to confirm against without a DoD, so don't show an empty dialog.
  if (!shipOverlay || !quest.dod) {
    onConfirm();
    return;
  }

  pendingShip = onConfirm;
  shipTitleEl.textContent = quest.title;
  shipDodEl.textContent = quest.dod;
  shipOverlay.hidden = false;
  shipConfirmBtn.focus();
}

// handlers: { onProceed, onBenchAll } — start anyway, or move everything
// already in flight back to the backlog first.
export function confirmWip(quest, inFlight, handlers) {
  if (!wipOverlay) {
    handlers.onProceed();
    return;
  }

  pendingWip = handlers;
  wipBodyEl.textContent = "You already have " + inFlight.length +
    (inFlight.length === 1 ? " quest" : " quests") + " in flight. Which one are you actually working on?";
  wipListEl.innerHTML = inFlight.map(function (q) {
    return '<li>' + escapeHtml(q.title) + '</li>';
  }).join("");
  wipProceedBtn.textContent = "Start anyway";
  wipOverlay.hidden = false;
}

function closeShip() {
  if (!shipOverlay) return;
  shipOverlay.hidden = true;
  pendingShip = null;
}

function closeWip() {
  if (!wipOverlay) return;
  wipOverlay.hidden = true;
  pendingWip = null;
}
