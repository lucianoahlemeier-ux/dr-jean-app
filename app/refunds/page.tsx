import Link from "next/link";
import { notFound } from "next/navigation";
import { Header } from "@/components/Header";
import { SiteFooter } from "@/components/SiteFooter";
import { persona } from "@/lib/persona";
import { formatPrice } from "@/lib/pricing";
import { legalIsConfigured, supportEmail } from "@/lib/legal";

// ⚠️ DRAFT — see the note in app/terms/page.tsx. This one especially:
// consumers buying digital content in the EU normally have a 14-day right to
// withdraw, and the usual way to deliver instantly is to ask the buyer to
// agree upfront that they lose that right once delivery starts. This app does
// NOT currently collect that agreement at checkout, so the text below promises
// a plain refund instead of leaning on a waiver that was never taken. That's
// the honest position given how checkout works today — but it's exactly the
// kind of thing to raise with whoever reviews this.

export const metadata = {
  title: `Refunds — What ${persona.name} Thinks`,
};

export default function RefundsPage() {
  if (!legalIsConfigured()) notFound();
  const email = supportEmail();

  return (
    <main className="min-h-screen">
      <Header />
      <div className="mx-auto max-w-2xl px-5 py-12">
        <h1 className="font-serif text-4xl text-ink">Refunds</h1>

        <div className="report-prose mt-8">
          <h2>The short version</h2>
          <p>
            If you paid {formatPrice()} and you&apos;re not happy, email{" "}
            <a href={`mailto:${email}`}>{email}</a> with your report link and
            we&apos;ll refund you. You don&apos;t need to argue your case.
          </p>

          <h2>Definitely refunded</h2>
          <p>
            If the report never unlocked, the link doesn&apos;t work, you were
            charged twice, or the report came back broken or in the wrong
            language — that&apos;s on us, and we&apos;ll refund it without
            asking questions.
          </p>

          <h2>The honest caveat</h2>
          <p>
            A report is written the moment you upload, before you pay, and it
            can&apos;t be un-read — so &ldquo;I didn&apos;t like what it
            said&rdquo; is a harder one. We&apos;d still rather refund you than
            have you feel stung by €5, so ask. But that&apos;s also why you get
            the star ratings and a full section for free before deciding: so you
            know what {persona.name}&apos;s writing sounds like before you pay
            for the rest.
          </p>

          <h2>How long it takes</h2>
          <p>
            We&apos;ll reply within a few days and process the refund through
            Stripe, back to the card you paid with. Your bank usually takes
            another five to ten days to show it.
          </p>

          <h2>Your legal rights</h2>
          <p>
            Depending on where you live you may have consumer rights that go
            beyond this policy — including, in much of the EU, a right to
            withdraw from a purchase within 14 days. Nothing here reduces those
            rights. If you want to rely on them, just say so in your email.
          </p>

          <p>
            See also the <Link href="/terms">terms</Link> and the{" "}
            <Link href="/privacy">privacy page</Link>.
          </p>
        </div>
      </div>
      <SiteFooter />
    </main>
  );
}
