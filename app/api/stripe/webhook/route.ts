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

    if (!token) {
      // Nothing to unlock — log it rather than silently 200, because it
      // means a session was created without the metadata the unlock needs.
      console.error(
        `[stripe] checkout.session.completed with no metadata.token (session ${session.id})`,
      );
      return NextResponse.json({ received: true });
    }

    const supabase = getSupabase();
    const { error } = await supabase
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

    // This used to be a bare `await` whose result was thrown away, so a
    // failed write still answered Stripe with 200 "received" — the customer
    // stayed locked out, Stripe considered the event delivered and never
    // retried, and nothing was logged anywhere. Returning 500 makes Stripe
    // retry with backoff, and puts the reason in the function logs.
    if (error) {
      console.error(
        `[stripe] failed to mark report paid (session ${session.id}):`,
        error.message,
      );
      return NextResponse.json(
        { error: "Could not record payment" },
        { status: 500 },
      );
    }

    console.log(`[stripe] marked report paid (session ${session.id})`);
  }

  return NextResponse.json({ received: true });
}
