import Anthropic from "@anthropic-ai/sdk";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  buildSystemPrompt,
  buildUserPrompt,
  buildMapPrompt,
  buildReducePrompt,
  buildMergeAnalysesPrompt,
  type ChunkAnalysis,
} from "./prompt";
import { persona } from "./persona";
import type { ChatChunk } from "./chunking";
import type { ChatMessage, OnboardingAnswers } from "./types";

// One Claude call (optionally two — see docs/03 Part D). v1 is one call: the
// persona system prompt + the whole transcript out comes the report. This runs
// inside the Inngest job, which can take minutes — never in a request handler.
//
// GEN_MODE picks WHERE that call goes (docs: none — this is a dev convenience):
//   claude-code — shell out to the local `claude` CLI (subscription, no API key)
//   api         — the real Anthropic API (production)
//   mock        — canned report, no AI call at all
// Same system/user prompt in every mode — only the transport changes.
//
// LARGE CHATS: chats too big for one call use a map-reduce pipeline instead
// (lib/chunking.ts splits the messages; lib/prompt.ts's buildMapPrompt/
// buildReducePrompt/buildMergeAnalysesPrompt build the per-phase prompts).
// generateReport() below is UNCHANGED and still the entire story for normal
// chats — it's only ever called for the single-call path. The chunked-path
// primitives (generateChunkAnalysis / generateMergedAnalysis /
// generateReducedReport) are separate exported functions, deliberately NOT
// orchestrated from in here: lib/inngest/functions.ts calls them, one per
// step.run(), so Inngest gives each chunk's map call (and the reduce call)
// its own independently-checkpointed, independently-retryable step, instead
// of burying the whole multi-call pipeline inside one step boundary.

const DEFAULT_MODEL = "claude-sonnet-5";
const DEFAULT_MAP_MODEL = "claude-haiku-4-5";
const CLAUDE_CODE_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Single-call / reduce model (the "main" model — same one that's always been
 * used). Swappable via ANTHROPIC_MODEL, same as before.
 */
function reduceModel(): string {
  return process.env.REDUCE_MODEL || process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
}

/**
 * Map-pass model — deliberately a cheaper/faster model by default, since map
 * calls are mechanical extraction, not the voiced writing the report needs.
 * Swappable independently via MAP_MODEL for A/B testing.
 */
function mapModel(): string {
  return process.env.MAP_MODEL || DEFAULT_MAP_MODEL;
}

type GenMode = "claude-code" | "api" | "mock";

/** Exported so lib/inngest/functions.ts can decide map-fan-out concurrency
 * (claude-code mode spawns real CLI subprocesses and must stay bounded;
 * api mode can run wider) without duplicating GEN_MODE parsing/validation. */
export function getGenMode(): GenMode {
  const raw = (process.env.GEN_MODE || "claude-code").trim();
  if (raw === "claude-code" || raw === "api" || raw === "mock") return raw;
  throw new Error(
    `Invalid GEN_MODE "${raw}" — expected "claude-code", "api", or "mock".`,
  );
}

/** Routes a single (system, user, model) call through the configured
 * transport. Shared by the single-call path AND every chunked-path phase
 * (map/merge/reduce) — same transports, just invoked with different prompt
 * content and models. Never called for "mock" — callers branch on GEN_MODE
 * before reaching this. */
async function callModel(
  mode: "claude-code" | "api",
  system: string,
  user: string,
  model: string,
): Promise<string> {
  return mode === "claude-code"
    ? generateViaClaudeCode(system, user, model)
    : generateViaAnthropicApi(system, user, model);
}

export async function generateReport(params: {
  transcript: string;
  messageCount: number;
  answers: OnboardingAnswers;
}): Promise<string> {
  const mode = getGenMode();
  const system = buildSystemPrompt(params.answers);
  const user = buildUserPrompt(params.transcript, params.messageCount);

  if (mode === "mock") {
    return generateMockReport(params);
  }
  return callModel(mode, system, user, reduceModel());
}

// ── api ──────────────────────────────────────────────────────────────────────

async function generateViaAnthropicApi(
  system: string,
  user: string,
  model: string,
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }

  const client = new Anthropic({ apiKey });

  // Stream so the long generation doesn't hit request/HTTP timeouts, then take
  // the accumulated final message.
  const stream = client.messages.stream({
    model,
    max_tokens: 16000,
    system,
    messages: [{ role: "user", content: user }],
  });

  const message = await stream.finalMessage();

  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  if (!text) {
    throw new Error("The model returned an empty report");
  }
  return text;
}

// ── claude-code ──────────────────────────────────────────────────────────────

// Tool names that could touch the filesystem, run shell commands, or spawn
// further agents. The CLI must only generate text here — never edit this repo.
const CLAUDE_CODE_DISALLOWED_TOOLS = [
  "Bash",
  "BashOutput",
  "KillShell",
  "Edit",
  "Write",
  "NotebookEdit",
  "Read",
  "Glob",
  "Grep",
  "WebFetch",
  "WebSearch",
  "Task",
].join(",");

/**
 * Writes the combined system+user prompt to a private temp file and passes
 * it via --system-prompt-file, instead of stdin — this is the fix for large
 * chats hitting the CLI's stdin size cap. Applied unconditionally (every
 * claude-code call, not just large ones) so prompt size can never be a
 * failure mode for this transport, single-call or chunked. The temp file is
 * always removed in `finally`, success or failure — nothing from the prompt
 * (which may contain real chat content) is left on disk.
 */
async function generateViaClaudeCode(
  system: string,
  user: string,
  model: string,
): Promise<string> {
  const combined = `${system}\n\n${user}`;
  const dir = await mkdtemp(path.join(tmpdir(), "dr-jean-prompt-"));
  const promptFile = path.join(dir, "prompt.txt");

  try {
    await writeFile(promptFile, combined, "utf-8");
    const stdout = await runClaudeCodeCli(promptFile, model);
    return parseClaudeCodeOutput(stdout);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

function runClaudeCodeCli(promptFile: string, model: string): Promise<string> {
  const args = [
    "-p",
    "Proceed.",
    "--output-format",
    "json",
    "--model",
    model,
    "--system-prompt-file",
    promptFile,
    "--disallowedTools",
    CLAUDE_CODE_DISALLOWED_TOOLS,
    "--permission-mode",
    "bypassPermissions",
    // ISOLATION — this is a programmatic subprocess, NOT an interactive
    // session. Without these, each spawned `claude` inherits the developer's
    // personal Claude Code environment: MCP servers (one of which needs
    // interactive auth), SessionStart hooks, the "superpowers" skill
    // injection, plugins, CLAUDE.md discovery — ~16k tokens of overhead on
    // every call that also OVERRODE our system prompt (the model replied as a
    // coding assistant instead of following the persona). Worse, booting all
    // that per-call took 13–20s and, under the map fan-out's concurrency,
    // hung/failed outright (a real run left one map step stuck RUNNING while
    // an MCP server waited on auth). These flags make the call lean and
    // hermetic — auth still works (it's not --bare, which skips keychain):
    //   --strict-mcp-config  → load ZERO MCP servers (none passed via
    //                          --mcp-config), instead of the user's configured
    //                          ones.
    //   --setting-sources "" → load no user/project/local settings files, so
    //                          no hooks / superpowers / plugins fire.
    "--strict-mcp-config",
    "--setting-sources",
    "",
  ];

  return new Promise<string>((resolve, reject) => {
    // No stdin needed — the whole prompt is in the file above, and the
    // short positional trigger just tells the CLI to proceed.
    const child = spawn("claude", args, { stdio: ["ignore", "pipe", "pipe"] });

    let out = "";
    let err = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(
        new Error(
          `Claude Code CLI timed out after ${CLAUDE_CODE_TIMEOUT_MS / 1000}s`,
        ),
      );
    }, CLAUDE_CODE_TIMEOUT_MS);

    child.on("error", (spawnErr: NodeJS.ErrnoException) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (spawnErr.code === "ENOENT") {
        reject(
          new Error(
            "Claude Code CLI not found / not logged in — GEN_MODE=claude-code requires the `claude` command on PATH and an active login (run `claude login`).",
          ),
        );
      } else {
        reject(new Error(`Failed to launch Claude Code CLI: ${spawnErr.message}`));
      }
    });

    child.stdout.on("data", (d) => {
      out += d.toString();
    });
    child.stderr.on("data", (d) => {
      err += d.toString();
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        // The CLI writes its error payload to stdout as JSON even when it
        // exits non-zero (rate limits, auth, "prompt too long", etc.), so
        // surface BOTH streams — throwing away stdout here previously hid
        // the real cause behind a bare "(no stderr output)".
        const detail =
          err.trim() || out.trim() || "(no output on stdout or stderr)";
        reject(
          new Error(`Claude Code CLI exited with code ${code}: ${detail}`),
        );
        return;
      }
      resolve(out);
    });
  });
}

function parseClaudeCodeOutput(stdout: string): string {
  let parsed: { is_error?: boolean; result?: unknown; subtype?: string };
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new Error(
      `Claude Code CLI returned non-JSON output: ${stdout.slice(0, 500)}`,
    );
  }

  if (parsed.is_error || typeof parsed.result !== "string") {
    throw new Error(
      `Claude Code CLI reported an error: ${
        (typeof parsed.result === "string" && parsed.result) ||
        parsed.subtype ||
        "unknown error"
      }`,
    );
  }

  const text = parsed.result.trim();
  if (!text) {
    throw new Error("Claude Code CLI returned an empty report");
  }
  return text;
}

// ── mock ─────────────────────────────────────────────────────────────────────

function generateMockReport(params: {
  transcript: string;
  messageCount: number;
  answers: OnboardingAnswers;
}): string {
  const { messageCount, answers } = params;
  const names = Object.values(answers.name_overrides ?? {});
  const [nameA, nameB] = names.length >= 2 ? names : ["Alex", "Sam"];
  const title = answers.chat_title || "this chat";

  return `# the group chat that runs on vibes and unresolved logistics

*prepared by ${persona.name}, who has too many opinions and ${persona.absurdDetail}.*

*the conversation used to write this wasn't saved.*

I read all ${messageCount} messages of "${title}". Every single one. I have notes. I have feelings. I have a diagnosis.

## the central metaphor

This chat runs like a group project where everyone did the reading but nobody agreed on what the assignment was.

## roles you think you play vs roles you actually play

${nameA} thinks they're the organizer. ${nameA} is actually the one who starts the plan and disappears for 45 minutes. ${nameB} thinks they're neutral. ${nameB} is the one everyone waits on for the final yes.

## the tension nobody names out loud

This is the longest section in a real report — built on verbatim quotes, with dates, tracing the one recurring disagreement that never actually gets resolved, just quietly re-started.

## the leaderboard

- fastest to reply: ${nameA}
- most likely to leave you on read for 3 days then act normal: ${nameB}
- best comedic timing: it's close, but it's ${nameA}

## the star review

⭐⭐⭐⭐⭐ **ambition** — big plans, rarely a follow-up in writing.
⭐⭐⭐ **follow-through** — see above.
⭐⭐⭐⭐ **comedic chemistry** — genuinely, consistently funny.
**Overall: 4/5** — would read again.

## the glossary (for the historians)

Every good chat has its own dialect. This one's is no exception — the in-jokes are doing more work than the actual sentences.

## what you're doing right that you can't see

You keep showing up for each other in the unglamorous, unposted way — the check-ins nobody screenshots.

## what you're doing wrong that nobody loves you enough to say

*the only genuinely serious thing I'll say:* the same disagreement keeps resurfacing because nobody's actually said the quiet part — say it once, properly, and it stops being a bit.

## sign-off

Same time next week? You know you'll be back.

---

*This is a mock report generated by GEN_MODE=mock — no AI call was made. Language requested: ${answers.language}.*`;
}

/**
 * Chunked-path entry point for mock mode: no real analysis, no real model
 * call — returns a minimal, valid-shape ChunkAnalysis so the mock-mode test
 * run can exercise the FULL Inngest step wiring (split -> map fan-out ->
 * reduce -> save -> delete) with zero cost. Never calls a transport.
 */
function generateMockChunkAnalysis(chunk: ChatChunk): ChunkAnalysis {
  const first = chunk.messages[0];
  return {
    chunkIndex: chunk.index,
    dateRange: chunk.dateRange,
    toneArc: { start: "mock-start", end: "mock-end" },
    notableQuotes: first
      ? [{ date: first.date, time: first.time, sender: first.sender, text: first.text }]
      : [],
    incidents: [],
    observedDynamics: [`mock dynamic for chunk ${chunk.index}`],
    runningBits: [],
    perPersonBehavior: {},
    tensionOrRepairMoments: [],
    candidateMetaphors: [],
  };
}

// ── chunked path: map / merge / reduce ────────────────────────────────────────
//
// Each of these is a single model call (or, for mock, a synchronous
// no-call stand-in) — deliberately NOT chained together in here. Called one
// at a time, from lib/inngest/functions.ts, each inside its own step.run()
// so a crash/retry only re-runs the one failed chunk/phase, not the whole
// pipeline (see that file for the fan-out + concurrency bound).

/** One chunk -> one ChunkAnalysis. Runs on the (cheaper) map model. */
export async function generateChunkAnalysis(
  chunk: ChatChunk,
  answers: OnboardingAnswers,
): Promise<ChunkAnalysis> {
  const mode = getGenMode();
  if (mode === "mock") return generateMockChunkAnalysis(chunk);

  const { system, user } = buildMapPrompt(chunk, answers);
  const raw = await callModel(mode, system, user, mapModel());
  const analysis = parseChunkAnalysisJson(raw, chunk.index);
  return enforceVerbatimQuotes(analysis, chunk.messages);
}

/**
 * Guarantee the character-for-character quote invariant IN CODE rather than
 * trusting the model. A real run showed Haiku quoting near-verbatim but
 * silently normalizing characters (curly apostrophe ’ -> ascii ') and joining
 * two consecutive messages with "\n" — only 1 of 8 quotes survived an exact
 * match against the source. Every quote here is matched back to the real
 * messages (exact -> punctuation-normalized -> per-line for joined messages)
 * and its text/date/time/sender REPLACED with the true source values, so what
 * reaches the report's chat bubbles is provably real. A quote that can't be
 * matched to any real message is dropped — a paraphrase must never become a
 * bubble.
 *
 * Exported for direct testing (pure function, no I/O).
 */
export function enforceVerbatimQuotes(
  analysis: ChunkAnalysis,
  messages: ChatMessage[],
): ChunkAnalysis {
  const normalize = (s: string) =>
    s
      .replace(/[‘’ʼ]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/…/g, "...")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();

  const byNormText = new Map<string, ChatMessage>();
  for (const m of messages) {
    if (m.system || !m.text.trim()) continue;
    const key = normalize(m.text);
    if (!byNormText.has(key)) byNormText.set(key, m);
  }

  const matchOne = (text: string): ChatMessage | undefined =>
    byNormText.get(normalize(text));

  const fixed: ChunkAnalysis["notableQuotes"] = [];
  const seen = new Set<string>();
  const push = (m: ChatMessage) => {
    const key = `${m.date}|${m.time}|${m.sender}|${m.text}`;
    if (seen.has(key)) return;
    seen.add(key);
    fixed.push({ date: m.date, time: m.time, sender: m.sender, text: m.text });
  };

  for (const q of analysis.notableQuotes) {
    if (!q || typeof q.text !== "string" || !q.text.trim()) continue;
    const whole = matchOne(q.text);
    if (whole) {
      push(whole);
      continue;
    }
    // The model sometimes joins consecutive messages with newlines — recover
    // each line as its own real message where possible.
    const lines = q.text.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length > 1) {
      const lineMatches = lines.map(matchOne);
      if (lineMatches.every((m) => m !== undefined)) {
        for (const m of lineMatches) push(m as ChatMessage);
        continue;
      }
    }
    // Unmatchable -> dropped: better a missing quote than a fabricated one.
  }

  return { ...analysis, notableQuotes: fixed };
}

/** Combines a GROUP of analyses into one of the same shape — the
 * hierarchical-reduce fallback, only used if lib/inngest/functions.ts's
 * context-size check trips. Runs on the map model too (mechanical
 * consolidation, not voiced writing — no reason to pay for the main model
 * here). */
export async function generateMergedAnalysis(
  analyses: ChunkAnalysis[],
  mergedIndex: number,
): Promise<ChunkAnalysis> {
  const mode = getGenMode();
  if (mode === "mock") {
    return {
      ...generateMockChunkAnalysis({
        index: mergedIndex,
        messages: [],
        transcript: "",
        messageCount: 0,
        dateRange: {
          start: analyses[0]?.dateRange.start ?? "",
          end: analyses[analyses.length - 1]?.dateRange.end ?? "",
        },
      }),
      chunkIndex: mergedIndex,
    };
  }

  const { system, user } = buildMergeAnalysesPrompt(analyses);
  const raw = await callModel(mode, system, user, mapModel());
  return parseChunkAnalysisJson(raw, mergedIndex);
}

/** All (possibly merged) analyses -> the final report, using the SAME
 * buildSystemPrompt(answers) as the single-call path — same persona,
 * structure, rules, quote convention; only the user message differs. Runs
 * on the main/reduce model. */
export async function generateReducedReport(
  analyses: ChunkAnalysis[],
  answers: OnboardingAnswers,
  messageCount: number,
): Promise<string> {
  const mode = getGenMode();
  if (mode === "mock") {
    return generateMockReport({ transcript: "", messageCount, answers });
  }

  const system = buildSystemPrompt(answers);
  const user = buildReducePrompt(analyses, messageCount);
  return callModel(mode, system, user, reduceModel());
}

/**
 * Best-effort extraction of a JSON object from model output that may not be
 * pure JSON — despite the map prompt instructing "ONLY JSON", a real Haiku
 * response opened with a markdown analysis ("## Analysis: ...") and a "---"
 * before the actual ```json fence, which an anchored `^```` strip missed
 * entirely (it only handled a fence at the very start/end of the string).
 * Tries, in order: the whole trimmed string; a ```json fence found ANYWHERE
 * in the text; the substring between the first `{` and the last `}`.
 */
function extractJsonPayload(raw: string): string {
  const trimmed = raw.trim();

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();

  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first !== -1 && last > first) return trimmed.slice(first, last + 1);

  return trimmed;
}

function parseChunkAnalysisJson(raw: string, chunkIndex: number): ChunkAnalysis {
  const cleaned = extractJsonPayload(raw);

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(
      `Chunk ${chunkIndex} analysis was not valid JSON: ${
        err instanceof Error ? err.message : String(err)
      }. Raw output started with: ${raw.trim().slice(0, 300)}`,
    );
  }

  const obj = parsed as Partial<ChunkAnalysis>;
  return {
    chunkIndex,
    dateRange: obj.dateRange ?? { start: "", end: "" },
    toneArc: obj.toneArc ?? { start: "", end: "" },
    notableQuotes: Array.isArray(obj.notableQuotes) ? obj.notableQuotes : [],
    incidents: Array.isArray(obj.incidents) ? obj.incidents : [],
    observedDynamics: Array.isArray(obj.observedDynamics) ? obj.observedDynamics : [],
    runningBits: Array.isArray(obj.runningBits) ? obj.runningBits : [],
    perPersonBehavior:
      obj.perPersonBehavior && typeof obj.perPersonBehavior === "object"
        ? obj.perPersonBehavior
        : {},
    tensionOrRepairMoments: Array.isArray(obj.tensionOrRepairMoments)
      ? obj.tensionOrRepairMoments
      : [],
    candidateMetaphors: Array.isArray(obj.candidateMetaphors) ? obj.candidateMetaphors : [],
  };
}
