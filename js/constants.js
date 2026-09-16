// The timebox is the whole point, so it is the whole name — "Tier 2" carried
// no information the word "Fortnight" doesn't. Keys stay put: they're on disk.
export const TIERS = [
  { key: "weekend", title: "Weekend" },
  { key: "medium", title: "Fortnight" },
  { key: "ongoing", title: "Ongoing" }
];

export const STATUSES = ["backlog", "in_progress", "shipped"];

export const STATUS_LABEL = { backlog: "Backlog", in_progress: "In Progress", shipped: "Shipped" };

export const TASK_STATUSES = ["backlog", "in_progress", "done"];

export const TASK_STATUS_LABEL = { backlog: "Backlog", in_progress: "In Progress", done: "Done" };
