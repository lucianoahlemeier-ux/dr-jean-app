import type { Metadata, Viewport } from "next";
import "./globals.css";
import { persona } from "@/lib/persona";
import { siteUrl } from "@/lib/siteUrl";
import { Analytics } from "@vercel/analytics/next";

// The growth loop of this product is someone pasting a report link back into
// the group chat it's about. Without these tags that paste renders as a bare
// URL — no title, no image, nothing to click — which is the difference
// between a share that spreads and a share that looks like spam.
//
// metadataBase is what lets the relative opengraph-image URL below resolve to
// an absolute one; without it Next can't build the tag and the preview is
// silently blank in production.
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: `${persona.name} — AI reads your chat`,
  description: persona.tagline,
  openGraph: {
    type: "website",
    siteName: persona.name,
    title: `${persona.name} — AI reads your chat`,
    description: persona.tagline,
  },
  twitter: {
    card: "summary_large_image",
    title: `${persona.name} — AI reads your chat`,
    description: persona.tagline,
  },
};

// Mobile: fit the device width, allow pinch-zoom (don't lock user scaling).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#FFF8F2",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {/* Brand accent from the persona config → CSS variables, one source of
            truth for the whole site. */}
        <style
          dangerouslySetInnerHTML={{
            __html: `:root{--accent:${persona.accent};--accent-fg:${persona.accentFg};}`,
          }}
        />
      </head>
      <body className="min-h-screen font-sans antialiased">
        {children}
        {/* Traffic and referrers — which is the half of the picture that isn't
            already in Postgres. The conversion funnel (reports started →
            finished → unlock clicked → paid) is every one of those a column on
            the reports table, so /admin/stats reads it straight from there
            rather than duplicating it into an analytics product.

            Cookieless and stores no persistent identifier, which is why it
            doesn't drag a consent banner onto a site whose whole pitch is not
            keeping your data. Worth re-checking if it's ever swapped for
            something that does set identifiers. Custom events are a Pro
            feature — on Hobby this is page views only. */}
        <Analytics />
      </body>
    </html>
  );
}
