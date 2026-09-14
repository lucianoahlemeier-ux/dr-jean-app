"use client";

import { useState } from "react";
import { persona } from "@/lib/persona";

// Sticky-ish share affordance (docs/05) — the whole point is sharing the report
// back into the chat. Copy link + share to WhatsApp.
export function ShareBar({ url, title }: { url: string; title?: string | null }) {
  const [copied, setCopied] = useState(false);

  const shareText = title
    ? `${persona.name} read "${title}" 👀 ${url}`
    : `${persona.name} read our chat 👀 ${url}`;
  const waHref = `https://wa.me/?text=${encodeURIComponent(shareText)}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
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
