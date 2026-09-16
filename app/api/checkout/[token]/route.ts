import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getStripe } from "@/lib/stripe";
import { REPORT_PRICE_CENTS } from "@/lib/pricing";
import { persona } from "@/lib/persona";
import { siteUrl } from "@/lib/siteUrl";

export const runtime = "nodejs";

// Starts a Stripe Checkout session to unlock ONE report's full text. One-time
// payment, no accounts — the report token in the URL is already the private
// access key for this report (same model as the rest of the app), so paying
// just flips a `paid` flag on that same row.
export async function POST(
  _req: Request,
  { params }: { params: { token: string } },
) {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("reports")
      .select("token, status, paid, chat_title")
      .eq("token", params.token)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }
    if (data.status !== "done") {
      return NextResponse.json(
        { error: "This report isn't ready yet." },
        { status: 409 },
      );
    }

    // Falls back to the request origin as a last resort: checkout must
    // work even if nothing is configured, since the alternative is a sale
    // that cannot be completed.
    const base = siteUrl() || new URL(_req.url).origin;

    // Already paid (e.g. a stale tab, or the webhook beat this click) —
    // nothing to charge, just send them back to the unlocked report.
    if (data.paid) {
      return NextResponse.json({ url: `${base}/r/${params.token}` });
    }

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: REPORT_PRICE_CENTS,
            product_data: {
              name: `${persona.name}'s full report${
                data.chat_title ? ` — ${data.chat_title}` : ""
              }`,
              // Required once "Managed Payments" is enabled on the Stripe
              // account (on by default for new accounts) — without it,
              // Checkout session creation throws "the product tax code is
              // missing" and the unlock button surfaces a raw Stripe error.
              // txcd_10000000 is Stripe's generic "General - Electronically
              // Supplied Services" code, the right bucket for a digital,
              // non-physical report unlock. See
              // https://docs.stripe.com/tax/tax-categories
              tax_code: "txcd_10000000",
            },
          },
        },
      ],
      // {CHECKOUT_SESSION_ID} is substituted by Stripe on redirect, so the
      // report page learns which session was actually paid rather than
      // trusting the one stored on the row. That matters because every click
      // of "Unlock" creates a NEW session and overwrites stripe_session_id —
      // so someone who opens checkout twice can pay on one session while the
      // row remembers the other, and the reconcile then asks Stripe about an
      // abandoned session and leaves a paying customer locked out.
      success_url: `${base}/r/${params.token}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/r/${params.token}?checkout=cancelled`,
      // The webhook reads this back to know which report to mark paid.
      metadata: { token: params.token },
    });

    if (!session.url) {
      return NextResponse.json(
        { error: "Could not start checkout." },
        { status: 500 },
      );
    }

    // NOT best-effort any more. lib/checkoutStatus.ts uses this id to ask
    // Stripe "was this session paid?" when the webhook hasn't marked the
    // report — so if this write is lost, that safety net has nothing to go
    // on and a paying customer's only route back is the webhook working.
    // Still not fatal to checkout (better to let someone pay and reconcile
    // later than to block the sale), but it must be visible in the logs.
    const { error: sessionIdError } = await supabase
      .from("reports")
      .update({ stripe_session_id: session.id })
      .eq("token", params.token);

    if (sessionIdError) {
      console.error(
        `[checkout] could not store session id ${session.id} for token ${params.token}:`,
        sessionIdError.message,
      );
    }

    return NextResponse.json({ url: session.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Checkout failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
