import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getSupabase } from "@/lib/supabase";
import { formatPrice, REPORT_PRICE_CENTS } from "@/lib/pricing";

// The money funnel, read from the reports table rather than an analytics
// product — because every step of it is already a column here:
//
//   a report row exists          someone finished the wizard and uploaded
//   status = done                the AI actually produced something
//   stripe_session_id is set     they clicked "Unlock"
//   paid = true                  they paid
//
// Duplicating that into a third-party tool would mean two sources of truth for
// the same numbers, and the one that bills you would be the less accurate one.
// Vercel Web Analytics covers the half that genuinely isn't here: how many
// people arrived, and from where.
//
// AGGREGATES ONLY — counts and rates, never a token, an email, a chat title or
// a line of report text. This page sits behind a single shared key, which is
// proportionate for one person checking their own numbers but is not real
// authentication. Designing it so a leaked key exposes "42 reports sold"
// instead of 42 customers' private links is what makes that trade acceptable.

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const metadata: Metadata = { robots: { index: false, follow: false } };

function pct(part: number, whole: number): string {
  if (whole === 0) return "—";
  return `${((part / whole) * 100).toFixed(1)}%`;
}

export default async function StatsPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const adminKey = process.env.ADMIN_KEY;

  // No key configured means no admin page at all, rather than an open one.
  // Failing closed is the only safe default for something like this.
  if (!adminKey) notFound();
  if (searchParams?.key !== adminKey) notFound();

  const supabase = getSupabase();
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const count = async (build: (q: any) => any, windowed: boolean) => {
    let q = supabase.from("reports").select("id", { count: "exact", head: true });
    if (windowed) q = q.gte("created_at", since);
    const { count: n } = await build(q);
    return n ?? 0;
  };

  const rows = await Promise.all(
    [false, true].map(async (windowed) => ({
      windowed,
      started: await count((q) => q, windowed),
      done: await count((q) => q.eq("status", "done"), windowed),
      failed: await count((q) => q.eq("status", "failed"), windowed),
      clicked: await count((q) => q.not("stripe_session_id", "is", null), windowed),
      paid: await count((q) => q.eq("paid", true), windowed),
    })),
  );

  return (
    <main className="min-h-screen bg-cream">
      <div className="mx-auto max-w-3xl px-5 py-12">
        <h1 className="font-serif text-3xl text-ink">Stats</h1>
        <p className="mt-2 text-sm text-ink-soft">
          Straight from the reports table. Traffic and referrers live in Vercel
          Analytics — this is what happens after someone arrives.
        </p>

        {rows.map((r) => (
          <section key={String(r.windowed)} className="mt-10">
            <h2 className="font-serif text-xl text-ink">
              {r.windowed ? "Last 30 days" : "All time"}
            </h2>
            <div className="mt-4 overflow-x-auto rounded-2xl border border-ink/10 bg-white/70 shadow-card">
              <table className="w-full text-sm">
                <tbody>
                  <Row label="Uploaded a chat" value={r.started} />
                  <Row
                    label="Report finished"
                    value={r.done}
                    note={`${pct(r.done, r.started)} of uploads`}
                  />
                  <Row
                    label="Generation failed"
                    value={r.failed}
                    note={r.failed > 0 ? `${pct(r.failed, r.started)} — worth looking at` : "none"}
                  />
                  <Row
                    label="Clicked unlock"
                    value={r.clicked}
                    note={`${pct(r.clicked, r.done)} of finished reports`}
                  />
                  <Row
                    label="Paid"
                    value={r.paid}
                    note={`${pct(r.paid, r.done)} of finished reports`}
                  />
                  <Row
                    label="Revenue"
                    value={`${formatPrice().replace(/[\d.,]+/, "")}${(
                      (r.paid * REPORT_PRICE_CENTS) /
                      100
                    ).toFixed(2)}`}
                    note={`at ${formatPrice()} each`}
                  />
                </tbody>
              </table>
            </div>
          </section>
        ))}

        <p className="mt-10 text-xs leading-relaxed text-ink-soft">
          The number that decides whether this business works is{" "}
          <strong>paid ÷ uploaded</strong>, because every upload costs you an
          AI call whether or not it sells — reports are generated in full
          before the paywall. Measure what one report actually costs and
          compare it against that rate before spending on marketing.
        </p>
      </div>
    </main>
  );
}

function Row({
  label,
  value,
  note,
}: {
  label: string;
  value: number | string;
  note?: string;
}) {
  return (
    <tr className="border-b border-ink/5 last:border-0">
      <td className="px-5 py-3 text-ink">{label}</td>
      <td className="px-5 py-3 text-right font-semibold text-ink">{value}</td>
      <td className="px-5 py-3 text-right text-xs text-ink-soft">{note ?? ""}</td>
    </tr>
  );
}
