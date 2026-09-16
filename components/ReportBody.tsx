"use client";

import { useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { persona } from "@/lib/persona";
import { supportEmail } from "@/lib/legal";

// The report body, in two shapes:
//
//   <ReportBody>   paid — every section as its own card, all fully readable.
//   <ReportTeaser> free — ONE section (the "roles you think you play vs the
//                  roles you actually play" hook, picked by
//                  lib/reportPreview.ts' pickTeaserSection), clipped to a
//                  fixed height, its lower half dissolving into a smooth
//                  progressive blur with the unlock card sitting on top.
//                  The page ends there.
//
// The page picks ONE of them (app/r/[token]/page.tsx) — the unpaid branch is
// never handed the full section list, so the locked prose never reaches the
// browser at all, not even blurred in the page source.
//
// ChatQuote and markdownComponents live in THIS file, not the (server
// component) report page, on purpose: React Server Components can't pass
// raw functions as props into a Client Component ("use client", like this
// file) — only as pre-rendered children. Defining them here, and
// instantiating ReactMarkdown here too, keeps everything function-shaped on
// the client side of that boundary. (Confirmed via a real prod crash:
// "Error: Functions cannot be passed directly to Client Components..." —
// this exact function was being passed in as a `components` prop before.)

const CARD =
  "rounded-2xl border border-ink/10 bg-white/70 p-6 shadow-card sm:p-8";

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

function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
      {children}
    </ReactMarkdown>
  );
}

/** Paid view: the whole report, one card per section. */
export function ReportBody({ sections }: { sections: string[] }) {
  return (
    <div className="flex flex-col gap-5">
      {sections.map((section, i) => (
        <div key={i} className={`report-prose ${CARD}`}>
          <Markdown>{section}</Markdown>
        </div>
      ))}
    </div>
  );
}

// A single uniform blur reads as a grey smudge pasted over the text. Real
// depth-of-field ramps, so this stacks six thin layers instead: each one
// starts a little lower down the card and blurs about twice as hard as the
// one before it. Because a layer's backdrop includes the layers already
// painted beneath it, the blur compounds down the card into one continuous
// gradient with no visible banding or seam. (Each step is also strong
// enough to stand alone, so the effect degrades gracefully to "blurred at
// the bottom" if a browser declines to compose them.)
const BLUR_LAYERS = [
  { blur: 0.7, from: 30, to: 44 },
  { blur: 1.4, from: 38, to: 52 },
  { blur: 2.8, from: 46, to: 60 },
  { blur: 5.6, from: 54, to: 70 },
  { blur: 11, from: 62, to: 80 },
  { blur: 20, from: 70, to: 90 },
];

// bg-white/70 over the cream page background — the colour the text has to
// dissolve INTO for the clipped bottom edge to be invisible.
const CARD_SURFACE = "255, 253, 251";

/** Free view: one section, fading into the lock. */
export function ReportTeaser({
  markdown,
  token,
  priceLabel,
}: {
  markdown: string;
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

  return (
    <div className="relative">
      <div
        className={`report-prose relative overflow-hidden ${CARD}`}
        style={{ maxHeight: "min(72vh, 36rem)" }}
      >
        <Markdown>{markdown}</Markdown>

        <div aria-hidden className="pointer-events-none absolute inset-0">
          {BLUR_LAYERS.map((layer, i) => {
            const mask = `linear-gradient(to bottom, transparent ${layer.from}%, black ${layer.to}%, black 100%)`;
            return (
              <div
                key={i}
                className="absolute inset-0"
                style={{
                  backdropFilter: `blur(${layer.blur}px)`,
                  WebkitBackdropFilter: `blur(${layer.blur}px)`,
                  maskImage: mask,
                  WebkitMaskImage: mask,
                }}
              />
            );
          })}

          {/* Colour wash on top of the blur — without it the card would end
              on a hard clipped edge mid-sentence. With it, the prose simply
              runs out of light. */}
          <div
            className="absolute inset-x-0 bottom-0 h-3/4"
            style={{
              background: `linear-gradient(to bottom, rgba(${CARD_SURFACE}, 0) 0%, rgba(${CARD_SURFACE}, 0.4) 45%, rgba(${CARD_SURFACE}, 0.86) 78%, rgb(${CARD_SURFACE}) 100%)`,
            }}
          />
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 flex justify-center px-3 pb-5 sm:pb-7">
        <div className="unlock-rise w-full max-w-sm rounded-2xl border border-ink/10 bg-cream/95 p-5 text-center shadow-soft backdrop-blur-sm sm:p-6">
          <p className="font-serif text-lg text-ink sm:text-xl">
            The rest is behind a lock, sorry
          </p>
          <p className="mt-2 text-sm leading-snug text-ink-soft">
            The central tension, the leaderboard, and the one serious thing{" "}
            {persona.name} won&apos;t say for free.
          </p>
          <button
            onClick={unlock}
            disabled={loading}
            className="mt-4 w-full rounded-full px-6 py-3 font-serif text-lg shadow-soft transition-transform duration-200 hover:-translate-y-0.5 disabled:opacity-60 disabled:hover:translate-y-0"
            style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
          >
            {loading ? "Redirecting…" : `Unlock full report — ${priceLabel}`}
          </button>
          {error && (
            <p className="mt-3 text-xs text-red-600">
              {error}
              {/* A payment error is exactly when someone needs a human, and
                  it's the worst possible moment to be a dead end. */}
              {supportEmail() && (
                <>
                  {" "}
                  <a
                    href={`mailto:${supportEmail()}?subject=Trouble unlocking my report`}
                    className="underline"
                  >
                    Email us
                  </a>{" "}
                  and we&apos;ll sort it.
                </>
              )}
            </p>
          )}
          <p className="mt-3 text-xs text-ink-soft/70">
            One-time payment. Secure checkout via Stripe.
          </p>
        </div>
      </div>
    </div>
  );
}
