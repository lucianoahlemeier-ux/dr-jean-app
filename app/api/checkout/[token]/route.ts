import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getStripe } from "@/lib/stripe";
import { REPORT_PRICE_CENTS } from "@/lib/pricing";
import { persona } from "@/lib/persona";

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

    const base =
      process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
      new URL(_req.url).origin;

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
      success_url: `${base}/r/${params.token}?checkout=success`,
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

    // Best-effort — useful for reconciliation in the Stripe dashboard, not
    // required for the unlock itself (the webhook is the source of truth).
    await supabase
      .from("reports")
      .update({ stripe_session_id: session.id })
      .eq("token", params.token);

    return NextResponse.json({ url: session.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Checkout failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
