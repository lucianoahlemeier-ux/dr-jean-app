import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getSupabase } from "@/lib/supabase";
import { getStripe } from "@/lib/stripe";

export const runtime = "nodejs";

// Stripe calls this once a Checkout session completes. This is the ONLY
// place that ever marks a report `paid` — never trust a client-side redirect
// for that, since anyone could hit /r/[token]?checkout=success without
// paying. Verifying the signature is what proves the event genuinely came
// from Stripe rather than an attacker POSTing a fake "paid" event here.
export async function POST(req: Request) {
  const signature = req.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !webhookSecret) {
    return NextResponse.json(
      { error: "Webhook not configured" },
      { status: 500 },
    );
  }

  const rawBody = await req.text();
  const stripe = getStripe();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid signature";
    return NextResponse.json(
      { error: `Webhook signature verification failed: ${message}` },
      { status: 400 },
    );
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const token = session.metadata?.token;

    if (token) {
      const supabase = getSupabase();
      await supabase
        .from("reports")
        .update({
          paid: true,
          paid_at: new Date().toISOString(),
          stripe_payment_intent_id:
            typeof session.payment_intent === "string"
              ? session.payment_intent
              : null,
        })
        .eq("token", token);
    }
  }

  return NextResponse.json({ received: true });
}
