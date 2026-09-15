import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import {
  getSupabase,
  UPLOADS_BUCKET,
  COVERS_BUCKET,
} from "@/lib/supabase";
import { inngest } from "@/lib/inngest/client";
import { checkRateLimit, clientIp } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Hard ceiling on the upload. Vercel caps a serverless request body around
 * 4.5MB anyway, so this mostly exists to fail with a sentence a human can act
 * on instead of a platform-level error page. A WhatsApp export without media
 * is plain text and compresses hard — 4MB of zip is a chat far larger than
 * anything this is priced to read. */
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

// The upload route (docs/02): FAST. It validates + stashes the raw file in
// temporary storage, creates the report row (status=queued), enqueues the
// Inngest job, and returns immediately (well under Vercel's 10s). Generation
// happens in the background job, not here.
export async function POST(req: Request) {
  try {
    const form = await req.formData();

    const file = form.get("file");
    const email = String(form.get("email") ?? "").trim();
    const language = String(form.get("language") ?? "English").trim();
    const relationship_type = String(
      form.get("relationship_type") ?? "other",
    ).trim();
    const freeform_context = String(form.get("freeform_context") ?? "").trim();
    const platform = String(form.get("platform") ?? "whatsapp").trim();
    const chat_title = String(form.get("chat_title") ?? "").trim();
    const nameOverridesRaw = String(form.get("name_overrides") ?? "");
    const cover = form.get("cover");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return NextResponse.json(
        { error: "A valid email is required" },
        { status: 400 },
      );
    }
    if (platform !== "whatsapp") {
      return NextResponse.json(
        { error: "Only WhatsApp is supported in this version" },
        { status: 400 },
      );
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        {
          error:
            "That export is too large to read. Export the chat again with " +
            "“Without media” — that keeps it to text and makes it much smaller.",
        },
        { status: 413 },
      );
    }

    // Spend guard — see lib/rateLimit.ts. Checked BEFORE anything is stored
    // or enqueued, so a blocked request costs a single indexed count query
    // and nothing else.
    const limit = await checkRateLimit(clientIp(req), email);
    if (!limit.ok) {
      console.warn(`[generate] rate limited (${limit.reason})`);
      return NextResponse.json(
        {
          error:
            "You've made a lot of reports today. Try again tomorrow — or " +
            "get in touch if you genuinely need more.",
        },
        { status: 429 },
      );
    }

    let name_overrides: Record<string, string> | undefined;
    if (nameOverridesRaw) {
      try {
        name_overrides = JSON.parse(nameOverridesRaw);
      } catch {
        name_overrides = undefined;
      }
    }

    const supabase = getSupabase();

    const id = randomUUID();
    const token = randomUUID().replace(/-/g, "");
    const storagePath = `${id}/${sanitizeName(file.name)}`;

    // Stash the raw upload TEMPORARILY. The job deletes it immediately after
    // generating (privacy promise). It is never a DB column.
    const bytes = await file.arrayBuffer();
    const { error: uploadErr } = await supabase.storage
      .from(UPLOADS_BUCKET)
      .upload(storagePath, bytes, {
        contentType: file.type || "application/octet-stream",
        upsert: true,
      });
    if (uploadErr) {
      return NextResponse.json(
        { error: `Upload storage failed: ${uploadErr.message}` },
        { status: 500 },
      );
    }

    // Optional: group cover photo (NOT the chat). Stored in a public bucket.
    let cover_image_url: string | null = null;
    if (cover instanceof File && cover.size > 0) {
      const coverPath = `${id}/${sanitizeName(cover.name)}`;
      const coverBytes = await cover.arrayBuffer();
      const { error: coverErr } = await supabase.storage
        .from(COVERS_BUCKET)
        .upload(coverPath, coverBytes, {
          contentType: cover.type || "image/jpeg",
          upsert: true,
        });
      if (!coverErr) {
        cover_image_url = supabase.storage
          .from(COVERS_BUCKET)
          .getPublicUrl(coverPath).data.publicUrl;
      }
    }

    // Create the report row (status=queued). Note: NO raw transcript column.
    const { error: insertErr } = await supabase.from("reports").insert({
      id,
      token,
      status: "queued",
      language,
      relationship_type,
      freeform_context: freeform_context || null,
      platform,
      email,
      chat_title: chat_title || null,
      cover_image_url,
    });
    if (insertErr) {
      return NextResponse.json(
        { error: `Could not create report: ${insertErr.message}` },
        { status: 500 },
      );
    }

    // Enqueue the slow job and return fast.
    await inngest.send({
      name: "report/requested",
      data: {
        reportId: id,
        token,
        storagePath,
        filename: file.name,
        email,
        language,
        relationship_type,
        freeform_context,
        platform,
        name_overrides,
        chat_title: chat_title || undefined,
      },
    });

    return NextResponse.json({ token });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to start generation";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "upload.txt";
}
