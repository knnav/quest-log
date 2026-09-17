// The XP ledger: what the whole history adds up to, and where that puts you.
// Pure functions, no DOM, nothing stored.
//
// The bonfire (fire.js) is the short-term signal — it reads the last three
// days and forgets. This is the long-term one: it reads `finishedAt` /
// `finishedAs`, which store.js never clears, so XP only ever goes up. Nothing
// is banked at write time: the total is recomputed from the record on every
// render, the same way the fire is, so there is no counter to drift.

import { TASK_WORTH, LET_GO_WORTH, questWorth, isQuestTerminal } from "./domain.js";

// Cumulative XP needed to *be* level n. Level 1 is the floor, MAX_LEVEL the
// cap. RuneScape's shape: each level costs a fixed ratio more than the last,
// so the cost doubles every DOUBLE_EVERY levels — the early levels come in
// days, the middle in weeks, and the last ones are the long grind they are
// meant to be. With a base of 10: L2 at 10, L8 at ~100, L15 at ~300, L22 at
// ~700, L36 at ~3000, L50 at ~12000. Three constants are the whole dial.
export const XP_BASE = 10;
export const DOUBLE_EVERY = 7;
export const MAX_LEVEL = 99;

// XP to go from level n to n + 1.
export function xpStep(level) {
  return Math.round(XP_BASE * Math.pow(2, (level - 1) / DOUBLE_EVERY));
}

// THRESHOLDS[n] is the XP to be level n; summed once, levelFor walks it on
// every render. Index 0 is padding so the table reads by level.
var THRESHOLDS = [0, 0];
for (var n = 1; n < MAX_LEVEL; n++) THRESHOLDS.push(THRESHOLDS[n] + xpStep(n));

export function xpForLevel(level) {
  if (level <= 1) return 0;
  return THRESHOLDS[Math.min(level, MAX_LEVEL)];
}

// XP one quest has earned, by the outcome it last finished as. A quest that
// shipped and was later reopened still earned its ship — history, not status.
// Quests that predate finishedAs fall back to their status, since a shipped
// quest with no record of finishing is one that shipped before the stamp
// existed rather than one that never did.
export function questXp(quest) {
  if (!quest) return 0;
  var outcome = quest.finishedAs || (isQuestTerminal(quest.status) ? quest.status : null);
  if (outcome === "shipped") return questWorth(quest.tier);
  if (outcome === "let_go") return LET_GO_WORTH;
  return 0;
}

// Tasks fuel the fire every time they are done (FUEL_EVERY_TIME in store.js)
// but bank XP once: finishedAt is set on the first finish and kept, and a
// task bounced back and forth would otherwise farm the ledger.
export function taskXp(task) {
  if (!task) return 0;
  return task.finishedAt || task.status === "done" ? TASK_WORTH : 0;
}

export function totalXp(quests, tasks) {
  var fromQuests = (quests || []).reduce(function (sum, q) { return sum + questXp(q); }, 0);
  var fromTasks = (tasks || []).reduce(function (sum, t) { return sum + taskXp(t); }, 0);
  return fromQuests + fromTasks;
}

// Where a total lands: the level, how far into it, and how far to the next.
// `progress` is the fraction of the way through the current level, for a bar.
// At the cap there is no next: span and toNext are 0 and the bar is full.
export function levelFor(xp) {
  var total = Math.max(0, Math.floor(xp || 0));
  var level = 1;
  while (level < MAX_LEVEL && xpForLevel(level + 1) <= total) level += 1;

  var floor = xpForLevel(level);
  var into = total - floor;
  var span = level === MAX_LEVEL ? 0 : xpForLevel(level + 1) - floor;

  return {
    level: level,
    xp: total,
    into: into,
    span: span,
    toNext: span ? span - into : 0,
    progress: span ? into / span : 1
  };
}

// How much bigger the fire is at a level, as a multiplier on its unit size.
// The fire's stage is the last three days; its size is the whole record.
// Level 1 is a small fire and the cap is nearly twice it: L4 +15%, L10 +37%,
// L20 +59%, L36 +73%. Saturating at 1 + GROWTH_MAX so the board and the
// hearth can be laid out for a known largest fire (styles.css sizes the unit
// so that largest fire is the one that fits).
export const GROWTH_MAX = 0.8;
export const GROWTH_HALF_LIFE = 10;

export function growthFor(level) {
  var above = Math.max(0, (level || 1) - 1);
  return 1 + GROWTH_MAX * (1 - Math.pow(2, -above / GROWTH_HALF_LIFE));
}
