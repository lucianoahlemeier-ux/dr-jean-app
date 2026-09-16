import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Header } from "@/components/Header";
import { ShareBar } from "@/components/ShareBar";
import { ReportBody, ReportTeaser } from "@/components/ReportBody";
import { CheckoutSyncing } from "@/components/CheckoutSyncing";
import { getSupabase } from "@/lib/supabase";
import { reconcilePaidStatus } from "@/lib/checkoutStatus";
import { persona } from "@/lib/persona";
import { formatPrice } from "@/lib/pricing";
import {
  extractHeadlineStats,
  splitReportSections,
  pickTeaserSection,
  clampTeaser,
} from "@/lib/reportPreview";

export const dynamic = "force-dynamic";
// Explicit, even though force-dynamic is documented to imply it. This page
// asks Stripe "was this session paid?" through `fetch`, which Next patches
// and caches — and a cached "unpaid" answer from before the customer paid
// would replay on every refresh and never unlock. That exact failure already
// cost us a day on /api/report/[token]; not relying on an implication here.
export const fetchCache = "force-no-store";

/**
 * Two jobs.
 *
 * 1. Keep these URLs OUT of search engines. A report token is the only thing
 *    protecting a private read of someone's group chat — if one of these
 *    links ever gets posted somewhere public, "private link" must not quietly
 *    become "indexed by Google". noindex costs nothing and is very hard to
 *    retrofit once it has happened.
 * 2. Make the share worth clicking. People paste these back into the chat
 *    the report is about, so the preview leads with the group's own name
 *    rather than a bare URL. Selects only chat_title — pulling the whole
 *    report_markdown just to build a title would double the page's DB cost
 *    for one line of text.
 */
export async function generateMetadata({
  params,
}: {
  params: { token: string };
}): Promise<Metadata> {
  const robots = { index: false, follow: false };

  let chatTitle: string | null = null;
  try {
    const { data } = await getSupabase()
      .from("reports")
      .select("chat_title")
      .eq("token", params.token)
      .single();
    chatTitle = data?.chat_title ?? null;
  } catch {
    // A metadata lookup must never take the page down — fall back to the
    // generic title and let the page itself handle a missing report.
  }

  const title = chatTitle
    ? `${persona.name} read "${chatTitle}" 👀`
    : `${persona.name} read our chat 👀`;
  const description = `${persona.name} went through the whole thing and wrote a report. ${persona.tagline}`;

  return {
    title,
    description,
    robots,
    openGraph: { type: "article", title, description },
    twitter: { card: "summary_large_image", title, description },
  };
}

// The report page at a private token URL (docs/05, docs/03). Layout matches
// `report reference/Screenshot *.png`: a badge, the model's title rendered
// big/centered/serif, a static byline card sourced straight from
// lib/persona.ts (not model-generated — see docs/03), the privacy line,
// then the model's markdown body with quoted messages rendered as chat
// bubbles (see `ChatQuote` in components/ReportBody.tsx and the "```chat"
// convention in lib/prompt.ts).

/**
 * The model's first line is always the H1 title (docs/03 Part A #1). Pull it
 * out so the page can render it as a dedicated, styled title block instead of
 * flowing it through the generic markdown `h1` style — everything else stays
 * in `body` for ReactMarkdown.
 */
function splitTitle(markdown: string): { title: string; body: string } {
  const lines = markdown.split("\n");
  if (lines[0]?.startsWith("# ")) {
    return {
      title: lines[0].slice(2).trim(),
      body: lines.slice(1).join("\n").trim(),
    };
  }
  return { title: "", body: markdown };
}

export default async function ReportPage({
  params,
  searchParams,
}: {
  params: { token: string };
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("reports")
    .select(
      "status, report_markdown, chat_title, cover_image_url, message_count, paid, stripe_session_id",
    )
    .eq("token", params.token)
    .single();

  if (error || !data) notFound();

  if (data.status !== "done" || !data.report_markdown) {
    // Not ready yet — bounce to the status page which polls.
    return (
      <main className="min-h-screen">
        <Header />
        <div className="mx-auto max-w-xl px-5 py-24 text-center">
          <h1 className="font-serif text-3xl text-ink">
            {persona.name} isn&apos;t finished yet.
          </h1>
          <p className="mt-4 text-ink-soft">
            This report is still being written.
          </p>
          <Link
            href={`/status/${params.token}`}
            className="mt-8 inline-block rounded-full bg-ink px-6 py-3 text-cream"
          >
            Check status
          </Link>
        </div>
      </main>
    );
  }

  const base = process.env.NEXT_PUBLIC_APP_URL || "";
  const url = `${base}/r/${params.token}`;
  const { title, body } = splitTitle(data.report_markdown);
  // If the row says unpaid, ask Stripe directly — the webhook is the primary
  // path, this is the safety net for when it doesn't land.
  //
  // The session id Stripe puts on the success redirect is tried FIRST,
  // because it names the session actually paid. The column can be stale: each
  // click of "Unlock" creates a new session and overwrites it, so someone who
  // opened checkout twice may have paid on a session the row no longer
  // remembers. The stored id is the fallback, for someone returning to the
  // link later without the redirect parameter.
  //
  // Safe despite ?session_id= being attacker-controllable: reconcile refuses
  // any session whose metadata.token doesn't match this report
  // (lib/checkoutStatus.ts).
  const redirectSessionId =
    typeof searchParams?.session_id === "string" ? searchParams.session_id : null;
  const candidateSessions = [redirectSessionId, data.stripe_session_id].filter(
    (id): id is string => typeof id === "string" && id.length > 0,
  );

  let isPaid = data.paid === true;
  for (const sessionId of isPaid ? [] : [...new Set(candidateSessions)]) {
    if (await reconcilePaidStatus(params.token, sessionId)) {
      isPaid = true;
      break;
    }
  }
  const headlineStats = isPaid ? null : extractHeadlineStats(body);
  const showCheckoutSyncing = !isPaid && searchParams?.checkout === "success";
  const sections = splitReportSections(body);
  // Unpaid visitors are handed ONE clamped section, never the full list —
  // the locked prose must not be sitting in the page source.
  const teaserSection = isPaid ? null : pickTeaserSection(sections);
  const teaser = teaserSection ? clampTeaser(teaserSection) : null;

  return (
    <main className="min-h-screen">
      <Header />

      <article className="mx-auto max-w-measure px-5 py-12">
        {data.cover_image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={data.cover_image_url}
            alt={data.chat_title ?? "group"}
            className="mb-8 max-h-72 w-full rounded-2xl object-cover shadow-card"
          />
        )}

        {title && (
          <>
            <div className="mx-auto mb-4 w-fit rounded-full border border-ink/15 px-3 py-1 text-xs font-medium text-ink-soft">
              Classic Report
            </div>
            <h1 className="text-center font-serif text-3xl leading-tight text-ink sm:text-4xl">
              {title}
            </h1>
            <div className="mt-6 flex items-center gap-3 rounded-2xl border border-ink/10 bg-white/60 p-4 shadow-card">
              <Image
                src={persona.avatar}
                alt={persona.name}
                width={44}
                height={44}
                className="h-11 w-11 shrink-0 rounded-full object-cover"
              />
              <div>
                <div className="font-semibold text-ink">{persona.name}</div>
                <div className="text-sm text-ink-soft">{persona.byline}</div>
              </div>
            </div>
            <p className="mt-4 text-center text-xs italic text-ink-soft">
              The conversation used to create this report wasn&apos;t saved.{" "}
              <Link href="/privacy" className="not-italic underline">
                Learn more
              </Link>
            </p>
            <hr className="my-8 border-t border-ink/10" />
          </>
        )}

        {showCheckoutSyncing && (
          <div className="flex justify-center">
            <CheckoutSyncing token={params.token} />
          </div>
        )}

        <div className="flex flex-col gap-5">
          {!isPaid && headlineStats && (
            <div className="rounded-2xl border border-ink/10 bg-white/70 p-6 shadow-card">
              <p className="mb-4 text-center text-xs font-medium uppercase tracking-wide text-ink-soft">
                the star review — headline stats
              </p>
              <ul className="space-y-2">
                {headlineStats.stats.map((stat, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between gap-4 text-sm"
                  >
                    <span className="font-medium text-ink">{stat.label}</span>
                    <span aria-hidden className="tracking-wide">
                      {stat.stars}
                    </span>
                  </li>
                ))}
              </ul>
              {headlineStats.verdict && (
                <p className="mt-4 text-center font-serif text-ink">
                  {headlineStats.verdict}
                </p>
              )}
            </div>
          )}
          {isPaid ? (
            <ReportBody sections={sections} />
          ) : (
            teaser && (
              <ReportTeaser
                markdown={teaser}
                token={params.token}
                priceLabel={formatPrice()}
              />
            )
          )}
        </div>

        {/* Everything below is PAID-ONLY. An unpaid page ends at the unlock
            card: a sign-off for a report they haven't read, a sticky share
            bar for a link that shows the reader a paywall, and a "get
            another report" pitch all just compete with the one action the
            page is asking for. */}
        {isPaid && (
          <div className="mt-10 flex flex-col items-center gap-3 text-center text-sm text-ink-soft">
            <Image
              src={persona.avatar}
              alt={persona.name}
              width={40}
              height={40}
              className="h-10 w-10 rounded-full object-cover shadow-card"
            />
            <p>
              Prepared by {persona.name}. The conversation used to write this
              wasn&apos;t saved.
            </p>
          </div>
        )}
      </article>

      {isPaid && (
        <>
          <ShareBar url={url} title={data.chat_title} />

          {/* Which chat is next? — loops users back into the wizard. */}
          <section className="paper mt-12 border-t border-ink/5">
            <div className="mx-auto max-w-2xl px-5 py-16 text-center">
              <h2 className="font-serif text-3xl text-ink">
                Which chat is next?
              </h2>
              <p className="mt-3 text-ink-soft">
                Your family group. The lads&apos; trip. That one situationship.
              </p>
              <Link
                href="/get-report"
                className="mt-8 inline-block rounded-full px-8 py-4 font-serif text-lg shadow-soft"
                style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
              >
                Get another report →
              </Link>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
