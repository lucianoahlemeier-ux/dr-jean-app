import { Resend } from "resend";
import { persona } from "./persona";

// Emails the private report link via Resend. Optional convenience — the link is
// the real deliverable, so if Resend isn't configured we just log the link and
// carry on rather than failing the job.

export async function sendReportEmail(params: {
  to: string;
  reportUrl: string;
  chatTitle?: string | null;
}): Promise<{ sent: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const configuredFrom = process.env.RESEND_FROM?.trim();
  const from = configuredFrom || `${persona.name} <onboarding@resend.dev>`;

  if (!apiKey) {
    console.log(
      `[email] Resend not configured — report link for ${params.to}: ${params.reportUrl}`,
    );
    return { sent: false, error: "RESEND_API_KEY not set" };
  }

  // onboarding@resend.dev is Resend's shared test sender: it only delivers to
  // the address that owns the Resend account, and silently fails for everyone
  // else. Shipping on it means every customer's email vanishes — so say so
  // rather than letting it look like it's working.
  if (!configuredFrom) {
    console.warn(
      "[email] RESEND_FROM is not set, falling back to Resend's shared test " +
        "sender. Mail will NOT reach anyone but your own Resend account " +
        "address. Set RESEND_FROM to an address on a verified domain.",
    );
  }

  const resend = new Resend(apiKey);
  const subject = params.chatTitle
    ? `${persona.name} read "${params.chatTitle}"`
    : `${persona.name} finished your report`;

  const { error } = await resend.emails.send({
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

  // The Resend SDK reports API failures in `error` rather than throwing, so a
  // bare `await` here looked like success for every rejected send — an
  // unverified domain, a rate limit, a bad recipient. Email IS the delivery
  // mechanism for this product (no accounts, the link is the only key), so a
  // silent failure means the customer simply never receives what they waited
  // for, and nothing anywhere records it.
  if (error) {
    console.error(
      `[email] Resend REJECTED the report email to ${params.to}: ` +
        `${error.message ?? String(error)}`,
    );
    return { sent: false, error: error.message ?? String(error) };
  }

  console.log(`[email] report link sent to ${params.to}`);
  return { sent: true };
}
