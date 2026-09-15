import Stripe from "stripe";

// Server-only Stripe client. NEVER import this into a client component — the
// secret key must never reach the browser (same rule as lib/supabase.ts).

let cached: Stripe | null = null;

export function getStripe(): Stripe {
  if (cached) return cached;

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("Stripe is not configured. Set STRIPE_SECRET_KEY.");
  }

  cached = new Stripe(key);
  return cached;
}
