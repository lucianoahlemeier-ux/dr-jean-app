/**
 * The app's own public base URL — one answer, used everywhere.
 *
 * This existed in four places with three different fallbacks, and the
 * difference between them was invisible until each broke separately in
 * production: the share button copied a relative "/r/…" that pastes into
 * WhatsApp as nothing, the OG tags advertised an image on localhost, and the
 * report email — not yet switched on — was lined up to send every recipient a
 * link to their own machine. All from one unset variable.
 *
 * The lesson isn't "set the variable", it's that a missing base URL should
 * never silently produce a plausible-looking wrong one.
 *
 * Order of preference:
 *   1. NEXT_PUBLIC_APP_URL — what you actually configured. Always wins.
 *   2. VERCEL_PROJECT_PRODUCTION_URL — the project's production domain, set
 *      by Vercel automatically. Stable across deploys.
 *   3. VERCEL_URL — this specific deployment. Correct but ugly and
 *      per-deploy, so it's a last resort before giving up.
 *   4. localhost, which is right for `npm run dev` and wrong everywhere else.
 *
 * Note 2 and 3 are server-only: NEXT_PUBLIC_* is inlined into client bundles
 * at build time, the VERCEL_* vars are not. Every caller here is server-side.
 * A client component that needs this should resolve against
 * window.location.origin instead (see components/ShareBar.tsx).
 */
export function siteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return normalise(configured);

  const vercelProduction = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercelProduction) return normalise(vercelProduction);

  const vercelDeployment = process.env.VERCEL_URL?.trim();
  if (vercelDeployment) {
    // Worth a log line: links will work, but they'll point at a
    // deployment-specific hostname that changes on every push, which is not
    // something you want in an email someone keeps.
    console.warn(
      "[siteUrl] NEXT_PUBLIC_APP_URL is not set — falling back to this " +
        "deployment's URL. Set it to your real domain.",
    );
    return normalise(vercelDeployment);
  }

  if (process.env.NODE_ENV === "production") {
    console.error(
      "[siteUrl] No base URL available in production. Share links, emails " +
        "and social previews will be wrong. Set NEXT_PUBLIC_APP_URL.",
    );
  }
  return "http://localhost:3000";
}

/** Accepts "example.com", "https://example.com" or a trailing slash and
 * returns a consistent absolute origin. Vercel supplies its host vars
 * without a scheme, so this can't just trust the input. */
function normalise(value: string): string {
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  return withScheme.replace(/\/+$/, "");
}
