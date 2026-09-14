# 07 — Large-chat support (map-reduce) & session status

_Last updated: 2026-07-19. This doc is the "what was done recently?" answer:
it describes the large-chat pipeline, every real bug hit while getting it
working against a real 450k-message chat, and exactly where things stand._

## What this feature is

Chats too big for one model call are handled with map-reduce:

- **Routing** (`lib/inngest/functions.ts`): after parsing, the transcript's
  size is estimated in tokens. At or under `SINGLE_CALL_MAX_TOKENS` (700k),
  the EXISTING single-call path runs completely unchanged. Above it, the
  chunked path engages.
- **Split** (`lib/chunking.ts`): messages are cut into day-boundary-respecting
  chunks of ≤ `CHUNK_BUDGET_TOKENS` (90k estimated tokens), each rendered with
  the same `renderTranscript` the single-call path uses.
- **Map** (`lib/generate.ts` → `generateChunkAnalysis`): each chunk goes to a
  cheap model (`MAP_MODEL`, default `claude-haiku-4-5`) which returns
  structured JSON notes — verbatim quotes, tone arc, incidents, dynamics.
  Fan-out runs 4-at-a-time in claude-code mode (10 in api mode), each chunk
  its own Inngest step (`map-chunk-{i}`), independently retried.
- **Merge (fallback)**: only if the combined analyses would approach the
  reduce model's context limit, groups of 10 are consolidated first.
- **Reduce** (`generateReducedReport`): the main model (`REDUCE_MODEL`,
  default = `ANTHROPIC_MODEL`) writes the final report using the UNCHANGED
  `buildSystemPrompt(answers)` — same persona, structure, and chat-bubble
  quote convention as the single-call path.

Parser, wizard, report rendering (`lib/whatsapp.ts`, `app/get-report/`,
`app/r/[token]/`, `globals.css`) are untouched. Nothing new is written to
Supabase — chunk data lives in memory and step return values only.

## Bugs found & fixed while running the REAL 450k-message chat

Each of these failed a real run and is fixed in its own commit (see git log
from `f61c914` forward):

1. **Inngest step-output cap** — returning the parsed message array (or the
   chunk list) from `step.run()` fails `output_too_large` for real chats.
   Parse and split now run outside steps, with a per-run in-memory cache
   (`parseCache`) so Inngest's replay-per-step-transition doesn't re-download
   the file each time.
2. **Upload deleted on failure masked the real error** — the outer catch
   deleted the raw upload, so Inngest's automatic retry failed with "Object
   not found" instead of the true error. Deletion now happens only on the
   success path.
3. **Spawned CLI inherited the developer's environment** — each `claude`
   subprocess loaded personal MCP servers/hooks/skills (~16k tokens overhead,
   persona overridden, calls hung on MCP auth). Fixed with
   `--strict-mcp-config --setting-sources ""` (NOT `--bare`, which breaks
   keychain auth).
4. **Token estimator was ~2.3× optimistic** — a real chunk the code estimated
   at 123k tokens was actually ~258k (WhatsApp's `[date, time] Name:` line
   scaffold tokenizes ~1.74 chars/token, not prose's ~4). Estimator
   recalibrated against the API's own count (ASCII 0.6 tok/char, non-ASCII
   1.0), budget lowered 120k → 90k.
5. **Map output wasn't always pure JSON** — Haiku sometimes prepends markdown
   before the ```json fence. `extractJsonPayload` now finds the fence (or
   outermost braces) anywhere in the output.
6. **Premature "failed" status** — the site showed failure while Inngest was
   still retrying. Status now flips to `failed` only on the FINAL attempt
   (`attempt`/`maxAttempts` from the handler context).
7. **Quotes weren't reliably verbatim** — Haiku normalizes curly apostrophes
   and joins consecutive messages. `enforceVerbatimQuotes` now matches every
   quote back to the real messages and substitutes the true text/date/time/
   sender; unmatchable quotes are dropped so a paraphrase can never become a
   chat bubble.

## Verification status (as of last session)

- Real chat (450,892 messages) splits into **138 chunks, all projected under
  Haiku's 200k limit** (worst: ~138k, using the measured token ratio).
- Full pipeline (map → merge → reduce → save → delete-upload → email) passes
  end-to-end in real claude-code mode on a small chat, every step first-try.
- The WORST real chunk (4,326 messages) passed through the real map call:
  85.6s, valid JSON, no prompt-too-long.
- Quote enforcement verified against real data (normalization repaired,
  merges split, fabrications dropped).
- **Not yet proven:** a full 138-chunk run end-to-end. Remaining risks are
  subscription rate limits (~138 Haiku calls ≈ 6M tokens) and duration
  (estimate 50–70 min at 4-way concurrency). Both now fail loudly and
  visibly if hit.

## How to run it

```bash
# terminal 1
npm run dev          # app on :3000 (dev sessions used -p 3003)
# terminal 2
npm run inngest      # Inngest dev server on :8288
```

Then upload the chat through the wizard at `/get-report`. Progress:
Inngest dashboard → http://localhost:8288 (run shows map-chunk-N steps
completing). The site's status page polls the DB and shows
processing → done.

## Tuning knobs

- `MAP_MODEL` / `REDUCE_MODEL` in `.env.local` (see `.env.example`).
- `CHUNK_BUDGET_TOKENS` / `SINGLE_CALL_MAX_TOKENS` in `lib/chunking.ts` —
  both carry calibration notes; don't raise them without re-reading the
  comments there. Verify any change with a TRIVIAL payload, never a multi-MB
  test (a stray big test once burned $4.72 and a rate-limit window).
