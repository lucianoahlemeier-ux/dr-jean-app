import { inngest } from "./client";
import { getSupabase, UPLOADS_BUCKET } from "../supabase";
import { parseUpload, renderTranscript } from "../whatsapp";
import {
  generateReport,
  generateChunkAnalysis,
  generateMergedAnalysis,
  generateReducedReport,
  getGenMode,
} from "../generate";
import {
  splitIntoChunks,
  estimateTranscriptTokens,
  estimateTokens,
  CHUNK_BUDGET_TOKENS,
  SINGLE_CALL_MAX_TOKENS,
  MAX_TRANSCRIPT_TOKENS,
  type ChatChunk,
} from "../chunking";
import { sendReportEmail } from "../email";
import type { ChunkAnalysis } from "../prompt";
import type { OnboardingAnswers, ParsedTranscript, RelationshipType } from "../types";

// The slow job (docs/02):
//   fetch the uploaded file → parse to transcript (in memory)
//   → call Anthropic (persona prompt) → save report text (status=done)
//   → DELETE raw file → email the link.
//
// Generation takes minutes, which is exactly why this is NOT in the upload
// request. Vercel Hobby functions die at 10s; Inngest bills CPU-not-wait so a
// long Claude call fits.
//
// LARGE CHATS: the old single "parse-and-generate" step is now parse ->
// routing check (plain JS, using the already-parsed message count/length) ->
// EITHER the existing single "generate" step (unchanged) OR a chunked
// sub-pipeline: split-into-chunks -> a bounded-concurrency fan-out of
// map-chunk-{i} steps -> an optional hierarchical merge -> reduce-report.
// Every step.run() below is independently checkpointed by Inngest, so a
// crash/retry only re-runs the one step that failed, not the whole job —
// this is why the fan-out lives here (in the Inngest handler) rather than
// being orchestrated inside a single call in lib/generate.ts.

/** Runs `worker` over `items` with at most `limit` in flight at once. In
 * claude-code mode this bounds how many `claude` CLI subprocesses run
 * concurrently (each map call spawns one) — unbounded parallelism there
 * would hammer the local machine and the user's Claude usage all at once.
 * api mode can afford to run wider. */
// Inngest replays the whole function body on every step transition (not just
// failures) — any code outside step.run() re-runs each time. Download+parse
// can't be a step.run() itself (a real chat's full message array blows past
// Inngest's per-step output size cap — confirmed via a real "output_too_large"
// failure), so it's cached here per-run instead: a bare non-memoized re-parse
// on every replay was confirmed, via a real run, to hammer Supabase Storage
// with repeated downloads of the same multi-MB file badly enough to trigger
// a transient "object not found".
//
// LIFECYCLE (learned the hard way): this must persist ACROSS the many replays
// of a single run, so it is cleared only when a run reaches a terminal state
// (`finishRun` at the success return and in catch) — NOT in a blanket
// `finally`, which runs on every transition and silently defeated the cache,
// re-downloading every time. A small size cap guards against leaked entries
// from runs that die without hitting either terminal path.
const parseCache = new Map<string, ParsedTranscript>();
const PARSE_CACHE_MAX = 8;

function cacheParsed(reportId: string, parsed: ParsedTranscript): void {
  // Crude bound: locally only one run is active at a time, so if the map has
  // grown it's leaked entries from runs that never terminated cleanly — drop
  // them wholesale rather than track an LRU.
  if (parseCache.size >= PARSE_CACHE_MAX) parseCache.clear();
  parseCache.set(reportId, parsed);
}

function finishRun(reportId: string): void {
  parseCache.delete(reportId);
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function next(): Promise<void> {
    const i = cursor++;
    if (i >= items.length) return;
    results[i] = await worker(items[i], i);
    return next();
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, () => next());
  await Promise.all(workers);
  return results;
}

export const generateReportFn = inngest.createFunction(
  {
    id: "generate-report",
    // A big chat can take a few minutes — chunked runs can take longer still
    // (many map calls + a reduce), which is exactly why each phase is its
    // own step rather than one long function body.
    retries: 1,
  },
  { event: "report/requested" },
  async ({ event, step, attempt, maxAttempts }) => {
    const {
      reportId,
      token,
      storagePath,
      filename,
      email,
      language,
      relationship_type,
      freeform_context,
      platform,
      name_overrides,
      chat_title,
    } = event.data;

    const supabase = getSupabase();
    const runStartedAt = Date.now();
    const logStage = (stage: string, extra?: Record<string, unknown>) => {
      // Safe fields only: reportId + stage name + elapsed ms. Never the
      // transcript, prompt, report text, tokens, or any env var.
      console.log(
        `[report ${reportId}] ${stage} (+${Date.now() - runStartedAt}ms, attempt ${attempt + 1})`,
        extra ?? "",
      );
    };
    logStage("run-start");

    try {
      await step.run("mark-processing", async () => {
        await supabase
          .from("reports")
          .update({ status: "processing" })
          .eq("id", reportId);
      });

      // NOT a step.run() (see parseCache comment above) — cached instead of
      // re-hitting Supabase Storage on every replay.
      let parsed = parseCache.get(reportId);
      if (!parsed) {
        const { data, error } = await supabase.storage
          .from(UPLOADS_BUCKET)
          .download(storagePath);
        if (error || !data) {
          throw new Error(
            `Could not download upload: ${error?.message ?? "not found"}`,
          );
        }
        const bytes = await data.arrayBuffer();
        parsed = await parseUpload(bytes, filename);
        if (parsed.messageCount === 0) {
          throw new Error("No messages parsed from the upload");
        }
        cacheParsed(reportId, parsed);
      }

      const answers: OnboardingAnswers = {
        language,
        relationship_type: relationship_type as RelationshipType,
        freeform_context,
        platform: platform as "whatsapp" | "imessage",
        name_overrides,
        chat_title,
      };

      // Routing check — plain JS, no step needed (cheap, and re-derivable
      // from `parsed` on any retry). Token-based (script-aware): a Persian
      // chat crosses the single-call ceiling at far fewer characters than an
      // English one, and must, or the chunked path never engages when it
      // should (and vice-versa).
      const estimatedTokens = estimateTranscriptTokens(parsed.messages, name_overrides);

      // Spend ceiling (lib/chunking.ts). Checked BEFORE any model call, and
      // written straight to `failed` rather than thrown: this outcome is
      // deterministic, so letting Inngest retry it would just re-derive the
      // same answer while the user waits on the status page.
      if (estimatedTokens > MAX_TRANSCRIPT_TOKENS) {
        logStage("rejected-too-large", { estimatedTokens });
        await supabase
          .from("reports")
          .update({
            status: "failed",
            error:
              "This chat is bigger than I can read in one go. Try exporting " +
              "a shorter stretch of it — a single year, or one busy month.",
          })
          .eq("id", reportId);
        finishRun(reportId);
        return { ok: false, reportId, reason: "too-large" };
      }

      let report: { report: string; messageCount: number };

      logStage("routing-decided", {
        estimatedTokens,
        chunked: estimatedTokens > SINGLE_CALL_MAX_TOKENS,
      });

      if (estimatedTokens <= SINGLE_CALL_MAX_TOKENS) {
        // ── existing single-call path — UNCHANGED ──────────────────────
        report = await step.run("generate", async () => {
          const transcript = renderTranscript(parsed, name_overrides);
          const generated = await generateReport({
            transcript,
            messageCount: parsed.messageCount,
            answers,
          });
          return { report: generated, messageCount: parsed.messageCount };
        });
      } else {
        // ── chunked path ────────────────────────────────────────────────
        // Also NOT a step.run(): for a 450k-message chat this would return
        // tens of MB of chunk transcripts in one step output, hitting the
        // same "output_too_large" failure as the old parse step did.
        // splitIntoChunks is pure/synchronous (no I/O), so recomputing it on
        // replay is free.
        const chunks = splitIntoChunks(parsed.messages, name_overrides, CHUNK_BUDGET_TOKENS);
        logStage("chunked-path", { chunkCount: chunks.length });

        const mode = getGenMode();
        // claude-code spawns a real CLI subprocess per map call — keep that
        // bounded. api mode can run wider since it's just HTTP requests.
        const mapConcurrency = mode === "claude-code" ? 4 : 10;

        let analyses = await mapWithConcurrency<ChatChunk, ChunkAnalysis>(
          chunks,
          mapConcurrency,
          (chunk) =>
            step.run(`map-chunk-${chunk.index}`, () =>
              generateChunkAnalysis(chunk, answers),
            ),
        );

        // Hierarchical-reduce fallback — only if the concatenated analyses
        // would approach the reduce model's context limit. At the chunk
        // budget/threshold above, this shouldn't trip for a 450k-message
        // chat (~60 chunks x ~3k-token analyses is well under the reduce
        // ceiling) but is here as a safety net for anything larger.
        const analysesTokens = estimateTokens(JSON.stringify(analyses));
        if (analysesTokens > SINGLE_CALL_MAX_TOKENS) {
          const GROUP_SIZE = 10;
          const groups: ChunkAnalysis[][] = [];
          for (let i = 0; i < analyses.length; i += GROUP_SIZE) {
            groups.push(analyses.slice(i, i + GROUP_SIZE));
          }
          analyses = await mapWithConcurrency<ChunkAnalysis[], ChunkAnalysis>(
            groups,
            mapConcurrency,
            (group, i) =>
              step.run(`merge-group-${i}`, () => generateMergedAnalysis(group, i)),
          );
        }

        report = await step.run("reduce-report", async () => {
          const generated = await generateReducedReport(
            analyses,
            answers,
            parsed.messageCount,
          );
          return { report: generated, messageCount: parsed.messageCount };
        });
      }

      logStage("generation-complete");

      await step.run("save-report", async () => {
        await supabase
          .from("reports")
          .update({
            status: "done",
            report_markdown: report.report,
            message_count: report.messageCount,
          })
          .eq("id", reportId);
      });

      // Privacy promise: delete the raw upload immediately after generating.
      await step.run("delete-raw-upload", async () => {
        await supabase.storage.from(UPLOADS_BUCKET).remove([storagePath]);
      });

      await step.run("send-email", async () => {
        const base =
          process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
        await sendReportEmail({
          to: email,
          reportUrl: `${base}/r/${token}`,
          chatTitle: chat_title,
        });
      });

      logStage("run-complete");
      finishRun(reportId);
      return { ok: true, reportId };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logStage("run-failed", { error: message });
      // A real chunk-analysis failure was previously written straight to
      // `status: "failed"` even though Inngest (retries: 1) was about to
      // silently retry the WHOLE function from the top — the site showed
      // "That one got away" while Inngest's own dashboard still said
      // "Running", because the retry genuinely was in progress. Only surface
      // failure once this is truly the last attempt Inngest will make; on an
      // earlier attempt, record the error for debugging without flipping the
      // status the site reads, so a transient failure that a retry fixes
      // never gets shown to the user at all.
      // maxAttempts can be undefined in some execution contexts; fall back to
      // this function's own configured `retries: 1` (2 total attempts) —
      // and when genuinely unknown, treat it as final so a real failure is
      // never silently hidden forever.
      const isFinalAttempt = attempt + 1 >= (maxAttempts ?? 2);
      await supabase
        .from("reports")
        .update(
          isFinalAttempt ? { status: "failed", error: message } : { error: message },
        )
        .eq("id", reportId);
      // NOTE: deliberately does NOT delete the raw upload here. This catch
      // runs when a step has thrown, but Inngest may still replay the body
      // (step retries re-invoke it from the top). Deleting the source upload
      // here previously caused the *next* replay's download to fail with
      // "Object not found", masking the true error. The upload is deleted
      // only on the success path (`delete-raw-upload` step); a failed run's
      // upload is swept when the user re-runs (new upload) or by storage
      // lifecycle. Better a lingering file than a corrupted pipeline.
      finishRun(reportId);
      throw err;
    }
  },
);
