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
// Deliberately built from the *unfiltered* lists: the panel is a reminder of
// what you are actually doing, and must not empty out because a search term
// is sitting in the Quests tab.

export var PANEL_ROWS = 6;

function rowsOf(list, kind) {
  return (list || [])
    .filter(function (item) { return item && item.status === "in_progress" && item.title; })
    .sort(function (a, b) { return (a.order || 0) - (b.order || 0); })
    .map(function (item) { return { kind: kind, title: item.title }; });
}

// Returns { rows, hidden }: the rows that fit and how many did not. The panel
// window has a capped height, so the overflow is counted rather than dropped
// silently — "+2 more" is still a true picture of the load.
export function wipItems(quests, tasks, limit) {
  var rows = rowsOf(quests, "quest").concat(rowsOf(tasks, "task"));
  var max = limit > 0 ? limit : PANEL_ROWS;
  return { rows: rows.slice(0, max), hidden: Math.max(0, rows.length - max) };
}
