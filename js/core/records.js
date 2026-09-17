// Aggregates over the quest history, kept apart from core/fire.js: the fire
// reads recent momentum, these read the whole record. Pure functions, no DOM.

import { MS_PER_DAY, msOf, spanMs } from "./dates.js";

// Mean start-to-finish time for shipped quests of one scope, plus the tracked
// session time against them.
//
// Two known biases, both deliberate and both visible in the returned shape:
// only `shipped` quests count (so quests that overran and were let go, or are
// still open, are excluded), and `workedMs` sees only sessions carrying a
// matching questId — sessions run with no quest attached are invisible here.
// Callers should show `shipped` alongside the average so a tiny sample reads
// as one.
export function scopeRecord(quests, tier, sessions) {
  var matching = (quests || []).filter(function (q) {
    return q.tier === tier && q.status === "shipped" &&
      spanMs(q.startedAt, q.finishedAt) !== null;
  });

  if (!matching.length) return null;

  var spans = matching.map(function (q) { return spanMs(q.startedAt, q.finishedAt); });
  var mean = spans.reduce(function (a, b) { return a + b; }, 0) / spans.length;

  var ids = {};
  matching.forEach(function (q) { ids[q.id] = true; });
  var workedMs = (sessions || []).reduce(function (total, s) {
    if (!ids[s.questId]) return total;
    return total + (spanMs(s.startedAt, s.endedAt) || 0);
  }, 0);

  return {
    shipped: spans.length,
    days: Math.max(1, Math.round(mean / MS_PER_DAY)),
    workedMs: workedMs
  };
}

// The backlog quest with the oldest createdAt. Only "backlog" counts: anything
// started, shipped or let go has been touched. Null when nothing qualifies.
export function oldestWaiting(quests, now) {
  var nowMs = now instanceof Date ? now.getTime() : Date.now();
  var oldest = null;

  (quests || []).forEach(function (q) {
    if (q.status !== "backlog" || !q.createdAt) return;
    var ms = msOf(q.createdAt);
    if (ms === null) return;
    if (!oldest || ms < oldest.ms) {
      oldest = { ms: ms, title: q.title, days: Math.floor((nowMs - ms) / MS_PER_DAY) };
    }
  });

  return oldest;
}
