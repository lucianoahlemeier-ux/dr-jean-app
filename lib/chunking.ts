import type { ChatMessage, ParsedTranscript } from "./types";
import { renderTranscript } from "./whatsapp";

// ─────────────────────────────────────────────────────────────────────────────
// Large-chat map-reduce support (docs: none yet — see lib/generate.ts for the
// routing/orchestration this feeds). Pure functions only — no I/O, no model
// calls. Operates on the already-parsed `ChatMessage[]`, NOT the rendered
// string, and leaves lib/whatsapp.ts untouched: each chunk's transcript is
// produced by calling the EXISTING renderTranscript on a sliced-down
// ParsedTranscript, exactly the same function the single-call path uses.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Token estimation constants, CALIBRATED against a real failure ──────────
// A real 450k-message English WhatsApp chat failed with the API reporting the
// map prompt at ~257,926 tokens (limit 200,000) for a chunk this code
// estimated at ~123k. Measured against that ground truth, the actual rendered
// transcript tokenizes at ~0.574 tokens/char (1.74 chars/token) — NOT the
// prose-English ~0.25 (4 chars/token) originally assumed. The reason: every
// line carries a dense `[dd.mm.yy, hh:mm:ss] Name: ` scaffold (digits,
// punctuation, and emoji names) that tokenizes far worse than prose.
//
// ASCII_TOK_PER_CHAR is set slightly ABOVE the measured 0.553 so the estimate
// is conservative (over- rather than under-counts), because under-counting is
// exactly what caused the failure. NON_ASCII stays at 1 tok/char (emoji, CJK,
// Arabic/Persian all tokenize around or above that).
const ASCII_TOK_PER_CHAR = 0.6;
const NON_ASCII_TOK_PER_CHAR = 1.0;

/**
 * Per-chunk TOKEN budget for the MAP pass. Sized to the map model's context
 * ceiling (Haiku ~200,000 tokens via this CLI, verified) MINUS real overhead:
 * the request also carries the CLI's own base system prompt + tool
 * definitions (~8.4k tokens even with the isolation flags in lib/generate.ts)
 * plus the "Proceed." turn. 90,000 keeps even a force-cut chunk (1.5x budget =
 * 135k) plus ~10k overhead comfortably under 200k, with headroom for
 * estimator error. Lowered from 120k after the calibration above showed the
 * old estimate was ~2.3x optimistic.
 *
 * GUARDRAIL: verify any change to this constant with a TRIVIAL payload
 * against the real CLI, never a multi-MB one — a stray large test already
 * burned real cost/rate-limit once during this feature's development.
 */
export const CHUNK_BUDGET_TOKENS = 90_000;

/**
 * Routing threshold (TOKENS): chats at or under this estimated size use
 * today's single-call path (main model, e.g. Sonnet), completely unchanged —
 * zero added latency/cost for normal chats. Above it, the chunked path kicks
 * in. Deliberately larger than CHUNK_BUDGET_TOKENS: the single-call path runs
 * on the MAIN model, confirmed via the same CLI testing to accept a request
 * reporting `contextWindow: 1000000` (vs. Haiku's 200k) — so most real chats
 * never need chunking machinery at all. 700,000 tokens is 70% of that 1M,
 * leaving headroom for CLI overhead, the model's own output, and estimator
 * error. Also reused as the "is it safe to reduce in one call" threshold for
 * the hierarchical-merge fallback (lib/generate.ts).
 */
export const SINGLE_CALL_MAX_TOKENS = 700_000;

/**
 * Spend ceiling (TOKENS): the largest transcript we're willing to pay to
 * read. Unlike the byte cap on the upload route, this tracks actual cost —
 * a zipped text export compresses ~10x, so file size says almost nothing
 * about the bill, while estimated tokens is close to proportional to it.
 *
 * Above this the job fails fast with a message the user can act on, instead
 * of quietly fanning out into dozens of chunk calls against a report that
 * sells for a fixed price. Reports are generated BEFORE the paywall, so an
 * enormous chat is spend with no guaranteed revenue behind it.
 *
 * The default is deliberately generous — it comfortably covers years of an
 * active group chat — but it is a business number, not a technical one:
 * measure what a report at this size actually costs you against what you
 * charge, and set MAX_TRANSCRIPT_TOKENS from that.
 */
export const MAX_TRANSCRIPT_TOKENS = Number(
  process.env.MAX_TRANSCRIPT_TOKENS ?? 2_000_000,
);

/**
 * Rough token estimate for a string, without pulling in a real tokenizer.
 * Calibrated against a real WhatsApp export (see constants above): ASCII chars
 * ~0.6 tok/char, non-ASCII (emoji, Persian/Arabic/CJK) ~1 tok/char. Both are
 * deliberately conservative — over-estimating just yields smaller, safer
 * chunks; under-estimating is what caused real "prompt too long" failures.
 */
export function estimateTokens(text: string): number {
  let ascii = 0;
  let dense = 0;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) < 128) ascii++;
    else dense++;
  }
  return ascii * ASCII_TOK_PER_CHAR + dense * NON_ASCII_TOK_PER_CHAR;
}

export interface ChatChunk {
  index: number;
  messages: ChatMessage[];
  transcript: string;
  messageCount: number;
  dateRange: { start: string; end: string };
}

/**
 * Estimated tokens for one rendered line (`[date time] name: text\n`). The
 * structural scaffolding (brackets, date, time, spacing) is ASCII; the name
 * and text carry whatever script the chat is in, so they go through the
 * script-aware estimateTokens.
 */
function estimateLineTokens(m: ChatMessage, name: string): number {
  const structuralAsciiChars = m.date.length + 1 + m.time.length + 3 + 2 + 1;
  return (
    structuralAsciiChars * ASCII_TOK_PER_CHAR +
    estimateTokens(name) +
    estimateTokens(m.text)
  );
}

/**
 * Estimate the full rendered-transcript size in TOKENS without building the
 * string — used by lib/generate.ts's routing check so a huge chat doesn't pay
 * the cost of rendering a multi-megabyte string just to decide whether to
 * render it. Script-aware (see estimateTokens): the same char count is many
 * more tokens in Persian/CJK than in English.
 */
export function estimateTranscriptTokens(
  messages: ChatMessage[],
  nameOverrides?: Record<string, string>,
): number {
  let total = 0;
  for (const m of messages) {
    if (m.system) continue;
    total += estimateLineTokens(m, nameOverrides?.[m.sender] ?? m.sender);
  }
  return total;
}

/**
 * Split real (non-system) messages into day-boundary-respecting chunks, each
 * up to `maxChunkTokens` estimated tokens. Prefers cutting where the next
 * message starts a new calendar day (each ChatMessage already carries its own
 * `date`, so no parser change is needed); if a single day's volume alone
 * blows well past budget, force-cuts anyway rather than letting a chunk grow
 * unbounded (critical for dense scripts, where one busy day can exceed the
 * map model's whole context window).
 */
export function splitIntoChunks(
  messages: ChatMessage[],
  nameOverrides?: Record<string, string>,
  maxChunkTokens: number = CHUNK_BUDGET_TOKENS,
): ChatChunk[] {
  const real = messages.filter((m) => !m.system);
  if (real.length === 0) return [];

  const chunks: ChatChunk[] = [];
  let start = 0;
  let runningTokens = 0;

  for (let i = 0; i < real.length; i++) {
    const m = real[i];
    const name = nameOverrides?.[m.sender] ?? m.sender;
    runningTokens += estimateLineTokens(m, name);

    const isLast = i === real.length - 1;
    const nextIsNewDay = !isLast && real[i + 1].date !== m.date;
    const overBudget = runningTokens >= maxChunkTokens;
    // Rare fallback: never let a chunk grow past 1.5x budget even mid-day.
    const forceCut = runningTokens >= maxChunkTokens * 1.5;

    if (isLast || (overBudget && nextIsNewDay) || forceCut) {
      chunks.push(buildChunk(chunks.length, real.slice(start, i + 1), nameOverrides));
      start = i + 1;
      runningTokens = 0;
    }
  }

  return chunks;
}

function buildChunk(
  index: number,
  slice: ChatMessage[],
  nameOverrides?: Record<string, string>,
): ChatChunk {
  const parsed: ParsedTranscript = {
    messages: slice,
    messageCount: slice.length,
    participants: [],
  };
  return {
    index,
    messages: slice,
    transcript: renderTranscript(parsed, nameOverrides),
    messageCount: slice.length,
    dateRange: { start: slice[0].date, end: slice[slice.length - 1].date },
  };
}
