"use client";

import { useState, type ReactNode } from "react";
import { persona } from "@/lib/persona";

// Wraps the full report body: blurs it and overlays an unlock card. Starting
// checkout just asks the server for a Stripe Checkout URL and redirects —
// the report is only ever marked paid by the webhook (app/api/stripe/webhook),
// never by this client code, so there's nothing to fake here.
export function PaywallGate({
  token,
  priceLabel,
  children,
}: {
  token: string;
  priceLabel: string;
  children: ReactNode;
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
        aria-hidden
        className="pointer-events-none max-h-[70vh] select-none overflow-hidden blur-md [mask-image:linear-gradient(to_bottom,black,black_15%,transparent_75%)]"
      >
        {children}
      </div>

      <div className="absolute inset-x-0 top-0 flex justify-center pt-6">
        <div className="mx-4 w-full max-w-sm rounded-2xl border border-ink/10 bg-cream/95 p-6 text-center shadow-card backdrop-blur">
          <p className="font-serif text-xl text-ink">
            The rest is behind a lock, sorry
          </p>
          <p className="mt-2 text-sm text-ink-soft">
            The metaphor, the roles, the central tension, the leaderboard, and
            the one serious thing {persona.name} won&apos;t say for free.
          </p>
          <button
            onClick={unlock}
            disabled={loading}
            className="mt-5 w-full rounded-full px-6 py-3 font-serif text-lg shadow-soft disabled:opacity-60"
            style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
          >
            {loading ? "Redirecting…" : `Unlock full report — ${priceLabel}`}
          </button>
          {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
          <p className="mt-3 text-xs text-ink-soft/70">
            One-time payment. Secure checkout via Stripe.
          </p>
        </div>
      </div>
    </div>
  );
}
