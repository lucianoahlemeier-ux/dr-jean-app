// Price of unlocking one report's full text. Server-side only — the
// Checkout session is always created here, never trusted from the client.
export const REPORT_PRICE_CENTS = Number(process.env.REPORT_PRICE_CENTS ?? 499);

export function formatPrice(cents: number = REPORT_PRICE_CENTS): string {
  return `$${(cents / 100).toFixed(2)}`;
}
