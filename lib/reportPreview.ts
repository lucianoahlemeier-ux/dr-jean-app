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

// ─── the free teaser ─────────────────────────────────────────────────────────
// An unpaid visitor gets exactly ONE section of prose: "the roles you THINK
// you play vs the roles you ACTUALLY play" (lib/prompt.ts step 4). It's the
// sharpest hook in the report — a real contrast grounded in specific
// incidents — so it's the one that earns the click.

/** Matches the roles heading across the languages the app ships in (EN
 * "roles", ES/FR "roles"/"rôles", DE/NL "Rollen"/"rollen"). Non-matching
 * languages fall through to the positional lookup below, which is correct
 * by spec regardless of language. */
const ROLES_HEADING = /^##[^\n]*\brôl|^##[^\n]*\brol/i;

/**
 * Returns the section to show as the free teaser, or null if the report has
 * no sections at all. Heading match first (survives the model reordering
 * sections), positional second (survives any language): lib/prompt.ts
 * mandates cold open → central metaphor → roles, so roles is the third
 * chunk when a cold open exists and the second when it doesn't.
 */
export function pickTeaserSection(sections: string[]): string | null {
  if (sections.length === 0) return null;

  const byHeading = sections.find((section) => ROLES_HEADING.test(section));
  if (byHeading) return byHeading;

  const hasColdOpen = !sections[0].startsWith("##");
  return sections[hasColdOpen ? 2 : 1] ?? sections[0];
}

/**
 * Trims the teaser to a bounded slice before it's ever sent to the browser.
 * The card only reveals a few hundred pixels of it, but without this the
 * whole section would sit in the page source for anyone who opened
 * devtools — and if the model ever emits a report with no H2 headings at
 * all, "one section" IS the entire report. Cuts on a paragraph boundary,
 * and never mid-```chat fence (an unclosed fence would swallow the rest of
 * the markdown into a code block).
 */
export function clampTeaser(section: string, maxChars = 1600): string {
  if (section.length <= maxChars) return section;

  let cut = section.slice(0, maxChars);

  // Back off to the last paragraph break, then any line break, so the
  // visible text never ends mid-sentence in the blurred zone.
  const lastBreak = Math.max(cut.lastIndexOf("\n\n"), cut.lastIndexOf("\n"));
  if (lastBreak > maxChars * 0.5) cut = cut.slice(0, lastBreak);

  // An odd number of fences means we cut inside a ```chat block — drop back
  // to before it opened.
  const fences = cut.match(/```/g)?.length ?? 0;
  if (fences % 2 !== 0) cut = cut.slice(0, cut.lastIndexOf("```"));

  return cut.trimEnd();
}
