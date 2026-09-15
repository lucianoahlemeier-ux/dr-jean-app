import { createHash } from "crypto";
import { getSupabase } from "./supabase";

// Spend guard for /api/generate.
//
// That route is unauthenticated and every call it accepts costs real money:
// the job it enqueues calls Claude over an entire transcript, and — because
// reports are generated in full BEFORE the paywall — that spend happens
// whether or not anyone ever pays. One loop, or one unexpectedly good day on
// social, is a bill with no revenue attached.
//
// Backed by Postgres rather than an in-memory Map because serverless spreads
// requests across instances that share no memory: an in-memory counter would
// bound a single warm instance and nothing else, which is the shape of
// protection that looks fine in testing and isn't there when it matters.
// Supabase is already a dependency, so this adds no infrastructure.

/** Hashes are stored, never raw IPs or emails. An IP address is personal
 * data; we only ever need to know "is this the same actor as before", which
 * a keyed hash answers without keeping the identifier itself. The service
 * role key doubles as the salt — always present server-side, never shipped
 * to a browser — so this needs no extra env var to configure. */
function hashKey(kind: string, value: string): string {
  const salt = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "unsalted";
  return `${kind}:${createHash("sha256")
    .update(`${salt}:${kind}:${value.toLowerCase().trim()}`)
    .digest("hex")
    .slice(0, 32)}`;
}

const WINDOW_HOURS = 24;

/** Per-IP is the real guard. Per-email is weaker (anyone can type a new
 * address) but stops the lazy case and the accidental double-submit. Both
 * are deliberately generous for a real person and tight for a script. */
const LIMITS = {
  ip: Number(process.env.RATE_LIMIT_PER_IP_PER_DAY ?? 10),
  email: Number(process.env.RATE_LIMIT_PER_EMAIL_PER_DAY ?? 5),
};

export interface RateLimitResult {
  ok: boolean;
  /** Which bucket tripped — for the log line, never shown to the user. */
  reason?: "ip" | "email";
}

/**
 * Reads the caller's IP from the proxy headers Vercel sets. Returns null
 * when it can't be determined, in which case IP limiting is skipped rather
 * than guessed at — better to fall back to the email limit than to lump
 * every unknown caller into one shared bucket that any single user could
 * exhaust for everyone.
 */
export function clientIp(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip");
}

export async function checkRateLimit(
  ip: string | null,
  email: string,
): Promise<RateLimitResult> {
  const supabase = getSupabase();
  const since = new Date(
    Date.now() - WINDOW_HOURS * 60 * 60 * 1000,
  ).toISOString();

  const buckets: { key: string; limit: number; reason: "ip" | "email" }[] = [];
  if (ip) buckets.push({ key: hashKey("ip", ip), limit: LIMITS.ip, reason: "ip" });
  buckets.push({
    key: hashKey("email", email),
    limit: LIMITS.email,
    reason: "email",
  });

  try {
    for (const bucket of buckets) {
      const { count, error } = await supabase
        .from("rate_limit_hits")
        .select("id", { count: "exact", head: true })
        .eq("bucket", bucket.key)
        .gte("created_at", since);

      // Fail OPEN on an infrastructure error. A rate limiter that takes the
      // product down when its own table misbehaves has caused a worse
      // outage than the abuse it was guarding against — but say so loudly,
      // because it means the spend guard is not currently guarding.
      if (error) {
        console.error(
          "[ratelimit] check failed, allowing request:",
          error.message,
        );
        return { ok: true };
      }

      if ((count ?? 0) >= bucket.limit) {
        return { ok: false, reason: bucket.reason };
      }
    }

    await supabase
      .from("rate_limit_hits")
      .insert(buckets.map((b) => ({ bucket: b.key })));

    // Opportunistic pruning — roughly one request in twenty clears rows that
    // are past the window, so the table stays small without a cron job.
    if (Math.random() < 0.05) {
      const cutoff = new Date(
        Date.now() - 2 * WINDOW_HOURS * 60 * 60 * 1000,
      ).toISOString();
      await supabase.from("rate_limit_hits").delete().lt("created_at", cutoff);
    }

    return { ok: true };
  } catch (err) {
    console.error(
      "[ratelimit] unexpected failure, allowing request:",
      err instanceof Error ? err.message : err,
    );
    return { ok: true };
  }
}
