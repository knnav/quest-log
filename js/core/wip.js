// What "in flight" means, in one place.
//
// The floating In Flight panel is a different window from the board, so this
// is pure and DOM-free: both sides derive the same list from the same rule
// rather than each holding its own idea of what is in progress.
//
// Quests come before tasks — a quest is the larger commitment and the thing
// most worth being reminded of — and within each kind the board's own drag
// order is kept, so the panel reads top-to-bottom like the In Progress block.
//
// Below the in-flight rows sits "next up": the backlog cards marked important,
// in the same quests-then-tasks order. The panel's height is capped, and what
// you are doing outranks what you might do next, so in-flight rows take the
// space first and next-up gets what is left.
//
// Deliberately built from the *unfiltered* lists: the panel is a reminder of
// what you are actually doing, and must not empty out because a search term
// is sitting in the Quests tab.

import { isImportant } from "./domain.js";

export var PANEL_ROWS = 6;

function inFlight(item) {
  return item.status === "in_progress";
}

function nextUp(item) {
  return item.status === "backlog" && isImportant(item);
}

function rowsOf(list, kind, pick) {
  return (list || [])
    .filter(function (item) { return item && item.title && pick(item); })
    .sort(function (a, b) { return (a.order || 0) - (b.order || 0); })
    .map(function (item) { return { kind: kind, title: item.title }; });
}

// Returns { rows, nextUp, hidden }: the in-flight rows and next-up rows that
// fit, and how many across both did not. The overflow is counted rather than
// dropped silently — "+2 more" is still a true picture of the load.
export function wipItems(quests, tasks, limit) {
  var rows = rowsOf(quests, "quest", inFlight).concat(rowsOf(tasks, "task", inFlight));
  var queued = rowsOf(quests, "quest", nextUp).concat(rowsOf(tasks, "task", nextUp));
  var max = limit > 0 ? limit : PANEL_ROWS;
  var total = rows.length + queued.length;
  return {
    rows: rows.slice(0, max),
    nextUp: queued.slice(0, Math.max(0, max - rows.length)),
    hidden: Math.max(0, total - max)
  };
}
