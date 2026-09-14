import JSZip from "jszip";
import type {
  ChatMessage,
  ParsedTranscript,
  ParticipantStat,
} from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// WhatsApp export parser (docs/04).
//
// The user uploads a `.zip` (WhatsApp → Export chat → Without Media) that
// contains a single `_chat.txt`, or a raw `.txt`. We parse defensively:
//  - each new message starts with a timestamp token; lines without one are
//    continuations of the previous message.
//  - support both `[dd/mm/yyyy, hh:mm:ss] Sender: text` and
//    `dd/mm/yyyy, hh:mm - Sender: text` styles; try both, pick whichever
//    matches the most lines.
//  - strip / tag system lines and media placeholders — including system
//    events that WhatsApp renders in the SAME "sender: text" shape as a real
//    message (e.g. the encryption notice, "created this group", name/phone
//    changes — commonly attributed to the group's current name, or to the
//    affected member, as "sender"). See `isSystemLine` below.
//
// IMPORTANT: this runs in-memory. The caller must discard the raw upload after
// generating (privacy promise — see docs/02).
// ─────────────────────────────────────────────────────────────────────────────

// Style A — bracketed: [2026-03-28, 21:14:03] Amir: hello   (also [28/03/2026, 9:14:03 PM])
const BRACKET_RE =
  /^\[(\d{1,4}[./-]\d{1,2}[./-]\d{1,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s?[APap][Mm])?)\]\s?([^:]+?):\s?([\s\S]*)$/;

// Style A without a sender (system line inside brackets): [date, time] X created group
const BRACKET_SYSTEM_RE =
  /^\[(\d{1,4}[./-]\d{1,2}[./-]\d{1,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s?[APap][Mm])?)\]\s?([\s\S]*)$/;

// Style B — dash: 28/03/2026, 21:14 - Amir: hello
const DASH_RE =
  /^(\d{1,4}[./-]\d{1,2}[./-]\d{1,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s?[APap][Mm])?)\s+-\s+([^:]+?):\s?([\s\S]*)$/;

// Style B without a sender (system line): 28/03/2026, 21:14 - Messages are end-to-end encrypted
const DASH_SYSTEM_RE =
  /^(\d{1,4}[./-]\d{1,2}[./-]\d{1,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s?[APap][Mm])?)\s+-\s+([\s\S]*)$/;

// Media placeholders → keep as a lightweight marker so the persona can
// reference *that* a voice note / image happened without the content.
const MEDIA_PATTERNS: Array<[RegExp, string]> = [
  [/<Media omitted>/i, "[media]"],
  [/image omitted/i, "[image]"],
  [/photo omitted/i, "[image]"],
  [/video omitted/i, "[video]"],
  [/audio omitted/i, "[voice note]"],
  [/voice call/i, "[voice call]"],
  [/sticker omitted/i, "[sticker]"],
  [/GIF omitted/i, "[gif]"],
  [/document omitted/i, "[document]"],
  [/<attached:[^>]*>/i, "[attachment]"],
  [/This message was deleted/i, "[deleted]"],
  [/You deleted this message/i, "[deleted]"],
];

// Text patterns for WhatsApp system events. Checked against a line's TEXT
// regardless of which "sender: text" shape captured it — WhatsApp commonly
// renders system events in that exact shape (e.g. attributing them to the
// group's current name, or to the affected member), not as sender-less lines.
const SYSTEM_LINE_PATTERNS: RegExp[] = [
  /messages and calls are end-to-end encrypted/i,
  /created (this )?group/i,
  /\badded\b/i,
  /\bremoved\b/i,
  // "<Name> left" / "You left" — anchored to the whole text and requiring
  // name-cased tokens, so a real message that merely ends with the word
  // "left" (e.g. "sorry, I already left") isn't misread as a departure.
  /^~?[\s ]*\p{Lu}[\p{L}'’.-]*(?:[\s ]+\p{Lu}[\p{L}'’.-]*){0,4}\s+left$/u,
  /changed the group name to/i,
  /changed the subject/i,
  /changed this group'?s icon/i,
  /changed the group description/i,
  /changed their phone number/i,
  /changed to admin/i,
  /you'?re now an admin/i,
  /joined using this group'?s invite link/i,
  /security code changed/i,
  /pinned a message/i,
];

interface RawParsed {
  messages: ChatMessage[];
  matchedLines: number;
}

function looksLikeSystem(text: string): boolean {
  return SYSTEM_LINE_PATTERNS.some((re) => re.test(text));
}

/**
 * Normalize a raw sender string: strip a leading "~" (WhatsApp's
 * not-in-contacts marker) and any whitespace after it — including the narrow
 * no-break space (U+202F) WhatsApp uses there instead of a plain space, which
 * `.trim()` alone misses since it sits mid-string, not at the edges — then
 * collapse any other internal whitespace runs and trim the ends. Without
 * this, the same person shows up as two different "participants" depending
 * on whether they were saved in the address book yet when a given message
 * arrived (docs/04).
 */
function normalizeSender(raw: string): string {
  return raw
    .replace(/^~\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Text patterns that specifically indicate GROUP structure (as opposed to a
// 1:1 DM) — used only to decide whether a chat is "genuinely a group" before
// ever excluding a title-matching sender (see `applyChatTitleExclusion`).
// These are deliberately STRICTER than SYSTEM_LINE_PATTERNS' bare
// `/\badded\b/i` / `/\bremoved\b/i` — those false-positive constantly on
// ordinary conversation ("they just added the new booking flow"), which would
// otherwise register as false "group evidence". A genuine WhatsApp
// added/removed system line is short and ends right after "you" or a
// capitalized name — e.g. "Marco added you", "~ Paul Bianchi added
// Elio" — so anchor to the end of the text and require that shape.
const GROUP_EVIDENCE_PATTERNS: RegExp[] = [
  /created (this )?group/i,
  // No "i" flag: it would make \p{Lu} case-insensitive too, matching any
  // letter and defeating the point of requiring a capitalized name. "you" is
  // handled case-insensitively explicitly instead.
  /\b(?:added|removed)\s+(?:[Yy]ou|\p{Lu}[\p{L}'’.-]*(?:\s+\p{Lu}[\p{L}'’.-]*){0,4})\.?$/u,
  /changed the group name to/i,
  /changed the subject to/i,
];

function normalizeMedia(text: string): { text: string; media: boolean } {
  for (const [re, marker] of MEDIA_PATTERNS) {
    if (re.test(text)) {
      // Replace just the placeholder token, keep any surrounding caption text.
      const replaced = text.replace(re, marker).trim();
      return { text: replaced.length ? replaced : marker, media: true };
    }
  }
  return { text, media: false };
}

function parseWithStyle(
  lines: string[],
  msgRe: RegExp,
  systemRe: RegExp,
): RawParsed {
  const messages: ChatMessage[] = [];
  let matchedLines = 0;
  let current: ChatMessage | null = null;

  for (const rawLine of lines) {
    // Strip invisible LRM/RLM and BOM markers WhatsApp sometimes injects.
    const line = rawLine.replace(/[‎‏﻿]/g, "");
    if (line.trim() === "" && !current) continue;

    const withSender = line.match(msgRe);
    if (withSender) {
      matchedLines++;
      if (current) messages.push(current);
      const [, date, time, rawSender, text] = withSender;
      const sender = normalizeSender(rawSender);
      const { text: cleanText, media } = normalizeMedia(text ?? "");
      // Title-based exclusion (docs/04) is deliberately NOT applied here —
      // it needs to know, across the WHOLE chat, whether this is a genuine
      // group and whether the title-matching sender ever sends real
      // messages. See `applyChatTitleExclusion`, run once after parsing.
      const system = looksLikeSystem(text ?? "");
      current = {
        date: date.trim(),
        time: time.trim(),
        sender,
        text: cleanText,
        system: system ? true : media ? false : undefined,
      };
      continue;
    }

    const systemMatch = line.match(systemRe);
    if (systemMatch && looksLikeSystem(systemMatch[3] ?? "")) {
      matchedLines++;
      if (current) messages.push(current);
      const [, date, time, text] = systemMatch;
      current = {
        date: date.trim(),
        time: time.trim(),
        sender: "system",
        text: (text ?? "").trim(),
        system: true,
      };
      continue;
    }

    // Continuation of the previous message (multiline).
    if (current) {
      current.text += "\n" + line;
    }
  }
  if (current) messages.push(current);
  return { messages, matchedLines };
}

/**
 * Decide, for the WHOLE chat, whether a title-matching sender's messages
 * should be excluded — and mutate their `system` flag in place. Two
 * independent ways a name earns the exclusion (docs/04):
 *
 *  (a) It produces ZERO real (non-system-by-content) messages anywhere in
 *      the chat — i.e. it's exclusively a vessel for system noise (like the
 *      "Flat 4B chaos" case, where the group's own name is used as
 *      "sender" for the encryption notice / added / removed lines). Applied
 *      unconditionally, DM or group — a sender with no real messages isn't a
 *      participant either way, so excluding it loses no real content.
 *
 *  (b) It's the filename/text-derived title, AND the chat is *genuinely a
 *      group* — evidenced by an actual group-structural system line
 *      (created/added/removed/renamed) or ≥3 distinct real senders. This is
 *      the belt-and-suspenders case for system-event text we don't
 *      recognize, still attributed to the group's name.
 *
 * Deliberately NOT applied to a 1:1 DM: there, the export filename is just
 * the other real person's name, and (b)'s "genuinely a group" gate is false,
 * so their real messages are left alone — this is the fix for the bug where
 * a DM export collapsed to a single participant.
 */
function applyChatTitleExclusion(
  messages: ChatMessage[],
  chatTitle?: string | null,
): void {
  if (!chatTitle) return;
  const titleLower = chatTitle.toLowerCase();

  const realSenders = new Set(
    messages.filter((m) => !m.system).map((m) => m.sender),
  );
  const titleHasRealMessages = [...realSenders].some(
    (s) => s.toLowerCase() === titleLower,
  );
  const isGenuinelyGroup =
    messages.some(
      (m) => m.system && GROUP_EVIDENCE_PATTERNS.some((re) => re.test(m.text)),
    ) || realSenders.size >= 3;

  if (titleHasRealMessages && !isGenuinelyGroup) {
    // 1:1 DM (or otherwise unproven group) where the title-matching sender
    // is a real participant — leave every one of their messages exactly as
    // the content-based check already flagged them. This is the DM fix.
    return;
  }

  for (const m of messages) {
    if (m.sender.toLowerCase() === titleLower) {
      m.system = true;
    }
  }
}

/**
 * Parse a WhatsApp export from raw `_chat.txt` text. `chatTitle`, when known,
 * is used to exclude system lines WhatsApp attributes to the group's own name
 * (see `applyChatTitleExclusion`) — pass it when available (see
 * `parseUpload`).
 */
export function parseWhatsAppText(
  text: string,
  chatTitle?: string | null,
): ParsedTranscript {
  const lines = text.split(/\r?\n/);

  // Try both styles, keep whichever matched the most start-of-message lines.
  const candidates: RawParsed[] = [
    parseWithStyle(lines, BRACKET_RE, BRACKET_SYSTEM_RE),
    parseWithStyle(lines, DASH_RE, DASH_SYSTEM_RE),
  ];
  const best = candidates.reduce((a, b) =>
    b.matchedLines > a.matchedLines ? b : a,
  );

  const messages = best.messages;
  applyChatTitleExclusion(messages, chatTitle);
  const nonSystem = messages.filter((m) => !m.system);

  // Per-participant stats over non-system messages.
  const counts = new Map<string, number>();
  for (const m of nonSystem) {
    counts.set(m.sender, (counts.get(m.sender) ?? 0) + 1);
  }
  const total = nonSystem.length || 1;
  const participants: ParticipantStat[] = [...counts.entries()]
    .map(([name, count]) => ({
      name,
      count,
      percentage: Math.round((count / total) * 100),
    }))
    .sort((a, b) => b.count - a.count);

  return {
    messages,
    messageCount: nonSystem.length,
    participants,
  };
}

// WhatsApp export zip/txt filenames look like "WhatsApp Chat - <title>.zip"
// or "WhatsApp Chat with <title>.txt" — a cheap, reliable source for the
// group title, tried before falling back to scanning the text itself.
const FILENAME_TITLE_RE = /^WhatsApp Chat(?:\s+with|\s*-)\s*(.+?)\.(zip|txt)$/i;

function extractChatTitleFromFilename(filename: string): string | null {
  const match = filename.match(FILENAME_TITLE_RE);
  return match ? normalizeSender(match[1]) : null;
}

// Curly ("smart") or straight quotes — WhatsApp uses either depending on
// locale/OS version.
const GROUP_NAME_CHANGE_RE =
  /changed the (?:group name|subject) to ["“]([^"”]+)["”]/gi;

/**
 * WhatsApp attributes every historical system line in an export to the
 * group's CURRENT (at export time) name, even lines from before a rename —
 * so the last "changed the group name/subject to "X"" in the file is the
 * exact string used as "sender" throughout. Fallback for when the filename
 * doesn't yield a title (e.g. a raw `_chat.txt` upload).
 */
function extractChatTitleFromText(text: string): string | null {
  const matches = [...text.matchAll(GROUP_NAME_CHANGE_RE)];
  if (matches.length === 0) return null;
  return normalizeSender(matches[matches.length - 1][1]);
}

/**
 * Parse an uploaded file (a `.zip` containing `_chat.txt`, or a raw `.txt`).
 * Accepts the raw bytes. Never writes them anywhere.
 */
export async function parseUpload(
  bytes: ArrayBuffer,
  filename: string,
): Promise<ParsedTranscript> {
  const isZip = /\.zip$/i.test(filename) || looksLikeZip(bytes);

  let text: string;
  if (isZip) {
    const zip = await JSZip.loadAsync(bytes);
    // Find the chat text file — name varies by locale/OS.
    const entry = Object.values(zip.files).find(
      (f) => !f.dir && /\.txt$/i.test(f.name),
    );
    if (!entry) {
      throw new Error("No _chat.txt found inside the .zip");
    }
    text = await entry.async("string");
  } else {
    text = new TextDecoder("utf-8").decode(bytes);
  }

  const chatTitle =
    extractChatTitleFromFilename(filename) ?? extractChatTitleFromText(text);
  return parseWhatsAppText(text, chatTitle);
}

function looksLikeZip(bytes: ArrayBuffer): boolean {
  const head = new Uint8Array(bytes.slice(0, 2));
  // ZIP local file header magic "PK"
  return head[0] === 0x50 && head[1] === 0x4b;
}

/**
 * Render the parsed transcript to the clean string the generator reads:
 * `[date time] sender: text`, applying any display-name overrides, dropping
 * pure system lines (kept only during parse for context).
 */
export function renderTranscript(
  parsed: ParsedTranscript,
  nameOverrides?: Record<string, string>,
): string {
  return parsed.messages
    .filter((m) => !m.system)
    .map((m) => {
      const name = nameOverrides?.[m.sender] ?? m.sender;
      return `[${m.date} ${m.time}] ${name}: ${m.text}`;
    })
    .join("\n");
}
