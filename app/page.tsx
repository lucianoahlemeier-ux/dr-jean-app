import Link from "next/link";
import Image from "next/image";
import { Header } from "@/components/Header";
import { LinkButton } from "@/components/ui";
import { ReactionStrip } from "@/components/ReactionStrip";
import { Faq } from "@/components/Faq";
import { persona } from "@/lib/persona";

// Landing page — matches reference/Site: big playful wordmark hero, one CTA,
// the reaction "wall of love" strip (the growth engine), a "three ways to get
// read" section (v1 ships one), and the FAQ.
//
// Background: landing-page-only ambient glow (adapted from a 21st.dev
// radial-gradient component — reimplemented here in plain CSS/inline style,
// no new dependency needed for a single static gradient div). Scoped to this
// page alone: the shared `.paper` class (app/globals.css) that the report
// page's footer section also uses is left untouched; these sections just
// stop applying it and sit on the plain cream body background + the glow
// instead. The glow is a static, non-interactive layer (`pointer-events-none`,
// z-0, behind a z-10 content wrapper) — no animation, so no CPU/GPU cost
// beyond one composited paint, and multiply blend only ever darkens the cream
// base, which keeps ink-on-cream contrast the same or better (verified
// visually, see PR notes) — no extra scrim needed.
export default function LandingPage() {
  return (
    <main className="relative overflow-x-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[900px]"
        style={{
          backgroundImage:
            "radial-gradient(ellipse 1100px 700px at 50% 0%, #FCE8A6 0%, transparent 70%)",
          opacity: 0.55,
          mixBlendMode: "multiply",
        }}
      />

      <div className="relative z-10">
        <Header />

        {/* Hero */}
        <section>
          <div className="mx-auto max-w-4xl px-5 pb-12 pt-12 text-center sm:pb-16 sm:pt-20">
            <h1 className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 font-serif text-4xl leading-none text-ink sm:text-6xl lg:text-7xl">
              <span>What</span>
              <span className="inline-flex max-w-full items-center gap-2 rounded-full bg-cream px-3 py-1.5 shadow-card sm:gap-3 sm:px-5 sm:py-2">
                <Image
                  src={persona.avatar}
                  alt={persona.name}
                  width={44}
                  height={44}
                  className="h-8 w-8 shrink-0 rounded-full object-cover sm:h-11 sm:w-11"
                />
                <span className="min-w-0 break-words">{persona.name}</span>
              </span>
              <span className="italic">Thinks</span>
            </h1>

            <p className="mx-auto mt-6 max-w-xl text-lg text-ink-soft sm:mt-8 sm:text-2xl">
              {persona.tagline}
            </p>

            <div className="mt-10 flex justify-center">
              <LinkButton href="/get-report" variant="dark">
                Get the Report →
              </LinkButton>
            </div>
          </div>

          {/* Social-proof strip — where virality lives. */}
          <div className="pb-10">
            <ReactionStrip />
          </div>
        </section>

        {/* Three ways to get read (v1 = Classic; others teased as coming soon). */}
        <section className="border-t border-ink/5">
          <div className="mx-auto max-w-5xl px-5 py-14 sm:py-20">
            <h2 className="mb-10 text-center font-serif text-3xl text-ink sm:mb-12 sm:text-4xl">
              Three ways to get read
            </h2>
            <div className="grid gap-6 md:grid-cols-3">
              <Tier
                title="Classic Report"
                badge="Available now"
                body={`Funny, sharp, and the one people start with. ${persona.name} reads one chat and says what everyone is thinking.`}
                highlight
              />
              <Tier
                title="Deep Report"
                badge="Coming soon"
                body={`Deeper, quieter, more honest. ${persona.name} reads the chat closely and names what's happening underneath.`}
              />
              <Tier
                title="The Mirror"
                badge="Coming soon"
                body={`Not about one chat. About you. Upload multiple conversations and see the patterns ${persona.name} finds across them.`}
              />
            </div>
            <div className="mt-12 flex justify-center">
              <LinkButton href="/get-report" variant="dark">
                Try it out →
              </LinkButton>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="border-t border-ink/5">
          <div className="mx-auto max-w-5xl px-5 py-14 sm:py-20">
            <Faq />
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-ink/10 bg-cream">
          <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 px-5 py-8 text-sm text-ink-soft sm:flex-row">
            <span>© {new Date().getFullYear()} What {persona.name} Thinks</span>
            <Link href="/privacy" className="underline hover:text-ink">
              Privacy &amp; how it works
            </Link>
          </div>
        </footer>
      </div>
    </main>
  );
}

function Tier({
  title,
  badge,
  body,
  highlight,
}: {
  title: string;
  badge: string;
  body: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border bg-white/80 p-6 shadow-card ${
        highlight ? "border-ink" : "border-ink/10"
      }`}
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-lg font-bold text-ink">{title}</h3>
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            highlight
              ? "bg-accent text-accent-fg"
              : "bg-cream-deep text-ink-soft"
          }`}
        >
          {badge}
        </span>
      </div>
      <p className="text-ink-soft">{body}</p>
    </div>
  );
}
