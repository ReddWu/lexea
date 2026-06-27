// SM-2 spaced repetition (the practical Ebbinghaus forgetting-curve method).
// Mirrors extension/review.js so the website and the extension schedule cards
// identically.

export const DAY = 86400000;

// rating: 1 again, 2 hard, 3 good, 4 easy. Returns the SRS fields to patch.
export function schedule(rec, rating, nowMs) {
  const now = nowMs ?? Date.now();
  let ease = rec.ease || 2.5;
  let interval = rec.interval_days || 0;
  let reps = rec.reps || 0;
  let lapses = rec.lapses || 0;
  let state, dueMs;
  const isNew = (rec.state || "new") === "new" || reps === 0;

  if (rating === 1) {
    lapses += 1;
    ease = Math.max(1.3, ease - 0.2);
    interval = 0;
    state = "relearning";
    dueMs = now + 10 * 60 * 1000; // ~10 min, returns this session
  } else {
    if (isNew) {
      interval = rating === 4 ? 4 : 1;
      if (rating === 2) ease = Math.max(1.3, ease - 0.15);
      if (rating === 4) ease = ease + 0.15;
    } else if (rating === 2) {
      ease = Math.max(1.3, ease - 0.15);
      interval = Math.max(1, Math.round(interval * 1.2));
    } else if (rating === 3) {
      interval = Math.max(1, Math.round(interval * ease));
    } else {
      ease = ease + 0.15;
      interval = Math.max(1, Math.round(interval * ease * 1.3));
    }
    reps += 1;
    state = "review";
    dueMs = now + interval * DAY;
  }

  return {
    ease,
    interval_days: interval,
    reps,
    lapses,
    state,
    due: new Date(dueMs).toISOString(),
    last_review: new Date(now).toISOString(),
    updated_at: new Date(now).toISOString(),
  };
}

// weakness score — same formula as functions/weak-words.ts
export function score(w, nowMs) {
  const now = nowMs ?? Date.now();
  let s = 0;
  if (new Date(w.due).getTime() <= now) s += 2;
  if (w.state === "relearning") s += 3;
  s += (w.lapses || 0) * 2;
  if ((w.reps || 0) === 0) s += 1;
  s -= (w.reps || 0) * 0.2;
  s -= Math.max(0, (w.ease || 2.5) - 2.5);
  s -= (w.times_used_in_chat || 0) * 0.3;
  return s;
}

// "mastered" heuristic for the dashboard
export function isMastered(w) {
  return (w.interval_days || 0) >= 21 || w.status === "known";
}
