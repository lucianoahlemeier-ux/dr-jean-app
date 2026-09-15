import Stripe from "stripe";

// Server-only Stripe client. NEVER import this into a client component — the
// secret key must never reach the browser (same rule as lib/supabase.ts).

let cached: Stripe | null = null;

// Managed Payments — on by default for new Stripe accounts — only exists from
// API version 2025-03-31.basil onwards. The SDK sends its own pinned version
// unless told otherwise, and the pinned version on stripe-node 17.x was
// 2025-02-24.acacia, so every Checkout session this app created was rejected:
// "Managed Payments is not supported on API version 2025-02-24.acacia."
// stripe-node 18.x pins 2025-08-27.basil, which clears it.
//
// Pinned explicitly rather than left to the SDK default so the API version is
// a deliberate choice visible in the diff, not something that silently moves
// the day someone runs `npm update`. If a future SDK major drops this literal
// from its LatestApiVersion union, that's a compile error here — which is the
// point: an API version change should be noticed, not discovered in prod.
const API_VERSION = "2025-08-27.basil";

export function getStripe(): Stripe {
  if (cached) return cached;

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("Stripe is not configured. Set STRIPE_SECRET_KEY.");
  }

  cached = new Stripe(key, { apiVersion: API_VERSION });
  return cached;
}
