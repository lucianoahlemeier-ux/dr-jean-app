"use client";

import { useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { persona } from "@/lib/persona";

// Renders the report as a stack of cards — one per section (lib/prompt.ts'
// mandated H2 structure, cut by lib/reportPreview.ts' splitReportSections).
//
// Paid reports: every card renders fully, same as before but visually
// chunked instead of one long unbroken scroll.
//
// Unpaid reports: the first couple of cards render fully (the hook), then
// each following card gets progressively more locked — a light gradient
// blur that still lets the opening lines read, then stronger, then a card
// that's essentially solid — so scrolling down reads as sinking into the
// lock rather than hitting one flat blurred wall. The stack ends in a plain,
// fully-legible unlock card (replaces the old floating overlay-on-blur,
// which looked like a broken page rather than a paywall).
//
// ChatQuote and markdownComponents live in THIS file, not the (server
// component) report page, on purpose: React Server Components can't pass
// raw functions as props into a Client Component ("use client", like this
// file) — only as pre-rendered children. Defining them here, and
// instantiating ReactMarkdown here too, keeps everything function-shaped on
// the client side of that boundary. (Confirmed via a real prod crash:
// "Error: Functions cannot be passed directly to Client Components..." —
// this exact function was being passed in as a `components` prop before.)

const FREE_FULL_SECTIONS = 2; // cold open + first section, shown completely
const FREE_TEASER_SECTIONS = 3; // additional cards, increasingly blurred

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

const markdownComponents = {
  pre({ children }: { children?: ReactNode }) {
    return <>{children}</>;
  },
  code({ className, children }: { className?: string; children?: ReactNode }) {
    if (/language-chat/.test(className || "")) {
      return <ChatQuote text={String(children).replace(/\n$/, "")} />;
    }
    return <code className={className}>{children}</code>;
  },
};

export function ReportBody({
  sections,
  isPaid,
  token,
  priceLabel,
}: {
  sections: string[];
  isPaid: boolean;
  token: string;
  priceLabel: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function unlock() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/checkout/${token}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.url) {
        throw new Error(data.error || "Could not start checkout.");
      }
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setLoading(false);
    }
  }

  // Guards the (rare, malformed-output) case where the model produced too
  // few H2 sections to gate anything — never let "nothing to lock" mean
  // "show the unpaid visitor the entire report".
  const fullCount =
    sections.length <= 1 ? sections.length : Math.min(FREE_FULL_SECTIONS, sections.length - 1);
  const isLocked = !isPaid;
  const visibleSections = isLocked
    ? sections.slice(0, fullCount + FREE_TEASER_SECTIONS)
    : sections;

  return (
    <div className="flex flex-col gap-5">
      {visibleSections.map((section, i) => {
        const locked = isLocked && i >= fullCount;
        const depth = locked ? i - fullCount : -1;
        return (
          <ReportCard key={i} locked={locked} depth={depth}>
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {section}
            </ReactMarkdown>
          </ReportCard>
        );
      })}

      {isLocked && (
        <div className="rounded-2xl border border-ink/10 bg-cream/95 p-6 text-center shadow-card sm:p-8">
          <p className="font-serif text-xl text-ink">
            The rest is behind a lock, sorry
          </p>
          <p className="mt-2 text-sm text-ink-soft">
            The central tension, the leaderboard, and the one serious thing{" "}
            {persona.name} won&apos;t say for free.
          </p>
          <button
            onClick={unlock}
            disabled={loading}
            className="mt-5 w-full rounded-full px-6 py-3 font-serif text-lg shadow-soft disabled:opacity-60 sm:w-auto sm:px-10"
            style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
          >
            {loading ? "Redirecting…" : `Unlock full report — ${priceLabel}`}
          </button>
          {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
          <p className="mt-3 text-xs text-ink-soft/70">
            One-time payment. Secure checkout via Stripe.
          </p>
        </div>
      )}
    </div>
  );
}

// Each step blurs sooner (mask goes opaque earlier) and harder (stronger
// backdrop-blur) than the last, so depth 0 is a teaser — its first lines
// stay legible before the card fades into blur — and by depth 2 the card
// is blurred almost from the top. The mask sits on a separate absolutely-
// positioned overlay with its own backdrop-blur, not on the text itself:
// that's what makes the blur *gradient* (fading in) rather than a uniform
// filter over the whole card.
const BLUR_STEPS = [
  {
    backdrop: "backdrop-blur-sm",
    mask: "linear-gradient(to bottom, transparent, transparent 38%, black 80%)",
  },
  {
    backdrop: "backdrop-blur-md",
    mask: "linear-gradient(to bottom, transparent, black 45%)",
  },
  {
    backdrop: "backdrop-blur-lg",
    mask: "linear-gradient(to bottom, transparent, black 15%)",
  },
];

function ReportCard({
  children,
  locked,
  depth,
}: {
  children: ReactNode;
  locked: boolean;
  depth: number;
}) {
  const card = "rounded-2xl border border-ink/10 bg-white/70 p-6 shadow-card sm:p-8";

  if (!locked) {
    return <div className={`report-prose ${card}`}>{children}</div>;
  }

  const step = BLUR_STEPS[Math.min(depth, BLUR_STEPS.length - 1)];
  return (
    <div
      aria-hidden
      className={`relative select-none overflow-hidden ${card}`}
    >
      <div className="report-prose">{children}</div>
      <div
        className={`pointer-events-none absolute inset-0 ${step.backdrop}`}
        style={{
          maskImage: step.mask,
          WebkitMaskImage: step.mask,
        }}
      />
    </div>
  );
}
