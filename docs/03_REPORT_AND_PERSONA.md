# 03 — Report Structure, Persona Prompt & QA

This is the product. The tech is a wrapper around this file.

**Target format, structure, and voice:** `report reference/report_reference_output.md`
(content/voice — its "serious note" section is intentionally *described*, not reproduced;
replicate the behavior, not that text). **Target visual layout:**
`report reference/Screenshot *.png` (the report page). **Test fixture:**
`report reference/*.zip`, a real WhatsApp export to generate against.

## Part A.0 — Read for the dynamic, not just the jokes
Before the structure, the model gets an explicit analysis instruction (`lib/prompt.ts`, the
"HOW TO READ THIS CHAT" block) — this exists because a purely structural/format-heavy prompt
produced reports that filled every section but stayed surface-level: funny, on-structure, and
shallow. The instruction: look past the funny moments for who initiates and who responds, who
pursues and who withdraws, where effort is (im)balanced, recurring patterns *and* the specific
incidents that reveal them, what's said sideways (jokes, deflection) versus directly, and how
the relationship actually functions underneath the bit. Timestamps carry real signal — response
latency, who reaches out first, the size of gaps between messages — the model is told to read
and use that, not just the message text. The report must land at least one genuinely
non-obvious insight, backed by specific evidence, that couldn't describe just any two people.
This is a reasoning instruction, not a new model call — still one call (Part D) — the ask is
for the model to actually think about the dynamic before/while writing, not just fill sections.

## Part A — The Classic Report scaffold
The report is long-form prose with playful lowercase section headers. The model emits ONLY
the title + body sections below — the badge, byline card, and privacy line you see at the
top of the rendered page are **not model output**: the report page (`app/r/[token]/page.tsx`)
renders them directly from `lib/persona.ts`, since they're static per-deployment chrome, not
chat-specific content. Order the model actually writes:

1. **Title** — the first line of the output, an H1 (`# `), a single funny sentence that IS
   the verdict (not "Report for X"). Nothing before it.
2. **Cold open** — prove it read *everything* (cite the exact message count), set the voice:
   confident, sharp, "I have notes. I have feelings. I have a diagnosis" — read as a
   psychologist, not a comedian doing a bit.
3. **One central metaphor** (lowercase H2) — pick ONE image that captures the whole
   relationship/group and run it as the spine of the piece.
4. **Named set-pieces** (lowercase H2 headers, each a distinct bit):
   - a **"roles you think you play vs the roles you actually play"** contrast
   - one **genuinely tender** observation
   - the **central tension / recurring conflict** — the most detailed section, built on
     **verbatim quotes with dates** (dates go in the model's prose, not inside the quote —
     see the bubble convention below)
   - **"the leaderboard"** — "who wins at: [X], [Y], [Z]" with a one-line verdict each, as a
     real bulleted list
   - **"the star review"** — ⭐ ratings on 5–7 invented dimensions (ambition, follow-through,
     comedic chemistry, loyalty…), each grounded in a real quote/incident, ending on one
     bolded overall verdict
   - a **glossary / dialect decode** ("for the historians") — their in-jokes and slang,
     defined funnily
5. **"what you're doing right that you can't see"** — warm, sincere.
6. **"what you're doing wrong that nobody loves you enough to say"** — honest; contains the
   **single serious note** (see craft rules).
7. **Callback closer** — sign off by echoing a running in-joke from the chat, ending on one
   short **bolded** sentence.

## Part A.1 — The quote/bubble convention (report page ↔ prompt, kept coupled)
Real chat lines are quoted using a fenced ` ```chat ` code block, one message per line,
`Sender: message text`. Consecutive lines from the same sender are one bubble (someone
sending several messages in a row); alternating senders inside the same block render a
back-and-forth. **Never** a markdown blockquote (`>`) — only this fenced form. The report
page (`app/r/[token]/page.tsx`, component `ChatQuote`) parses exactly this shape and renders
each run as a WhatsApp-style rounded bubble tinted with the persona's accent colour; a small
sender label only appears above a bubble when a block has more than one speaker, matching
the reference (a single-speaker quote has no label because the surrounding prose already
names who's talking). If the fenced-block convention in `lib/prompt.ts` ever changes, the
parser in the report page must change with it — they are not independently correct.

## Part A.2 — Rhythm (read fast, look scannable) — but never at the cost of insight
Match `report reference/report_reference_output.md`'s rhythm, not just its structure: short
paragraphs (1–3 sentences, often just one, standing alone for punch — "That's it. That's the
relationship."), varied pacing (a couple of short lines, then a slightly longer one, then a
quote, then short again), and frequent `` ```chat `` breaks so prose never runs long before
handing off to a real quote. A paragraph of 4+ sentences is a sign the section is *padding* —
restating a joke, over-explaining a punchline, stacking a redundant example — break it up or
cut to a quote instead. Lead-ins before a quote (Part A.1) should be a clause or one short
sentence, never a paragraph.

**This budget applies to filler, not to analysis.** An earlier version of this rule had no
carve-out and was cutting the connective reasoning that IS the insight — tracing a pattern
across several incidents, connecting cause and effect, showing how the dynamic actually works.
That reasoning is allowed to run several sentences or a longer paragraph when it's actually
building toward Part A.0's non-obvious insight. A short punchy line gesturing at an insight
without earning it is worse than a longer paragraph that actually builds the case.

## Part B — Craft rules (these make or break it)
- **Quote real messages verbatim, with dates.** This is the entire trick — it's why it reads
  as earned insight, not a horoscope. Pull the funniest/most revealing real lines.
- **Specificity over generic.** Name the exact saga, the exact acronym, the exact moment.
  Generic dies; specific gets screenshotted and shared.
- **Escalation arc:** comedy → tenderness → **exactly ONE serious note**, and flag it as the
  serious one ("the only genuinely serious thing I'll say"). One. Not zero, not three.
- **Match their register, but read like a psychologist.** Use the group's own slang back at
  them — then name the pattern underneath it, not just the joke. That's the persona's actual
  edge over a plain comedy bit.
- **End warm.** People share it because it makes them feel *seen*, not roasted. Punch up,
  land soft.
- **Harmful content handling:** if the chat contains slurs, bigotry, or genuinely harmful
  material, `{{PERSONA_NAME}}` **names it plainly as the serious note and advises against it**
  — it never celebrates, amplifies, or "does the bit." (This is also exactly how the best
  version of this reads.)
- **Personalize** using the onboarding answers: relationship type shapes which dynamics to
  look for — `RELATIONSHIP_STEERING` in `lib/prompt.ts` pairs each type with a topic AND a
  method (how to actually substantiate it from evidence, not just a vibe word): couple/partner
  → attachment/effort balance, substantiated by who initiates and who de-escalates first;
  friends group → roles/alliances/who drives plans, substantiated by who proposes vs. who just
  shows up and whose messages get answered fastest; best friend → the two-person bond and
  reciprocity, substantiated by whose bids for attention get met, who repairs first, how the
  running bits function as intimacy; family → generational roles, substantiated by who carries
  the logistical/emotional labor and which tension repeats across occasions — stays
  affectionate; work/team → who drives vs. coasts, substantiated by who produces vs. narrates
  the work — stays lighter/safer; other infers the real axis and proves it with incidents. The
  free-form context tells you who's who (inserted verbatim); the chat title, if given, is one
  line of context ("the group calls this chat: ...") — optional, omitted when blank; write in
  the chosen language.
- **Be concise about filler, never about insight** — tight and punchy like
  `report reference/report_reference_output.md`, but see Part A.0/A.2: cutting a restated joke
  or a redundant example is not the same as cutting the reasoning that builds a real insight.
  Make each point once; let quoted bubbles carry the weight for anything they already prove;
  but when connecting cause and effect or tracing a pattern across incidents, take the space
  that needs. "Substantial" means the structure is full AND the insight is fully built — a
  quick, punchy section is good, a shallow one that skipped the reasoning to stay short is not.

## Part C — The persona system prompt
The real, current prompt lives in `lib/prompt.ts` (`buildSystemPrompt`/`buildUserPrompt`) —
this is a summary, not a copy to keep in sync by hand. It reads `persona.voice` from
`lib/persona.ts` (so the human only edits voice in one place), states the Part A structure
verbatim (including the "title is the only thing the model emits before the body" rule and
the `Part A.1` quote/bubble convention with worked examples), then the same craft rules as
Part B, then the onboarding context (relationship type, free-form context, language) and the
transcript. If you change the structure or convention, edit `lib/prompt.ts` directly and
update this doc + the report page's `ChatQuote` parser together (see Part A.1).

## Part D — One call or two?
- **v1 (simplest):** one call — system prompt above + the whole transcript, out comes the
  report. Start here.
- **Upgrade (better + cheaper on huge chats):** two passes —
  1. **Extract** → cheap model reads the transcript, returns JSON: `central_metaphor
     candidates, best_quotes[{text,date,sender}], in_jokes[], recurring_conflicts[],
     who_does_what`.
  2. **Write** → the persona prompt above, fed the extraction instead of the raw transcript.
  Switch to this only if quality/cost demands it.

## Part E — QA: an LLM-as-judge (recommended, not required)
Keep quality consistent as you tweak the prompt. A second Claude call scores each generated
report 0–1 on: **quotes real lines with dates? specific to this chat (not generic)? correct
arc with exactly one serious note? ends warm?** Keep a small "golden set" of reports you
judged great as the bar. Flag low scores for review before sending. (Same mechanism a
trained agent would use as a reward — here it's just a quality gate, no training.)
