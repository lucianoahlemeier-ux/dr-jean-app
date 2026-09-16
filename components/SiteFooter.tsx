import Link from "next/link";
import { persona } from "@/lib/persona";
import { legalIsConfigured, supportEmail } from "@/lib/legal";

// One footer, used everywhere, so "how does a customer reach a human" has a
// single answer instead of being remembered per page.
//
// Links appear only when they lead somewhere real: with lib/legal.ts unfilled,
// /terms and /refunds 404, so advertising them would be worse than omitting
// them. Fill that file in and they show up.
export function SiteFooter() {
  const email = supportEmail();
  const policies = legalIsConfigured();

  return (
    <footer className="border-t border-ink/10 bg-cream">
      <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 px-5 py-8 text-sm text-ink-soft sm:flex-row">
        <span>
          © {new Date().getFullYear()} What {persona.name} Thinks
        </span>
        <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
          <Link href="/privacy" className="underline hover:text-ink">
            Privacy
          </Link>
          {policies && (
            <>
              <Link href="/terms" className="underline hover:text-ink">
                Terms
              </Link>
              <Link href="/refunds" className="underline hover:text-ink">
                Refunds
              </Link>
            </>
          )}
          {email && (
            <a href={`mailto:${email}`} className="underline hover:text-ink">
              Contact
            </a>
          )}
        </nav>
      </div>
    </footer>
  );
}
