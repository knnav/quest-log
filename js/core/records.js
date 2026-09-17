import { MS_PER_DAY, msOf, spanMs } from "./dates.js";

// The honest numbers. Not the bonfire — the fire is a reading of momentum,
// and these are the two questions it can't answer: how long this kind of quest
// really takes you, and what has been sitting untouched the longest.

// How long, on average, quests of a given scope actually took — measured from
// the day you started to the day you finished. The anti-self-deception number:
// you said Weekend, the record says otherwise.
export function scopeRecord(quests, tier, sessions) {
  var matching = (quests || []).filter(function (q) {
    return q.tier === tier && q.status === "shipped" &&
      spanMs(q.startedAt, q.finishedAt) !== null;
  });

  if (!matching.length) return null;

  var spans = matching.map(function (q) { return spanMs(q.startedAt, q.finishedAt); });
  var mean = spans.reduce(function (a, b) { return a + b; }, 0) / spans.length;

  // Elapsed days were always the soft number; worked time is the honest one.
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

// The thing that has been waiting longest without being started.
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
