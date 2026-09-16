"use client";

import { useEffect, useState } from "react";
import { persona } from "@/lib/persona";

// Sticky-ish share affordance (docs/05) — the whole point is sharing the report
// back into the chat. Copy link + share to WhatsApp.
export function ShareBar({ url, title }: { url: string; title?: string | null }) {
  const [copied, setCopied] = useState(false);

  // Last line of defence on the one thing this component exists to do.
  // lib/siteUrl.ts should always hand down an absolute URL, but when it
  // didn't — NEXT_PUBLIC_APP_URL unset in production — "Copy link" silently
  // copied "/r/<token>", which pastes into WhatsApp as a dead string and
  // looks to the user like the product is broken. The browser always knows
  // its own origin, so a relative URL is repaired here rather than shipped.
  //
  // Set in an effect, not at render: the server has no window, and computing
  // this during render would make the server and client markup disagree.
  const [shareUrl, setShareUrl] = useState(url);
  useEffect(() => {
    if (!/^https?:\/\//i.test(url)) {
      setShareUrl(new URL(url, window.location.origin).toString());
    } else {
      setShareUrl(url);
    }
  }, [url]);

  const shareText = title
    ? `${persona.name} read "${title}" 👀 ${shareUrl}`
    : `${persona.name} read our chat 👀 ${shareUrl}`;
  const waHref = `https://wa.me/?text=${encodeURIComponent(shareText)}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="sticky bottom-4 z-10 mx-auto flex w-fit items-center gap-2 rounded-full border border-ink/10 bg-cream/95 p-1.5 shadow-soft backdrop-blur">
      <button
        onClick={copy}
        className="rounded-full px-5 py-2.5 text-sm font-medium text-ink hover:bg-ink/5"
      >
        {copied ? "Copied!" : "Copy link"}
      </button>
      <a
        href={waHref}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-full px-5 py-2.5 text-sm font-medium"
        style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
      >
        Share to WhatsApp
      </a>
    </div>
  );
}
