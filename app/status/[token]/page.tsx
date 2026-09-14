"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { persona } from "@/lib/persona";

// Status screen (docs/01 step 10). Polls the report row until it's done, then
// redirects to the report page. "Dr. Jean is reading your chat…".

// Friendly stand-ins for the raw DB status column.
const STATUS_LABELS: Record<string, string> = {
  queued: "Getting in line…",
  processing: `${persona.name} is reading every message…`,
};

// Cycled independently of the status poll purely so the screen never looks
// frozen during the (usually longer) "processing" stretch.
const ROTATING_MESSAGES = [
  "still reading…",
  "taking notes…",
  "forming opinions…",
  "connecting the dots…",
  "double-checking a quote…",
  "getting a little too invested…",
];

export default function StatusPage({
  params,
}: {
  params: { token: string };
}) {
  const router = useRouter();
  const [status, setStatus] = useState<string>("queued");
  const [error, setError] = useState<string | null>(null);
  const [rotatingIndex, setRotatingIndex] = useState(0);

  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const res = await fetch(`/api/report/${params.token}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!active) return;
        setStatus(data.status);
        if (data.status === "done") {
          router.push(`/r/${params.token}`);
        } else if (data.status === "failed") {
          setError(
            data.error ||
              "Something went wrong writing your report. Please try again.",
          );
        }
      } catch {
        /* keep polling */
      }
    };
    poll();
    const id = setInterval(poll, 4000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [params.token, router]);

  useEffect(() => {
    const id = setInterval(() => {
      setRotatingIndex((i) => (i + 1) % ROTATING_MESSAGES.length);
    }, 3000);
    return () => clearInterval(id);
  }, []);

  return (
    <main className="min-h-screen">
      <Header />
      <div className="mx-auto flex max-w-xl flex-col items-center px-5 py-24 text-center">
        {!error ? (
          <>
            <div className="mb-8 flex gap-2">
              <Dot delay="0s" />
              <Dot delay="0.15s" />
              <Dot delay="0.3s" />
            </div>
            <h1 className="font-serif text-4xl text-ink">
              {persona.name} is reading your chat…
            </h1>
            <p className="mt-4 text-lg text-ink-soft">
              This takes a few minutes. We&apos;ll email you the private link
              the moment it&apos;s ready — you can close this tab.
            </p>
            <p className="mt-8 text-sm text-ink-soft">
              {STATUS_LABELS[status] ?? STATUS_LABELS.queued}
            </p>
            <p
              key={rotatingIndex}
              className="mt-2 animate-[statusFade_0.4s_ease] text-sm italic text-ink-soft/70"
            >
              {ROTATING_MESSAGES[rotatingIndex]}
            </p>
            <p className="mt-6 text-xs text-ink-soft/60">
              This can take a couple of minutes — hang tight.
            </p>
          </>
        ) : (
          <>
            <h1 className="font-serif text-3xl text-ink">
              That one got away.
            </h1>
            <p className="mt-4 text-ink-soft">{error}</p>
            <a
              href="/get-report"
              className="mt-8 rounded-full bg-ink px-6 py-3 text-cream"
            >
              Try again
            </a>
          </>
        )}
        <style>{`@keyframes bounce2{0%,80%,100%{transform:scale(0.6);opacity:0.4}40%{transform:scale(1);opacity:1}}@keyframes statusFade{from{opacity:0}to{opacity:1}}`}</style>
      </div>
    </main>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="inline-block h-4 w-4 rounded-full"
      style={{
        background: "var(--accent)",
        animation: "bounce2 1.4s infinite ease-in-out",
        animationDelay: delay,
      }}
    />
  );
}
