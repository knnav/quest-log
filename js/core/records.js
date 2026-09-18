// Aggregates over the quest history, kept apart from core/fire.js: the fire
// reads recent momentum, these read the record — the whole of it for the
// scope averages, the last few days of it for the standup. Pure functions,
// no DOM.

import { MS_PER_DAY, msOf, spanMs, startOfDay, dayBefore } from "./dates.js";
import { isQuestTerminal } from "./domain.js";

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

// ---- the standup ----

var DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function isWeekend(dayStartMs) {
  var day = new Date(dayStartMs).getDay();
  return day === 0 || day === 6;
}

// `now` is injectable for tests, as a Date or a timestamp.
function nowMsOf(now) {
  if (now instanceof Date) return now.getTime();
  return typeof now === "number" ? now : Date.now();
}

// Where the standup's "since" begins: local midnight of the last weekday
// before today. On a Tuesday that is Monday; on a Monday it is Friday, with
// the weekend in between — yesterday's work is the wrong answer when
// yesterday was a Sunday, and Saturday's still counts if there was any.
export function standupSince(now) {
  var since = dayBefore(startOfDay(nowMsOf(now)));
  while (isWeekend(since)) since = dayBefore(since);
  return since;
}

function isFinished(item, kind) {
  return kind === "quest" ? isQuestTerminal(item.status) : item.status === "done";
}

function byOrder(a, b) {
  return (a.order || 0) - (b.order || 0);
}

function inFlightRows(list, kind) {
  return (list || [])
    .filter(function (item) { return item && item.title && item.status === "in_progress"; })
    .sort(byOrder)
    .map(function (item) {
      return { kind: kind, id: item.id, title: item.title, startedAt: item.startedAt || null };
    });
}

// Finished means finishedAt in the window *and* still finished. finishedAt
// is history and survives a reopen, so a quest shipped this morning and
// picked back up at noon is in flight again, and would otherwise be listed
// under both. `finishedAs` names the outcome; the status is the fallback
// for records from before it existed.
function finishedRows(list, kind, sinceMs) {
  return (list || [])
    .filter(function (item) {
      if (!item || !item.title || !isFinished(item, kind)) return false;
      var at = msOf(item.finishedAt);
      return at !== null && at >= sinceMs;
    })
    .map(function (item) {
      return {
        kind: kind, id: item.id, title: item.title,
        outcome: item.finishedAs || item.status,
        at: msOf(item.finishedAt)
      };
    });
}

// What a standup reads out: what is in flight, then what got finished, one
// section per day from today back to the last weekday (see standupSince).
//
//   { inFlight: [{ kind, id, title, startedAt (ISO, as stored) }],
//     days: [{ label, start, items: [{ kind, id, title, outcome, at }],
//              sessions, workedMs }] }
//
// Days run newest first, and so do the items within one. A day with nothing
// finished and no session is left out rather than shown empty — except
// today, which is always there so the tab has somewhere to say "nothing
// yet". Quests come before tasks in the in-flight list, as on the panel; the
// finished lists are in time order and mix the two. Sessions are counted by
// the day they ended in, like the Focus tab's "Today" line.
export function standup(quests, tasks, sessions, now) {
  var nowMs = nowMsOf(now);
  var today = startOfDay(nowMs);
  var since = standupSince(nowMs);

  var finished = finishedRows(quests, "quest", since).concat(finishedRows(tasks, "task", since));
  var ended = (sessions || []).map(function (s) {
    return { at: msOf(s.endedAt), ms: spanMs(s.startedAt, s.endedAt) || 0 };
  }).filter(function (s) { return s.at !== null && s.at >= since; });

  var days = [];
  // Today's upper bound is open: a stamp from a skewed clock a few minutes
  // ahead still belongs to today rather than to no day at all.
  var end = Infinity;
  for (var start = today; start >= since; start = dayBefore(start)) {
    var lo = start, hi = end;
    var items = finished
      .filter(function (row) { return row.at >= lo && row.at < hi; })
      .sort(function (a, b) { return b.at - a.at; });
    var inDay = ended.filter(function (s) { return s.at >= lo && s.at < hi; });

    if (items.length || inDay.length || start === today) {
      days.push({
        label: start === today ? "Today" : start === dayBefore(today) ? "Yesterday" : DAY_NAMES[new Date(start).getDay()],
        start: start,
        items: items,
        sessions: inDay.length,
        workedMs: inDay.reduce(function (total, s) { return total + s.ms; }, 0)
      });
    }
    end = start;
  }

  return {
    inFlight: inFlightRows(quests, "quest").concat(inFlightRows(tasks, "task")),
    days: days
  };
}
