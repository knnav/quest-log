// The bonfire's fuel model.
//
// Finished work burns for a while and then fades, so the fire reflects what
// you've done lately rather than what you've done ever. Nothing here resets at
// midnight: a quiet day dims the fire, it doesn't kill it, and the flame never
// drops below embers. You relight a bonfire, you don't fail it.

export const DECAY_DAYS = 3;

// A two-week build and "water the plants" should not be worth the same log.
export const QUEST_WEIGHT = 3;
export const TASK_WEIGHT = 1;

// Deciding you are not going to do something is a real decision that closes a
// real loop, so it burns — just not as hot as finishing. You get kindling for
// the honesty, and you can only let go of something you already had, so this
// can't be farmed by piling up quests.
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

var MS_PER_DAY = 86400000;

// entries: [{ completedAt, weight }]. Anything undated (finished before the
// fire existed) contributes nothing rather than being treated as fresh.
export function fuelFor(entries, now) {
  var nowMs = now instanceof Date ? now.getTime() : Date.now();

  return (entries || []).reduce(function (total, entry) {
    if (!entry || !entry.completedAt) return total;

    var doneMs = new Date(entry.completedAt).getTime();
    if (!isFinite(doneMs)) return total;

    // A clock that moved backwards shouldn't hand out extra fuel, so anything
    // stamped in the future counts as "just now" rather than more than full.
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

// Collects the fields the fuel model needs from both item types, applying each
// type's own terminal states — quests ship or are let go, tasks are done.
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

// How long, on average, quests of a given scope actually took — measured from
// the day you started to the day you finished. The anti-self-deception number:
// you said Weekend, the record says otherwise.
export function scopeRecord(quests, tier, sessions) {
  var matching = (quests || []).filter(function (q) {
    return q.tier === tier && q.status === "shipped" && q.startedAt && q.finishedAt;
  });

  var spans = (quests || [])
    .filter(function (q) {
      return q.tier === tier && q.status === "shipped" && q.startedAt && q.finishedAt;
    })
    .map(function (q) {
      return new Date(q.finishedAt).getTime() - new Date(q.startedAt).getTime();
    })
    .filter(function (ms) { return isFinite(ms) && ms >= 0; });

  if (!spans.length) return null;

  var mean = spans.reduce(function (a, b) { return a + b; }, 0) / spans.length;

  // Elapsed days were always the soft number; worked time is the honest one.
  var ids = {};
  matching.forEach(function (q) { ids[q.id] = true; });
  var workedMs = (sessions || []).reduce(function (total, s) {
    if (!ids[s.questId] || !s.startedAt || !s.endedAt) return total;
    var ms = new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime();
    return isFinite(ms) && ms > 0 ? total + ms : total;
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
    var ms = new Date(q.createdAt).getTime();
    if (!isFinite(ms)) return;
    if (!oldest || ms < oldest.ms) {
      oldest = { ms: ms, title: q.title, days: Math.floor((nowMs - ms) / MS_PER_DAY) };
    }
  });

  return oldest;
}

export function lastCompletedAt(entries) {
  return (entries || []).reduce(function (latest, entry) {
    if (!entry || !entry.completedAt) return latest;
    var ms = new Date(entry.completedAt).getTime();
    if (!isFinite(ms)) return latest;
    return latest === null || ms > latest ? ms : latest;
  }, null);
}

// "3h 12m" / "18m" / "4d 2h" — the elapsed number the OS clock can't give you.
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
