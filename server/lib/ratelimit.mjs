/**
 * A small in-process rate limiter for the public registration form.
 *
 * Two windows, both per client IP:
 *   - burst:     5 registrations / 10 minutes  — stops a scripted flood fast
 *   - sustained: 15 registrations / 24 hours   — a generous cap for a
 *                shared campus/hostel network, but still a real ceiling
 *
 * This is deliberately in-memory (a Map), not Redis or a Caddy plugin —
 * this process is already the single source of truth for the app on this
 * host, restarts are infrequent, and losing counters on a restart just
 * means a brief window of leniency, not a security hole. If this ever
 * needs to survive restarts or run across multiple app instances, swap
 * this module's internals for a shared store — nothing else changes,
 * since callers only see `check(ip)`.
 */

const BURST_WINDOW_MS = 10 * 60 * 1000;
const BURST_MAX = 5;
const SUSTAINED_WINDOW_MS = 24 * 60 * 60 * 1000;
const SUSTAINED_MAX = 15;

/** ip -> array of timestamps (ms) of recent registrations, newest last */
const hits = new Map();

// Periodic sweep so the Map doesn't grow forever on a long-running process.
setInterval(() => {
  const cutoff = Date.now() - SUSTAINED_WINDOW_MS;
  for (const [ip, times] of hits) {
    const kept = times.filter((t) => t > cutoff);
    if (kept.length) hits.set(ip, kept);
    else hits.delete(ip);
  }
}, 10 * 60 * 1000).unref();

/**
 * Call once per contact-form registration attempt (before it's accepted).
 * Returns { ok: true } or { ok: false, retryAfterSeconds, reason }.
 * Does NOT record the hit — call record(ip) separately, only after the
 * registration is actually accepted, so retries on a validation error don't
 * themselves burn through the limit.
 */
export function check(ip) {
  const now = Date.now();
  const times = hits.get(ip) || [];

  const burstCount = times.filter((t) => t > now - BURST_WINDOW_MS).length;
  if (burstCount >= BURST_MAX) {
    return { ok: false, reason: "Too many registrations in a short time. Please wait a few minutes and try again.", retryAfterSeconds: 600 };
  }

  const sustainedCount = times.filter((t) => t > now - SUSTAINED_WINDOW_MS).length;
  if (sustainedCount >= SUSTAINED_MAX) {
    return { ok: false, reason: "Daily registration limit reached for this network. Please email us directly, or try again tomorrow.", retryAfterSeconds: 86400 };
  }

  return { ok: true };
}

export function record(ip) {
  const now = Date.now();
  const times = hits.get(ip) || [];
  times.push(now);
  hits.set(ip, times);
}

/**
 * A much more generous limiter for the draft-progress autosync — this
 * fires many times per real session (every keystroke on the first couple
 * of screens, every selection after that), so it needs enough headroom
 * that a genuine, fast-moving user never hits it. It exists purely to
 * stop a scripted flood from writing garbage rows, not to throttle normal
 * use. A sync that gets rate-limited is dropped silently client-side —
 * never shown to the user, never blocks navigation.
 */
const DRAFT_SYNC_WINDOW_MS = 60 * 1000;
const DRAFT_SYNC_MAX = 60; // ~1/second sustained, comfortably above real typing/tapping speed
const draftHits = new Map();

setInterval(() => {
  const cutoff = Date.now() - DRAFT_SYNC_WINDOW_MS;
  for (const [ip, times] of draftHits) {
    const kept = times.filter((t) => t > cutoff);
    if (kept.length) draftHits.set(ip, kept);
    else draftHits.delete(ip);
  }
}, 5 * 60 * 1000).unref();

export function checkDraftSync(ip) {
  const now = Date.now();
  const times = (draftHits.get(ip) || []).filter((t) => t > now - DRAFT_SYNC_WINDOW_MS);
  if (times.length >= DRAFT_SYNC_MAX) return { ok: false };
  times.push(now);
  draftHits.set(ip, times);
  return { ok: true };
}

/** Best-effort client IP from a Node request, accounting for Caddy's forwarded headers. */
export function clientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (xff) return String(xff).split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
}
