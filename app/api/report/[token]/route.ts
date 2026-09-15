import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export const runtime = "nodejs";

// The status page (app/status/[token]/page.tsx) polls this route every 4s
// until status flips to "done"/"failed". Next.js's App Router patches the
// global `fetch` and caches GET requests by default unless a route opts out
// — and that patch reaches into supabase-js's internal fetch calls too, not
// just calls this file makes directly. Without these two lines, Vercel's
// function logs show the outbound Supabase REST call as "Using cache": every
// poll after the first replays the SAME stale response (whatever status the
// row had on the very first request), so the client can loop forever even
// though the row moved to status="done" in the DB ages ago. Confirmed via
// production logs: 200s in ~12ms (far faster than a real Postgres round
// trip) for 20+ minutes straight on a report that finished in 2.5 minutes.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

// Status/report JSON for the status page to poll. Returns the report row by
// token (never any raw chat — that column doesn't exist).
export async function GET(
  _req: Request,
  { params }: { params: { token: string } },
) {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("reports")
      .select(
        "token, status, report_markdown, message_count, chat_title, cover_image_url, error, created_at, paid",
      )
      .eq("token", params.token)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: "Report not found" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Lookup failed";
    return NextResponse.json(
      { error: message },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
