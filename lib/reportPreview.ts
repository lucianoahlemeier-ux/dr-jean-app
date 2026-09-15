// The free, pre-paywall teaser. Per the product decision, unpaid visitors see
// ONLY headline stats — no written analysis — so we pull just the star
// ratings (and the closing bolded verdict) out of the "star review" section
// the persona prompt always produces (lib/prompt.ts, step 8), stripped of
// their one-line justifications. Everything else in the report body stays
// blurred behind the paywall (see components/PaywallGate.tsx).

export interface HeadlineStat {
  /** e.g. "⭐⭐⭐⭐" */
  stars: string;
  /** e.g. "Follow-through" */
  label: string;
}

export interface HeadlineStats {
  stats: HeadlineStat[];
  verdict: string | null;
}

const STAR_REVIEW_HEADING = /^##\s+.*star review.*$/im;
const NEXT_HEADING = /^##\s+/m;
const STAR_BULLET = /^-\s*(⭐+)\s*\*\*([^*]+)\*\*/;
const BOLD_ONLY_LINE = /^\*\*(.+)\*\*$/;

/**
 * Returns null if the model didn't produce a recognizable "star review"
 * section (e.g. it's a chat in a language/format that skipped the exact
 * heading) — callers should fall back to hiding the stats card rather than
 * showing nothing at all.
 */
export function extractHeadlineStats(body: string): HeadlineStats | null {
  const headingMatch = body.match(STAR_REVIEW_HEADING);
  if (!headingMatch || headingMatch.index === undefined) return null;

  const afterHeading = body.slice(headingMatch.index + headingMatch[0].length);
  const nextHeadingIdx = afterHeading.search(NEXT_HEADING);
  const sectionBody =
    nextHeadingIdx === -1 ? afterHeading : afterHeading.slice(0, nextHeadingIdx);

  const stats: HeadlineStat[] = [];
  let verdict: string | null = null;

  for (const rawLine of sectionBody.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    const starMatch = line.match(STAR_BULLET);
    if (starMatch) {
      stats.push({
        stars: starMatch[1],
        label: starMatch[2].trim().replace(/:$/, ""),
      });
      continue;
    }

    if (!verdict) {
      const boldMatch = line.match(BOLD_ONLY_LINE);
      if (boldMatch) verdict = boldMatch[1].trim();
    }
  }

  if (stats.length === 0) return null;
  return { stats, verdict };
}
