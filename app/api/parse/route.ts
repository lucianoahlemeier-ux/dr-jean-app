import { NextResponse } from "next/server";
import { parseUpload } from "@/lib/whatsapp";

export const runtime = "nodejs";
export const maxDuration = 60;

// Validate + parse an upload IN MEMORY and return the message count +
// participant breakdown. Nothing is persisted here — the raw chat is discarded
// as soon as this handler returns. Used by the wizard's upload step to show
// "read N messages" and the participant list.
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const parsed = await parseUpload(bytes, file.name);

    if (parsed.messageCount === 0) {
      return NextResponse.json(
        {
          error:
            "That doesn't look like a WhatsApp export. In WhatsApp: open the chat → ⋮ / More → Export chat → Without media → share the .zip.",
        },
        { status: 422 },
      );
    }

    return NextResponse.json({
      message_count: parsed.messageCount,
      participants: parsed.participants,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to parse file";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
