// The timebox is the whole point, so it is the whole name — "Tier 2" carried
// no information the word "Fortnight" doesn't. Keys stay put: they're on disk.
export const TIERS = [
  { key: "weekend", title: "Weekend" },
  { key: "medium", title: "Fortnight" },
  { key: "ongoing", title: "Ongoing" }
];

export const TIER_LABEL = TIERS.reduce(function (acc, t) {
  acc[t.key] = t.title;
  return acc;
}, {});

// The three you cycle through. "let_go" is deliberately not here: deciding to
// abandon something is a considered act, so it lives in the detail view rather
// than one click away on every card.
export const STATUSES = ["backlog", "in_progress", "shipped"];

export const STATUS_LABEL = {
  backlog: "Backlog",
  in_progress: "In Progress",
  shipped: "Shipped",
  let_go: "Let go"
};

export const TASK_STATUSES = ["backlog", "in_progress", "done"];

export const TASK_STATUS_LABEL = { backlog: "Backlog", in_progress: "In Progress", done: "Done" };

// Past this many quests in flight, starting another one asks you to look at
// what you already have first. A nudge, never a block.
export const WIP_LIMIT = 3;

// How long a quest can sit in the backlog before the home screen mentions it.
export const STALE_DAYS = 30;
