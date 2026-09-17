// The bonfire's fuel model: pure functions, no DOM, no clock of its own.
//
// Each finished item contributes its weight, scaled linearly down to zero over
// DECAY_DAYS. Nothing is bucketed by calendar day and nothing resets, so the
// output is a continuous function of (completions, now) — which is what makes
// it testable by passing a fixed `now`.

import { MS_PER_DAY, msOf } from "./dates.js";

export const DECAY_DAYS = 3;

// Relative worth of one completion of each kind.
export const QUEST_WEIGHT = 3;
export const TASK_WEIGHT = 1;

// Letting a quest go is terminal too, so it carries weight — less than
// shipping. store.js grants it once per outcome, so it cannot be farmed.
export const LET_GO_WEIGHT = 1;

// Fuel needed to reach stages 1..4. Stage 0 is embers, and is always reachable.
export const STAGE_THRESHOLDS = [1, 3, 6, 10];

export const STAGE_LABELS = ["Embers", "Kindling", "Burning", "Blazing", "Roaring"];

export const STAGE_NOTES = [
  "Nothing burning yet. Finish something small.",
  "Caught. Keep feeding it.",
  "Burning steady.",
  "Well fed. This is what a good week looks like.",
  "Roaring. Go rest, you've earned the bonfire."
];

// entries: [{ completedAt, weight }], as built by completionEntries.
// Undated entries (finished before completedAt existed) contribute nothing
// rather than being treated as fresh. `now` is injectable for tests.
export function fuelFor(entries, now) {
  var nowMs = now instanceof Date ? now.getTime() : Date.now();

  return (entries || []).reduce(function (total, entry) {
    if (!entry || !entry.completedAt) return total;

    var doneMs = msOf(entry.completedAt);
    if (doneMs === null) return total;

    // Clamped at zero: a stamp in the future would otherwise make `remaining`
    // exceed 1 and pay out more than the entry's full weight.
    var ageDays = Math.max(0, nowMs - doneMs) / MS_PER_DAY;
    var remaining = 1 - ageDays / DECAY_DAYS;
    if (remaining <= 0) return total;

    return total + (entry.weight || 0) * remaining;
  }, 0);
}

export function stageFor(fuel) {
  var stage = 0;
  for (var i = 0; i < STAGE_THRESHOLDS.length; i++) {
    if (fuel >= STAGE_THRESHOLDS[i]) stage = i + 1;
  }
  return stage;
}

// Flattens quests and tasks into the { completedAt, weight } shape fuelFor
// wants, applying each type's own terminal statuses and weights.
export function completionEntries(quests, tasks) {
  var fromQuests = (quests || [])
    .filter(function (q) { return q.completedAt && (q.status === "shipped" || q.status === "let_go"); })
    .map(function (q) {
      return {
        completedAt: q.completedAt,
        weight: q.status === "let_go" ? LET_GO_WEIGHT : QUEST_WEIGHT
      };
    });

  var fromTasks = (tasks || [])
    .filter(function (s) { return s.status === "done" && s.completedAt; })
    .map(function (s) { return { completedAt: s.completedAt, weight: TASK_WEIGHT }; });

  return fromQuests.concat(fromTasks);
}

export function lastCompletedAt(entries) {
  return (entries || []).reduce(function (latest, entry) {
    if (!entry || !entry.completedAt) return latest;
    var ms = msOf(entry.completedAt);
    if (ms === null) return latest;
    return latest === null || ms > latest ? ms : latest;
  }, null);
}

// Milliseconds-since to a coarse label: "18m", "3h 12m", "4d 2h". Takes an
// epoch number (not an ISO string) because its caller already has one from
// lastCompletedAt. Returns null for no input, which the caller renders as em-dash.
export function elapsedLabel(fromMs, now) {
  if (fromMs === null || fromMs === undefined) return null;

  var nowMs = now instanceof Date ? now.getTime() : Date.now();
  var totalMinutes = Math.max(0, Math.floor((nowMs - fromMs) / 60000));

  var days = Math.floor(totalMinutes / 1440);
  var hours = Math.floor((totalMinutes % 1440) / 60);
  var minutes = totalMinutes % 60;

  if (days > 0) return days + "d " + hours + "h";
  if (hours > 0) return hours + "h " + minutes + "m";
  return minutes + "m";
}
