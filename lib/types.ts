// Shared types for the onboarding answers, parsed transcript, and report record.

export type RelationshipType =
  | "partner"
  | "friends"
  | "best_friend"
  | "family"
  | "work"
  | "other";

export type ReportStatus = "queued" | "processing" | "done" | "failed";

/** One parsed WhatsApp message. */
export interface ChatMessage {
  /** ISO-ish original timestamp string as it appeared (kept for quoting). */
  date: string;
  time: string;
  sender: string;
  text: string;
  /** True for system lines / media placeholders we keep only as markers. */
  system?: boolean;
}

/** Result of parsing an upload — held in memory only, never persisted. */
export interface ParsedTranscript {
  messages: ChatMessage[];
  messageCount: number;
  participants: ParticipantStat[];
}

export interface ParticipantStat {
  name: string;
  count: number;
  /** Whole-number percentage of non-system messages. */
  percentage: number;
}

/** The onboarding answers carried into the generation prompt. */
export interface OnboardingAnswers {
  language: string;
  relationship_type: RelationshipType;
  freeform_context: string;
  platform: "whatsapp" | "imessage";
  /** Optional per-participant display-name overrides ({original: display}). */
  name_overrides?: Record<string, string>;
  /** Optional chat/group title the user gave. */
  chat_title?: string;
}

/** The persisted report row (never contains the raw chat). */
export interface ReportRecord {
  id: string;
  token: string;
  status: ReportStatus;
  language: string;
  relationship_type: string;
  freeform_context: string | null;
  platform: string;
  email: string;
  report_markdown: string | null;
  message_count: number | null;
  chat_title: string | null;
  cover_image_url: string | null;
  created_at: string;
  error: string | null;
  /** Paywall — one-time Stripe payment unlocks the full report. */
  paid: boolean;
  paid_at: string | null;
  stripe_session_id: string | null;
  stripe_payment_intent_id: string | null;
}
