import Link from "next/link";
import { notFound } from "next/navigation";
import { Header } from "@/components/Header";
import { SiteFooter } from "@/components/SiteFooter";
import { persona } from "@/lib/persona";
import { formatPrice } from "@/lib/pricing";
import { legal, legalIsConfigured, supportEmail } from "@/lib/legal";

// ⚠️ DRAFT. A structure to take to someone qualified — not legal advice, and
// not written by a lawyer. Selling digital goods to EU consumers brings
// specific obligations that depend on where you're established and how you're
// set up. Get it reviewed before relying on it.
//
// 404s until lib/legal.ts is filled in: publishing a policy with "[YOUR NAME]"
// in it is worse than not having the page, because the 404 is something you'll
// notice and the placeholder is something you won't.

export const metadata = {
  title: `Terms — What ${persona.name} Thinks`,
};

export default function TermsPage() {
  if (!legalIsConfigured()) notFound();
  const email = supportEmail();

  return (
    <main className="min-h-screen">
      <Header />
      <div className="mx-auto max-w-2xl px-5 py-12">
        <h1 className="font-serif text-4xl text-ink">Terms</h1>
        <p className="mt-3 text-sm text-ink-soft">
          Last updated {new Date().toLocaleDateString("en-GB", {
            year: "numeric",
            month: "long",
          })}
        </p>

        <div className="report-prose mt-8">
          <h2>Who you&apos;re buying from</h2>
          <p>
            This service is operated by {legal.tradingName}, based in{" "}
            {legal.country}
            {legal.registrationNumber
              ? ` (registration ${legal.registrationNumber})`
              : ""}
            . You can reach us any time at{" "}
            <a href={`mailto:${email}`}>{email}</a>.
          </p>

          <h2>What you get</h2>
          <p>
            You upload a chat export. {persona.name} — an AI — reads it and
            writes a report about the conversation, which lives at a private
            link only people you share it with can reach. Paying{" "}
            {formatPrice()} once unlocks the full text of that one report,
            permanently. There&apos;s no subscription and no account.
          </p>

          <h2>What it isn&apos;t</h2>
          <p>
            The report is entertainment. {persona.name} writes in the voice of a
            psychologist, but is not one, and nothing in a report is
            psychological, medical, relationship or legal advice. It&apos;s an
            AI&apos;s reading of a conversation — it can be wrong, and it can be
            confidently wrong. Please don&apos;t make decisions that matter
            based on it.
          </p>

          <h2>Only upload chats you&apos;re part of</h2>
          <p>
            By uploading, you&apos;re confirming you were a participant in that
            conversation and that you&apos;re comfortable having it read. Other
            people in a group chat haven&apos;t agreed to anything — think about
            them before you upload, and before you share what comes back.
          </p>

          <h2>Things that would get an account stopped</h2>
          <p>
            Uploading conversations you weren&apos;t part of, using reports to
            harass or humiliate someone, or trying to break, overload or work
            around the limits on the service. We can decline or stop service if
            any of that happens.
          </p>

          <h2>When things go wrong</h2>
          <p>
            We run this carefully but we can&apos;t promise the service is
            always available or that a report is always what you hoped for. If
            you paid and something didn&apos;t work, that&apos;s what the{" "}
            <Link href="/refunds">refund policy</Link> is for — email us and
            we&apos;ll sort it out. Nothing here is meant to take away rights
            you have as a consumer under the law where you live.
          </p>

          <h2>Your chat isn&apos;t kept</h2>
          <p>
            The raw conversation is deleted as soon as the report is written —
            the <Link href="/privacy">privacy page</Link> explains exactly what
            is and isn&apos;t stored.
          </p>

          <h2>Changes</h2>
          <p>
            If these terms change, the version at the top of this page changes
            with them. What applied when you bought is what applies to that
            purchase.
          </p>
        </div>
      </div>
      <SiteFooter />
    </main>
  );
}
