"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// Shown right after a successful Stripe Checkout redirect, for the brief
// window where the webhook hasn't flipped `paid` yet (webhooks are usually
// near-instant, but can lag the browser's own redirect back here by a
// second or two). Polls the same status endpoint the /status page uses,
// then refreshes this server component once the report is actually paid.
const POLL_MS = 2000;
const MAX_TRIES = 10; // ~20s, then give up quietly — a manual refresh picks it up

export function CheckoutSyncing({ token }: { token: string }) {
  const router = useRouter();
  const [tries, setTries] = useState(0);
  const [gaveUp, setGaveUp] = useState(false);

  useEffect(() => {
    if (tries >= MAX_TRIES) {
      setGaveUp(true);
      return;
    }
    const id = setTimeout(async () => {
      try {
        const res = await fetch(`/api/report/${token}`, { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          if (data.paid) {
            router.refresh();
            return;
          }
        }
      } catch {
        // ignore — just retry
      }
      setTries((t) => t + 1);
    }, POLL_MS);
    return () => clearTimeout(id);
  }, [tries, token, router]);

  return (
    <div className="mx-auto mb-6 w-fit rounded-full border border-ink/15 bg-white/70 px-4 py-2 text-xs text-ink-soft">
      {gaveUp
        ? "Payment received. Refresh this page in a moment if it's still locked."
        : "Payment received — unlocking your report…"}
    </div>
  );
}
