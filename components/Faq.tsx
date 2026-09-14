"use client";

import { useState } from "react";
import { persona } from "@/lib/persona";

const FAQ: { q: string; a: string }[] = [
  {
    q: `Who is ${persona.name}?`,
    a: `${persona.name} is an AI persona that reads a whole conversation and writes a funny, specific, warm-but-honest report about the people in it. ${persona.byline}`,
  },
  {
    q: "What kind of chats work?",
    a: "Anything with real back-and-forth: a group of friends, a couple, family, a work crew. The more messages, the sharper the read.",
  },
  {
    q: "Which apps does it support?",
    a: "Right now, WhatsApp only — export a chat as a .zip (Without media). iMessage is coming.",
  },
  {
    q: "How long does it take?",
    a: "A few minutes. Reading everything and writing a real report isn't instant — we'll email you the link the moment it's ready.",
  },
  {
    q: "Is it safe to share my private chat?",
    a: "Yes. The conversation is read in memory to write the report, then discarded — we never store the raw chat. We keep only the finished report and never use your chats to train anything.",
  },
  {
    q: "How do I share my report?",
    a: "You get a private link. Share it back into the chat — that's the best part.",
  },
];

export function Faq() {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="mx-auto max-w-2xl">
      <h2 className="mb-8 text-center font-serif text-4xl text-ink">FAQ</h2>
      <div className="divide-y divide-ink/10 border-t border-ink/10">
        {FAQ.map((item, i) => (
          <div key={i} className="py-4">
            <button
              onClick={() => setOpen(open === i ? null : i)}
              className="flex w-full items-center justify-between text-left"
            >
              <span className="text-lg text-ink">{item.q}</span>
              <span className="text-ink-soft">{open === i ? "↑" : "↓"}</span>
            </button>
            {open === i && (
              <p className="mt-3 text-ink-soft">{item.a}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
