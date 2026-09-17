// The vocabulary the board is built from: the tiers a quest can have, the
// statuses both item types move through, what each outcome is worth, and the
// two thresholds the home screen checks against.
//
// `key` is what gets persisted on every quest, `title` is display only.
// Changing a title is free; changing a key needs a migration of the store
// (see TIER_MIGRATION in store.js — the old keys were weekend/medium/ongoing).
//
// Tiers are effort, not duration: a "hard" quest is one that costs a lot,
// whether that is spread over a weekend or a season. Effort is what the
// fire and the XP ledger reward, so it is what you commit to up front.
export const TIERS = [
  { key: "easy", title: "Easy" },
  { key: "medium", title: "Medium" },
  { key: "hard", title: "Hard" }
];

export const DEFAULT_TIER = "easy";

export const TIER_LABEL = TIERS.reduce(function (acc, t) {
  acc[t.key] = t.title;
  return acc;
}, {});

// What one outcome is worth. One set of numbers on purpose: the bonfire
// (core/fire.js) burns it as fuel and the ledger (core/xp.js) banks it as XP,
// and the two must never disagree about what a completion counts for. A task
// is the unit; tiers scale with effort so that shipping something hard is an
// event, not three easy quests' worth. Letting go is a real decision and
// counts a little — store.js grants it once per outcome, so it cannot be farmed.
export const TASK_WORTH = 1;
export const LET_GO_WORTH = 1;

export const TIER_WORTH = { easy: 3, medium: 10, hard: 25 };

// The worth of a shipped quest. Unknown tiers (none after the migration, but a
// hand-edited file could hold one) fall back to the default tier's.
export function questWorth(tier) {
  return TIER_WORTH[tier] !== undefined ? TIER_WORTH[tier] : TIER_WORTH[DEFAULT_TIER];
}

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

// The quest outcomes: the two statuses a quest can finish in. store.js keeps
// its own copy (it is CommonJS); keep them in step.
export function isQuestTerminal(status) {
  return status === "shipped" || status === "let_go";
}

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
