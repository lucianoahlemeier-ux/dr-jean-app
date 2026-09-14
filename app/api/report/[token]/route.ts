import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export const runtime = "nodejs";

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
        "token, status, report_markdown, message_count, chat_title, cover_image_url, error, created_at",
      )
      .eq("token", params.token)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Lookup failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
