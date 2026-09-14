"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { Button, Card } from "@/components/ui";
import { persona } from "@/lib/persona";
import type { ParticipantStat, RelationshipType } from "@/lib/types";

// The onboarding wizard. Reproduces every screen from
// reference/beginning questions/ in order, one question per screen (docs/01).
// State lives here and is submitted at the end to /api/generate, which validates
// + enqueues and returns immediately. The uploaded File is held in memory only.
//
// Scope note (docs/01, CLAUDE.md): v1 is WhatsApp-only, Classic Report only,
// email-only delivery, no payments. The reference flow's paid tiers + paywall
// are shown as "coming soon" and the final step collects an email + generates,
// instead of a checkout.

const TOTAL_STEPS = 11;

const LANGUAGES = [
  "English", "Français", "Español", "العربية", "Deutsch", "Italiano",
  "Português", "Português (BR)", "Nederlands", "עברית", "हिन्दी", "Other",
];

const CHAT_TYPES: {
  value: RelationshipType;
  emoji: string;
  title: string;
  sub: string;
}[] = [
  { value: "partner", emoji: "❤️", title: "Partner or crush", sub: "Girlfriend, boyfriend, situationship, ex…" },
  { value: "friends", emoji: "😂", title: "Friends group", sub: "The chat where every bit becomes culture…" },
  { value: "best_friend", emoji: "🫶", title: "Best friend", sub: "The one person who knows too much…" },
  { value: "family", emoji: "🏡", title: "Family chat", sub: "Parents, siblings, cousins, logistics…" },
  { value: "work", emoji: "📋", title: "Work / team", sub: "Project chat, startup team, work crew…" },
  { value: "other", emoji: "🤷", title: "Other", sub: "Any chat you are curious about…" },
];

interface WizardState {
  language: string;
  relationship_type: RelationshipType | null;
  freeform_context: string;
  platform: "whatsapp" | "imessage" | null;
  file: File | null;
  messageCount: number | null;
  participants: ParticipantStat[];
  chat_title: string;
  nameOverrides: Record<string, string>;
  /** Step 8 "same person" merges: raw sender name -> the raw sender name (a
   * root, i.e. itself unmerged) it's been merged into. Resolved through
   * `resolveRoot` so a merge into an already-merged name still lands on the
   * final person. Purely a UI concept — nothing new is sent to the backend;
   * merging just points two keys in `nameOverrides` at the same string,
   * which `renderTranscript` (lib/whatsapp.ts) already re-attributes by. */
  mergedInto: Record<string, string>;
  cover: File | null;
  email: string;
}

/** Follow a chain of merges to the final, unmerged root name. Cycle-safe. */
function resolveRoot(name: string, mergedInto: Record<string, string>): string {
  const seen = new Set<string>();
  let current = name;
  while (mergedInto[current] && !seen.has(current)) {
    seen.add(current);
    current = mergedInto[current];
  }
  return current;
}

function countDistinctRoots(
  participants: ParticipantStat[],
  mergedInto: Record<string, string>,
): number {
  return new Set(participants.map((p) => resolveRoot(p.name, mergedInto))).size;
}

/**
 * Flags likely-same-person pairs by a simple heuristic: one participant's
 * whole name equals the FIRST token of another's (e.g. "Marco" vs "Marco
 * Bianchi" — the classic not-in-contacts-yet vs. saved-under-full-name
 * shape from docs/04). Never writes anything — purely a suggestion for the
 * user to confirm or dismiss.
 */
function suggestMerges(
  participants: ParticipantStat[],
): Array<{ shorter: string; longer: string }> {
  const suggestions: Array<{ shorter: string; longer: string }> = [];
  for (const a of participants) {
    for (const b of participants) {
      if (a.name === b.name || a.name.length >= b.name.length) continue;
      const firstToken = b.name.split(/\s+/)[0];
      if (a.name.toLowerCase() === firstToken.toLowerCase()) {
        suggestions.push({ shorter: a.name, longer: b.name });
      }
    }
  }
  return suggestions;
}

export default function GetReportPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [s, setS] = useState<WizardState>({
    language: "English",
    relationship_type: null,
    freeform_context: "",
    platform: "whatsapp",
    file: null,
    messageCount: null,
    participants: [],
    chat_title: "",
    nameOverrides: {},
    mergedInto: {},
    cover: null,
    email: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<string>>(
    new Set(),
  );

  const set = (patch: Partial<WizardState>) => setS((p) => ({ ...p, ...patch }));
  const next = () => {
    setError(null);
    setStep((n) => Math.min(TOTAL_STEPS, n + 1));
  };
  const back = () => {
    setError(null);
    setStep((n) => Math.max(1, n - 1));
  };

  // Step 6 — parse the upload in memory (no persistence) to show the count +
  // participants used by steps 7 and 8.
  async function handleFile(file: File) {
    setError(null);
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/parse", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Couldn't read that file.");
        setBusy(false);
        return;
      }
      set({
        file,
        messageCount: data.message_count,
        participants: data.participants,
        nameOverrides: Object.fromEntries(
          (data.participants as ParticipantStat[]).map((p) => [p.name, p.name]),
        ),
        mergedInto: {},
      });
      setDismissedSuggestions(new Set());
    } catch {
      setError("Couldn't read that file.");
    }
    setBusy(false);
  }

  // Step 8 — "same person" merge (docs: none new — purely UI, see the
  // investigation this was built from). Merging just points the child raw
  // sender's nameOverrides entry at whatever the target root's current
  // display name is; renderTranscript (lib/whatsapp.ts) already re-attributes
  // by name via that same map, so no parser/backend change is needed.
  function mergeInto(childRaw: string, targetRaw: string) {
    const targetRoot = resolveRoot(targetRaw, s.mergedInto);
    if (targetRoot === childRaw) return; // would create a cycle
    const nextMerged = { ...s.mergedInto, [childRaw]: targetRoot };
    if (countDistinctRoots(s.participants, nextMerged) < 2) {
      setError(
        "A report needs at least 2 people — you can't merge everyone into one.",
      );
      return;
    }
    setError(null);
    const nextOverrides = {
      ...s.nameOverrides,
      [childRaw]: s.nameOverrides[targetRoot] ?? targetRoot,
    };
    setS({ ...s, mergedInto: nextMerged, nameOverrides: nextOverrides });
  }

  function undoMerge(childRaw: string) {
    const { [childRaw]: _removed, ...restMerged } = s.mergedInto;
    setS({
      ...s,
      mergedInto: restMerged,
      nameOverrides: { ...s.nameOverrides, [childRaw]: childRaw },
    });
  }

  // A root row's own name input — cascades to anyone currently merged into
  // it, so a merged row always mirrors its root's LIVE display name, even if
  // the root is renamed after the merge.
  function updateOwnName(rawName: string, newValue: string) {
    const nextOverrides = { ...s.nameOverrides, [rawName]: newValue };
    for (const part of s.participants) {
      if (
        part.name !== rawName &&
        resolveRoot(part.name, s.mergedInto) === rawName
      ) {
        nextOverrides[part.name] = newValue;
      }
    }
    setS({ ...s, nameOverrides: nextOverrides });
  }

  function dismissSuggestion(sug: { shorter: string; longer: string }) {
    setDismissedSuggestions((prev) =>
      new Set(prev).add(`${sug.shorter}→${sug.longer}`),
    );
  }

  // Step 11 — submit everything. Fast route: validate + enqueue, returns a token.
  //
  // The redirect to /status/[token] must never depend on the cover photo (or
  // anything else) succeeding beyond this one fetch — /api/generate already
  // tolerates a failed cover upload server-side (it just proceeds with
  // cover_image_url: null), so the only thing that can legitimately stop the
  // redirect here is this request itself failing or not returning a token.
  async function submit() {
    if (!s.file) return;
    setError(null);
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", s.file);
      form.append("email", s.email);
      form.append("language", s.language);
      form.append("relationship_type", s.relationship_type ?? "other");
      form.append("freeform_context", s.freeform_context);
      form.append("platform", "whatsapp");
      form.append("chat_title", s.chat_title);
      form.append("name_overrides", JSON.stringify(s.nameOverrides));
      if (s.cover) form.append("cover", s.cover);

      const res = await fetch("/api/generate", { method: "POST", body: form });

      let data: { token?: string; error?: string };
      try {
        data = await res.json();
      } catch {
        setError("Unexpected response from the server. Please try again.");
        setBusy(false);
        return;
      }

      if (!res.ok || !data.token) {
        setError(data.error || "Something went wrong.");
        setBusy(false);
        return;
      }

      router.push(`/status/${data.token}`);
      // Deliberately leave `busy` true here: the button stays in its
      // "Sending..." state through the client-side transition to /status
      // instead of flashing back to "Generate my report" for a frame first.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen">
      <Header />
      <div className="mx-auto max-w-2xl px-5 py-10">
        {/* progress row */}
        <div className="mb-10 flex items-center justify-between">
          <button
            onClick={back}
            className="text-2xl text-ink-soft hover:text-ink disabled:opacity-30"
            disabled={step === 1}
            aria-label="Back"
          >
            ←
          </button>
          <span className="text-ink-soft">
            {step} of {TOTAL_STEPS}
          </span>
        </div>

        {error && (
          <div className="mb-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* ── Step 1 — language ─────────────────────────────────────────── */}
        {step === 1 && (
          <Step title="Pick a language for the report">
            <div className="flex flex-wrap gap-3">
              {LANGUAGES.map((lang) => (
                <button
                  key={lang}
                  onClick={() => set({ language: lang })}
                  className={`rounded-full border px-4 py-2 text-sm transition ${
                    s.language === lang
                      ? "border-ink bg-ink text-cream"
                      : "border-ink/15 bg-white/70 text-ink hover:border-ink/40"
                  }`}
                >
                  {lang}
                </button>
              ))}
            </div>
            <Button className="mt-8" variant="dark" onClick={next}>
              Continue →
            </Button>
          </Step>
        )}

        {/* ── Step 2 — chat type ────────────────────────────────────────── */}
        {step === 2 && (
          <Step
            title="Which chat are you thinking of?"
            sub={`${persona.name} can make an incredible report from any chat.`}
          >
            <div className="flex flex-col gap-3">
              {CHAT_TYPES.map((t) => (
                <Card
                  key={t.value}
                  selected={s.relationship_type === t.value}
                  onClick={() => set({ relationship_type: t.value })}
                >
                  <div className="flex items-center gap-4">
                    <span className="text-2xl">{t.emoji}</span>
                    <div>
                      <div className="font-semibold text-ink">{t.title}</div>
                      <div className="text-sm text-ink-soft">{t.sub}</div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
            <Button
              className="mt-8"
              variant="dark"
              disabled={!s.relationship_type}
              onClick={next}
            >
              Continue →
            </Button>
          </Step>
        )}

        {/* ── Step 3 — free-form context ────────────────────────────────── */}
        {step === 3 && (
          <Step
            title="Anything you want to add?"
            sub={`Tell ${persona.name} anything that helps.`}
          >
            <textarea
              value={s.freeform_context}
              onChange={(e) => set({ freeform_context: e.target.value })}
              placeholder="e.g. a group of uni friends, or my girlfriend of 3 years"
              rows={6}
              className="w-full rounded-2xl border border-ink/15 bg-white/70 p-4 text-ink outline-none focus:border-ink/40"
            />
            <Button className="mt-6" variant="dark" onClick={next}>
              {s.freeform_context.trim() ? "Continue →" : "Skip →"}
            </Button>
          </Step>
        )}

        {/* ── Step 4 — platform ─────────────────────────────────────────── */}
        {step === 4 && (
          <Step title="Where's your chat from?">
            <div className="flex flex-col gap-3">
              <Card
                selected={s.platform === "whatsapp"}
                onClick={() => set({ platform: "whatsapp" })}
              >
                <div className="flex items-center gap-4">
                  <span className="text-2xl">🟢</span>
                  <div>
                    <div className="font-semibold text-ink">WhatsApp</div>
                    <div className="text-sm text-ink-soft">
                      Export your chat straight from the WhatsApp app.
                    </div>
                  </div>
                </div>
              </Card>
              <Card
                selected={s.platform === "imessage"}
                onClick={() => set({ platform: "imessage" })}
              >
                <div className="flex items-center gap-4 opacity-70">
                  <span className="text-2xl">💬</span>
                  <div>
                    <div className="font-semibold text-ink">iMessage</div>
                    <div className="text-sm text-ink-soft">
                      Coming soon — WhatsApp only for now.
                    </div>
                  </div>
                </div>
              </Card>
            </div>
            {s.platform === "imessage" && (
              <p className="mt-4 text-sm text-ink-soft">
                iMessage export isn't available yet. Pick WhatsApp to continue.
              </p>
            )}
            <Button
              className="mt-8"
              variant="dark"
              disabled={s.platform !== "whatsapp"}
              onClick={next}
            >
              Continue →
            </Button>
          </Step>
        )}

        {/* ── Step 5 — reassurance / teaser ─────────────────────────────── */}
        {step === 5 && (
          <Step title="Sharing it is the best part.">
            <Card className="mx-auto max-w-sm">
              <div className="mb-3 aspect-video w-full rounded-xl bg-gradient-to-br from-cream-deep to-white" />
              <div className="font-semibold text-ink">
                Audit of 8 Grown-Up Adults
              </div>
              <div className="text-sm text-ink-soft">Read this!!!</div>
              <div className="mt-3 flex gap-2 text-sm">
                <span className="rounded-full bg-cream-deep px-3 py-1">
                  ❤️😂😭 4
                </span>
              </div>
            </Card>
            <div className="mt-6 space-y-2 text-ink-soft">
              <p className="rounded-2xl rounded-bl-md bg-cream-deep/70 px-3 py-2">
                HAHAHAHA 😭
              </p>
              <p className="rounded-2xl rounded-bl-md bg-cream-deep/70 px-3 py-2">
                I knew this chat would be weirdly perfect for this
              </p>
            </div>
            <Button className="mt-8" variant="dark" onClick={next}>
              Continue to upload →
            </Button>
          </Step>
        )}

        {/* ── Step 6 — how to export + upload ───────────────────────────── */}
        {step === 6 && (
          <Step title="How to export a conversation">
            <ol className="mb-6 list-decimal space-y-1 pl-5 text-sm text-ink-soft">
              <li>Open the chat in WhatsApp</li>
              <li>Tap ⋮ / the chat name → More → Export chat</li>
              <li>
                Choose <strong>Without media</strong>
              </li>
              <li>Save / share the .zip, then drop it below</li>
            </ol>

            <UploadZone
              busy={busy}
              messageCount={s.messageCount}
              fileName={s.file?.name ?? null}
              onFile={handleFile}
            />

            <Button
              className="mt-8"
              variant="dark"
              disabled={!s.messageCount}
              onClick={next}
            >
              Continue →
            </Button>
          </Step>
        )}

        {/* ── Step 7 — participants ─────────────────────────────────────── */}
        {step === 7 && (
          <Step title="Who's in this chat?">
            <input
              value={s.chat_title}
              onChange={(e) => set({ chat_title: e.target.value })}
              placeholder="Name this chat (optional)"
              className="mb-6 w-full rounded-xl border border-ink/15 bg-white/70 px-4 py-2 text-ink outline-none focus:border-ink/40"
            />
            <div className="space-y-4">
              {s.participants.map((p) => (
                <div key={p.name}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-medium text-ink">{p.name}</span>
                    <span className="text-ink-soft">
                      {p.count} · {p.percentage}%
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-cream-deep">
                    <div
                      className="h-full rounded-full bg-ink"
                      style={{ width: `${Math.max(4, p.percentage)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <Button className="mt-8" variant="dark" onClick={next}>
              Continue →
            </Button>
          </Step>
        )}

        {/* ── Step 8 — name review + "same person" merge ────────────────── */}
        {step === 8 && (() => {
          // Group participants by resolved root so merged-together rows
          // share one entry; recomputed from state on every render, nothing
          // stored beyond `mergedInto` itself.
          const rootsMap = new Map<string, ParticipantStat[]>();
          for (const part of s.participants) {
            const root = resolveRoot(part.name, s.mergedInto);
            if (!rootsMap.has(root)) rootsMap.set(root, []);
            rootsMap.get(root)!.push(part);
          }

          const activeSuggestions = suggestMerges(s.participants).filter(
            (sug) =>
              !dismissedSuggestions.has(`${sug.shorter}→${sug.longer}`) &&
              resolveRoot(sug.shorter, s.mergedInto) !==
                resolveRoot(sug.longer, s.mergedInto),
          );

          return (
            <Step
              title={`${persona.name} will use these names in the report`}
              sub="We recommend using first names only. If someone shows up twice (e.g. renamed mid-chat), merge them below."
            >
              {activeSuggestions.map((sug) => (
                <div
                  key={`${sug.shorter}→${sug.longer}`}
                  className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/30 bg-accent/5 px-4 py-3 text-sm"
                >
                  <span className="text-ink">
                    <strong>{sug.shorter}</strong> and{" "}
                    <strong>{sug.longer}</strong> look like the same person —
                    merge?
                  </span>
                  <div className="flex shrink-0 gap-2">
                    <button
                      onClick={() => mergeInto(sug.longer, sug.shorter)}
                      className="rounded-full bg-ink px-3 py-1.5 text-xs font-medium text-cream"
                    >
                      Merge
                    </button>
                    <button
                      onClick={() => dismissSuggestion(sug)}
                      className="rounded-full px-3 py-1.5 text-xs text-ink-soft hover:text-ink"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              ))}

              <div className="space-y-4">
                {s.participants.map((p) => {
                  const root = resolveRoot(p.name, s.mergedInto);
                  const isMergedAway = root !== p.name;

                  if (isMergedAway) {
                    const rootDisplay = s.nameOverrides[root] ?? root;
                    return (
                      <div
                        key={p.name}
                        className="flex items-center justify-between gap-3 rounded-xl bg-cream-deep/50 px-3 py-2.5 opacity-60"
                      >
                        <span className="text-sm text-ink-soft">
                          {p.name} <span className="mx-1">→</span> merged into{" "}
                          <strong className="text-ink">{rootDisplay}</strong>
                        </span>
                        <button
                          onClick={() => undoMerge(p.name)}
                          className="shrink-0 text-xs font-medium text-ink underline hover:text-accent"
                        >
                          Undo
                        </button>
                      </div>
                    );
                  }

                  const group = rootsMap.get(p.name) ?? [p];
                  const combinedCount = group.reduce(
                    (sum, g) => sum + g.count,
                    0,
                  );
                  const otherRoots = [...rootsMap.keys()].filter(
                    (r) => r !== p.name,
                  );

                  return (
                    <div key={p.name} className="flex items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cream-deep font-bold text-ink">
                        {(s.nameOverrides[p.name] || p.name)
                          .charAt(0)
                          .toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <input
                          value={s.nameOverrides[p.name] ?? p.name}
                          onChange={(e) =>
                            updateOwnName(p.name, e.target.value)
                          }
                          className="w-full border-b border-ink/20 bg-transparent py-1 text-lg text-ink outline-none focus:border-ink"
                        />
                        {group.length > 1 && (
                          <div className="mt-1 text-xs text-ink-soft">
                            {combinedCount.toLocaleString()} messages combined
                            ({group.length} merged)
                          </div>
                        )}
                      </div>
                      {otherRoots.length > 0 && (
                        <select
                          value=""
                          onChange={(e) => {
                            if (e.target.value) mergeInto(p.name, e.target.value);
                          }}
                          className="shrink-0 rounded-lg border border-ink/15 bg-white/70 px-2 py-2 text-sm text-ink-soft outline-none focus:border-ink/40"
                        >
                          <option value="">Not merged</option>
                          {otherRoots.map((r) => (
                            <option key={r} value={r}>
                              same as {s.nameOverrides[r] ?? r}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  );
                })}
              </div>
              <Button className="mt-8" variant="dark" onClick={next}>
                Confirm →
              </Button>
            </Step>
          );
        })()}

        {/* ── Step 9 — cover photo (optional) ───────────────────────────── */}
        {step === 9 && (
          <Step title="Add a photo of the group to personalize your report">
            <CoverPicker
              cover={s.cover}
              onSelect={(f) => set({ cover: f })}
              onRemove={() => set({ cover: null })}
            />
            <Button className="mt-8" variant="dark" onClick={next}>
              Continue →
            </Button>
          </Step>
        )}

        {/* ── Step 10 — report flavor ───────────────────────────────────── */}
        {step === 10 && (
          <Step title="Which report do you want?">
            <div className="space-y-3">
              <Card selected>
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-ink">Classic Report</div>
                  <span className="text-sm font-medium text-green-700">
                    Free
                  </span>
                </div>
                <div className="mt-2 rounded-lg bg-cream-deep/60 px-3 py-1 text-center text-sm text-ink-soft">
                  Most popular
                </div>
                <p className="mt-3 text-sm text-ink-soft">
                  The report that started it all. {persona.name} writes what
                  everyone in the chat thinks but never types. Sharp, funny and
                  a little too honest.
                </p>
              </Card>
              <div className="rounded-2xl border border-ink/10 bg-white/40 p-5 opacity-60">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-ink">Deep Report</span>
                  <span className="text-sm text-ink-soft">Coming soon 🔒</span>
                </div>
              </div>
              <div className="rounded-2xl border border-ink/10 bg-white/40 p-5 opacity-60">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-ink">The Mirror</span>
                  <span className="text-sm text-ink-soft">Coming soon 🔒</span>
                </div>
              </div>
            </div>
            <Button className="mt-8" variant="dark" onClick={next}>
              Continue →
            </Button>
          </Step>
        )}

        {/* ── Step 11 — email + generate ────────────────────────────────── */}
        {step === 11 && (
          <Step
            title="Where should we send it?"
            sub={`${persona.name} needs a few minutes. We'll email you the private link the moment it's ready.`}
          >
            <input
              type="email"
              value={s.email}
              onChange={(e) => set({ email: e.target.value })}
              placeholder="you@email.com"
              className="w-full rounded-xl border border-ink/15 bg-white/70 px-4 py-3 text-ink outline-none focus:border-ink/40"
            />

            <div className="mt-6 rounded-2xl bg-cream-deep/50 p-4 text-sm text-ink-soft">
              <div>
                <strong className="text-ink">Chat:</strong>{" "}
                {s.chat_title || "(untitled)"} · {s.messageCount} messages
              </div>
              <div>
                <strong className="text-ink">Language:</strong> {s.language}
              </div>
              <div>
                <strong className="text-ink">Report:</strong> Classic
              </div>
              <div className="mt-2 text-xs">
                The conversation used to write this won't be saved.
              </div>
            </div>

            <Button
              className="mt-8"
              variant="dark"
              disabled={busy || !s.email.trim()}
              onClick={submit}
            >
              {busy ? "Sending to " + persona.name + "…" : "Generate my report →"}
            </Button>
          </Step>
        )}
      </div>
    </main>
  );
}

function Step({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h1 className="text-2xl font-bold text-ink sm:text-3xl">{title}</h1>
      {sub && <p className="mt-2 text-ink-soft">{sub}</p>}
      <div className="mt-8">{children}</div>
    </div>
  );
}

// Step 9 — cover photo picker. Shows a real preview thumbnail once a file is
// selected (not just its filename), with a remove control and a "change
// photo" affordance to replace it. The object URL is created/revoked in an
// effect so it never leaks across selections or unmounts.
function CoverPicker({
  cover,
  onSelect,
  onRemove,
}: {
  cover: File | null;
  onSelect: (f: File) => void;
  onRemove: () => void;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!cover) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(cover);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [cover]);

  if (cover && previewUrl) {
    return (
      <div className="flex flex-col items-center gap-3">
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt="Cover preview"
            className="h-40 w-40 rounded-2xl object-cover shadow-card"
          />
          <button
            type="button"
            onClick={onRemove}
            aria-label="Remove cover photo"
            className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-ink text-cream shadow-soft hover:bg-ink/90"
          >
            ✕
          </button>
        </div>
        <span className="text-sm text-ink-soft">{cover.name}</span>
        <label className="cursor-pointer text-sm font-medium text-ink underline hover:text-accent">
          Change photo
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onSelect(f);
            }}
          />
        </label>
      </div>
    );
  }

  return (
    <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-ink/20 bg-white/50 p-10 text-center hover:border-ink/40">
      <input
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onSelect(f);
        }}
      />
      <span className="text-3xl">🖼️</span>
      <span className="font-medium text-ink">Add a photo (optional)</span>
      <span className="text-sm text-ink-soft">
        Just the group — not the chat. You can skip this.
      </span>
    </label>
  );
}

function UploadZone({
  busy,
  messageCount,
  fileName,
  onFile,
}: {
  busy: boolean;
  messageCount: number | null;
  fileName: string | null;
  onFile: (f: File) => void;
}) {
  const [drag, setDrag] = useState(false);

  if (messageCount) {
    return (
      <label className="block cursor-pointer">
        <input
          type="file"
          accept=".zip,.txt"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
          }}
        />
        <div className="rounded-2xl border-2 border-accent/50 bg-white/60 p-8 text-center">
          <div className="text-4xl font-bold text-ink">
            {messageCount.toLocaleString()} 💬
          </div>
          <div className="mt-2 text-sm text-green-700">📶 Good signal</div>
          <div className="mt-1 text-sm text-ink-soft">
            {fileName} · click to change the conversation
          </div>
          <div className="mt-3 text-xs text-ink-soft">
            More messages = a stronger signal for the AI
          </div>
        </div>
      </label>
    );
  }

  return (
    <label
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
      }}
      className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-12 text-center transition ${
        drag ? "border-ink bg-white/70" : "border-ink/20 bg-white/50"
      }`}
    >
      <input
        type="file"
        accept=".zip,.txt"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
        }}
      />
      <span className="text-3xl">📦</span>
      <span className="font-medium text-ink">
        {busy ? "Reading…" : "Drop your WhatsApp .zip here"}
      </span>
      <span className="text-sm text-ink-soft">or click to choose a file</span>
    </label>
  );
}
