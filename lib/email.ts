import { Resend } from "resend";
import { persona } from "./persona";

// Emails the private report link via Resend. Optional convenience — the link is
// the real deliverable, so if Resend isn't configured we just log the link and
// carry on rather than failing the job.

export async function sendReportEmail(params: {
  to: string;
  reportUrl: string;
  chatTitle?: string | null;
}): Promise<{ sent: boolean }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from =
    process.env.RESEND_FROM || `${persona.name} <onboarding@resend.dev>`;

  if (!apiKey) {
    console.log(
      `[email] Resend not configured — report link for ${params.to}: ${params.reportUrl}`,
    );
    return { sent: false };
  }

  const resend = new Resend(apiKey);
  const subject = params.chatTitle
    ? `${persona.name} read "${params.chatTitle}"`
    : `${persona.name} finished your report`;

  await resend.emails.send({
    from,
    to: params.to,
    subject,
    html: `
      <div style="font-family: Georgia, serif; color: #2B2622; max-width: 520px; margin: 0 auto;">
        <h1 style="font-size: 22px;">${persona.name} is done reading.</h1>
        <p style="font-size: 16px; line-height: 1.5;">
          The report is ready. It's a private link — share it back into the chat
          if you dare.
        </p>
        <p style="margin: 28px 0;">
          <a href="${params.reportUrl}"
             style="background: ${persona.accent}; color: ${persona.accentFg};
                    padding: 14px 24px; border-radius: 999px; text-decoration: none;
                    font-size: 16px;">
            Read the report →
          </a>
        </p>
        <p style="font-size: 13px; color: #6B6259;">
          The conversation used to write this wasn't saved.
        </p>
      </div>
    `,
  });

  return { sent: true };
}
