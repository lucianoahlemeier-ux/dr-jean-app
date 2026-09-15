import { getStripe } from "./stripe";
import { getSupabase } from "./supabase";

// Self-healing unlock.
//
// The Stripe webhook (app/api/stripe/webhook) is the PRIMARY way a report
// gets marked paid, and it stays that way — it's the only path that works
// when the buyer closes the tab the moment they've paid.
//
// But making it the ONLY path means any webhook problem — endpoint not
// registered, registered against the wrong environment, a stale
// STRIPE_WEBHOOK_SECRET, Stripe retrying into a cold start, a transient
// Supabase error on a write nobody checked — leaves someone who has
// genuinely paid staring at a paywall with no way out but emailing support.
// That happened on the very first real test of this flow.
//
// So the report page also asks Stripe directly: "this report has a checkout
// session against it and isn't marked paid — was that session actually
// paid?" If yes, it writes the flag itself. Stripe is the authority either
// way; this just stops the answer from depending on one delivery mechanism.
//
// This is NOT a client-trust hole. It runs server-side with the secret key
// and believes only Stripe's own answer — never a `?checkout=success` query
// param, which anyone could type.

/**
 * Returns true if the report is (now) paid. Called only when the DB says
 * unpaid and a checkout session exists for the token, so the common case —
 * an unpaid report nobody has tried to buy — costs no Stripe call at all.
 */
export async function reconcilePaidStatus(
  token: string,
  sessionId: string,
): Promise<boolean> {
  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    // "paid" is the only value that means money actually moved. An
    // abandoned or expired session sits at "unpaid" forever, which is the
    // normal outcome for someone who opened checkout and thought better of
    // it — not an error, just nothing to do.
    if (session.payment_status !== "paid") return false;

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

    if (error) {
      // Worth shouting about: Stripe says this person paid and we couldn't
      // record it. Safe fields only — no card data, no report text.
      console.error(
        `[checkout] reconcile: Stripe reports session ${sessionId} paid but the DB update failed:`,
        error.message,
      );
      return false;
    }

    console.log(
      `[checkout] reconcile: marked report paid from session ${sessionId} (webhook had not)`,
    );
    return true;
  } catch (err) {
    // Never let a Stripe outage take the report page down with it — a
    // locked page is a bad outcome, a 500 is a worse one.
    console.error(
      `[checkout] reconcile failed for session ${sessionId}:`,
      err instanceof Error ? err.message : err,
    );
    return false;
  }
}
