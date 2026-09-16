/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  WHO IS SELLING THIS — fill in before taking real money.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Separate from lib/persona.ts on purpose. That file is the character; this is
 * the actual human or company on the other side of a €5 transaction. Selling to
 * consumers means being reachable and identifiable, and Stripe will ask for
 * most of this before it activates live payments anyway.
 *
 * While `supportEmail` is unset:
 *   - /terms and /refunds return 404 rather than publishing placeholder text
 *     dressed up as a policy. A 404 you notice beats fake terms you don't.
 *   - The footer shows only the links that actually work.
 *
 * ⚠️  The text on those pages is a DRAFT — a starting structure, not legal
 * advice, and not written by a lawyer. Selling digital goods to consumers in
 * the EU carries specific obligations (trader identity, withdrawal rights and
 * how a buyer waives them for instant delivery, VAT treatment) that vary by
 * country and by how you're set up. Have someone qualified read it before you
 * rely on it.
 */

export const legal = {
  /** Where a customer reaches a human. Used for support, refunds, and the
   * deletion request the privacy policy already promises. Until this is set,
   * the privacy page is making an offer nobody can take up. */
  supportEmail: "", // e.g. "hello@yourdomain.com"

  /** The name money is being taken under — your own name is fine if you
   * haven't set up an entity yet. Shown on the terms page. */
  tradingName: "",

  /** Country you're selling from. Determines which consumer rules apply. */
  country: "",

  /** Optional: registration/VAT number, if you have one. */
  registrationNumber: "",
} as const;

/** True once there's enough here to publish policies and be contactable. */
export function legalIsConfigured(): boolean {
  return Boolean(legal.supportEmail && legal.tradingName && legal.country);
}

/** The support address, or null when unset — callers render a contact route
 * only when there's a real address behind it, rather than a dead mailto. */
export function supportEmail(): string | null {
  return legal.supportEmail || null;
}
