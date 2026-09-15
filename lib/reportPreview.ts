// The free, pre-paywall teaser. Per the product decision, unpaid visitors see
// ONLY headline stats — no written analysis — so we pull just the star
// ratings (and the closing bolded verdict) out of the "star review" section
// the persona prompt always produces (lib/prompt.ts, step 8), stripped of
// their one-line justifications. Everything else in the report body stays
// blurred behind the paywall (see components/ReportBody.tsx).

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

// Splits the report body into its top-level sections — the cold open
// (everything before the first "## " heading) as one section, then each H2
// heading through to the next one. lib/prompt.ts (steps 2-12) mandates this
// exact H2 structure, so this is a reliable seam to cut on. The report page
// renders each section as its own card (components/ReportBody.tsx) instead
// of one long scroll — for a paid report they're all shown; for a free one,
// the later cards get progressively blurred instead of the whole body
// vanishing behind one flat blur block.
const SECTION_HEADING = /^##\s+.*$/gm;

export function splitReportSections(body: string): string[] {
  const headingStarts: number[] = [];
  let match: RegExpExecArray | null;
  SECTION_HEADING.lastIndex = 0;
  while ((match = SECTION_HEADING.exec(body))) {
    headingStarts.push(match.index);
  }

  if (headingStarts.length === 0) {
    const trimmed = body.trim();
    return trimmed ? [trimmed] : [];
  }

  const sections: string[] = [];
  const coldOpen = body.slice(0, headingStarts[0]).trim();
  if (coldOpen) sections.push(coldOpen);

  for (let i = 0; i < headingStarts.length; i++) {
    const start = headingStarts[i];
    const end = i + 1 < headingStarts.length ? headingStarts[i + 1] : body.length;
    const section = body.slice(start, end).trim();
    if (section) sections.push(section);
  }

  return sections;
}
