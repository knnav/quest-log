// Two moments where the app asks a question instead of just doing the thing.
//
// Shipping asks whether you actually met the Definition of Done — without it
// the DoD is a note you wrote once, not the contract the whole app is built
// around, and every log on the bonfire would be worth the same as a shrug.
//
// Starting a fourth quest asks what you're really working on. It never blocks;
// the failure mode this app exists to fight is starting things, not finishing
// them, and a tool that shames you is worse than one that says nothing.

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
  // A quest with no Definition of Done has nothing to check against, and an
  // empty dialog would just be a speed bump.
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
