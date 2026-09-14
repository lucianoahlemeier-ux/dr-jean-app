import Link from "next/link";
import { Header } from "@/components/Header";
import { persona } from "@/lib/persona";

// Plain privacy policy (docs/02): EU-based, third-party consent note, deletion
// offer, no retention. Treated as a real constraint, not a footnote.
export const metadata = {
  title: `Privacy — What ${persona.name} Thinks`,
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen">
      <Header />
      <div className="mx-auto max-w-2xl px-5 py-12">
        <h1 className="font-serif text-4xl text-ink">Privacy &amp; how it works</h1>

        <div className="report-prose mt-8">
          <h2>We never store your chat.</h2>
          <p>
            When you upload a conversation, {persona.name} reads it{" "}
            <strong>in memory</strong> to write the report, then the raw chat is{" "}
            <strong>discarded</strong>. We keep only the finished report and a
            little metadata (the language you chose, the relationship type, your
            email so we can send the link). The transcript is never written to a
            database and never used to train anything.
          </p>

          <h2>The AI is used in a no-retention posture.</h2>
          <p>
            Your conversation is sent to the model that writes the report and is
            not retained or used for training.
          </p>

          <h2>About the other people in the chat.</h2>
          <p>
            You consented to this — the other people in the chat did not. We take
            that seriously: we don&apos;t retain the conversation, and we&apos;ll
            delete any report on request. Please only make a report about people
            who would find it funny, and don&apos;t share anything that would
            hurt someone.
          </p>

          <h2>Deleting a report.</h2>
          <p>
            Want a report gone? Email us the private link and we&apos;ll delete
            it. Because we don&apos;t store the underlying chat, there&apos;s
            nothing else to remove.
          </p>

          <h2>What we&apos;re built on.</h2>
          <p>
            Next.js on Vercel, Supabase (report records only), Inngest (the
            background job), Resend (the email), and the Anthropic API (the model
            that writes the report). All free-tier except the model calls.
          </p>
        </div>

        <Link
          href="/"
          className="mt-10 inline-block text-ink-soft underline hover:text-ink"
        >
          ← Back home
        </Link>
      </div>
    </main>
  );
}
