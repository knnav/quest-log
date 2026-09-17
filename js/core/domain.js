// The vocabulary the board is built from: the scopes a quest can have, the
// statuses both item types move through, and the two thresholds the home
// screen checks against.
//
// `key` is what gets persisted on every quest, `title` is display only.
// Changing a title is free; changing a key needs a migration of the store.
export const TIERS = [
  { key: "weekend", title: "Weekend" },
  { key: "medium", title: "Fortnight" },
  { key: "ongoing", title: "Ongoing" }
];

export const TIER_LABEL = TIERS.reduce(function (acc, t) {
  acc[t.key] = t.title;
  return acc;
}, {});

// The statuses a status pill cycles through, in order. "let_go" is absent on
// purpose — it is reachable only from the detail view — but it still needs a
// label below, and store.js still treats it as terminal.
export const STATUSES = ["backlog", "in_progress", "shipped"];

export const STATUS_LABEL = {
  backlog: "Backlog",
  in_progress: "In Progress",
  shipped: "Shipped",
  let_go: "Let go"
};

export const TASK_STATUSES = ["backlog", "in_progress", "done"];

export const TASK_STATUS_LABEL = { backlog: "Backlog", in_progress: "In Progress", done: "Done" };

// Starting a quest beyond this many in flight routes through the WIP dialog in
// features/gates.js. The dialog can always be dismissed; this gates the prompt,
// not the action.
export const WIP_LIMIT = 3;

// How long a quest can sit in the backlog before the home screen mentions it.
export const STALE_DAYS = 30;

// Tallies a list by its status field. `statuses` seeds the result with zeros,
// so callers get every key they asked for and none they didn't — quests and
// tasks have different status sets and must not inherit each other's rows.
export function countByStatus(list, statuses) {
  var counts = {};
  statuses.forEach(function (s) { counts[s] = 0; });
  (list || []).forEach(function (item) {
    if (!item) return;
    counts[item.status] = (counts[item.status] || 0) + 1;
  });
  return counts;
}
