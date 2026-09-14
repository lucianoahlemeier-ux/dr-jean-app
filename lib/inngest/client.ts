import { Inngest } from "inngest";

// The Inngest client. INNGEST_EVENT_KEY / INNGEST_SIGNING_KEY come from env in
// production; for local dev the Inngest Dev Server works without them.
export const inngest = new Inngest({ id: "chat-report-mvp" });

/** Event that kicks off report generation. */
export interface ReportRequestedEvent {
  name: "report/requested";
  data: {
    reportId: string;
    token: string;
    storagePath: string;
    filename: string;
    email: string;
    language: string;
    relationship_type: string;
    freeform_context: string;
    platform: string;
    name_overrides?: Record<string, string>;
    chat_title?: string;
  };
}

export type Events = {
  "report/requested": ReportRequestedEvent;
};
