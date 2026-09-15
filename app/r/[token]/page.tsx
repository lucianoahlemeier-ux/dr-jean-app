import type { ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Header } from "@/components/Header";
import { ShareBar } from "@/components/ShareBar";
import { ReportBody } from "@/components/ReportBody";
import { CheckoutSyncing } from "@/components/CheckoutSyncing";
import { getSupabase } from "@/lib/supabase";
import { persona } from "@/lib/persona";
import { formatPrice } from "@/lib/pricing";
import { extractHeadlineStats, splitReportSections } from "@/lib/reportPreview";

export const dynamic = "force-dynamic";

// The report page at a private token URL (docs/05, docs/03). Layout matches
// `report reference/Screenshot *.png`: a badge, the model's title rendered
// big/centered/serif, a static byline card sourced straight from
// lib/persona.ts (not model-generated — see docs/03), the privacy line,
// then the model's markdown body with quoted messages rendered as chat
// bubbles (see `ChatQuote` below and the "```chat" convention in
// lib/prompt.ts).

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

/**
 * Renders a "```chat" fenced block (lib/prompt.ts quote convention) as
 * WhatsApp-style bubbles: one bubble per run of consecutive same-sender
 * lines, tinted with the persona's accent. Sender labels only show when a
 * block has more than one speaker (a back-and-forth) — matching the
 * reference, where a single-speaker quote has no visible label because the
 * surrounding prose already names who's talking.
 */
function ChatQuote({ text }: { text: string }) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const groups: { sender: string; lines: string[] }[] = [];

  for (const line of lines) {
    const match = line.match(/^([^:]+):\s?(.*)$/);
    if (!match) continue; // malformed line — skip rather than mis-render
    const [, rawSender, body] = match;
    const sender = rawSender.trim();
    const last = groups[groups.length - 1];
    if (last && last.sender === sender) {
      last.lines.push(body);
    } else {
      groups.push({ sender, lines: [body] });
    }
  }

  if (groups.length === 0) return null;
  const multiParty = new Set(groups.map((g) => g.sender)).size > 1;

  return (
    <div className="my-5 flex flex-col gap-3">
      {groups.map((group, i) => (
        <div key={i}>
          {multiParty && (
            <div className="mb-1 ml-1 text-xs font-medium text-ink-soft">
              {group.sender}
            </div>
          )}
          <div
            className="inline-block max-w-[85%] rounded-2xl rounded-bl-md px-4 py-2.5 font-sans"
            style={{
              background: "color-mix(in srgb, var(--accent) 12%, white)",
            }}
          >
            {group.lines.map((line, j) => (
              <p
                key={j}
                className="text-[0.95rem] leading-snug text-ink"
                style={{ margin: j === 0 ? 0 : "0.3rem 0 0" }}
              >
                {line}
                {j === group.lines.length - 1 && (
                  <span className="ml-1.5 align-middle text-[0.7rem] text-sky-600">
                    ✓✓
                  </span>
                )}
              </p>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
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
      "status, report_markdown, chat_title, cover_image_url, message_count, paid",
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
  const isPaid = data.paid === true;
  const headlineStats = isPaid ? null : extractHeadlineStats(body);
  const showCheckoutSyncing = !isPaid && searchParams?.checkout === "success";
  const sections = splitReportSections(body);

  const markdownComponents = {
    pre({ children }: { children?: ReactNode }) {
      return <>{children}</>;
    },
    code({
      className,
      children,
    }: {
      className?: string;
      children?: ReactNode;
    }) {
      if (/language-chat/.test(className || "")) {
        return <ChatQuote text={String(children).replace(/\n$/, "")} />;
      }
      return <code className={className}>{children}</code>;
    },
  };

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
          <ReportBody
            sections={sections}
            isPaid={isPaid}
            token={params.token}
            priceLabel={formatPrice()}
            components={markdownComponents}
          />
        </div>

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
      </article>

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
    </main>
  );
}
