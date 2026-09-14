import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { generateReportFn } from "@/lib/inngest/functions";

export const runtime = "nodejs";

// Inngest endpoint. The Inngest Dev Server (npm run inngest) or Inngest Cloud
// registers against /api/inngest and invokes the generation function here.
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [generateReportFn],
});
