# 01 — Product & Onboarding Flow

## What it is
Drop in a WhatsApp chat export → an AI persona (`{{PERSONA_NAME}}`) reads the whole thing →
it writes a funny, specific, warm-but-honest **report** about the people in the chat →
user gets a **private link** to share back into that chat. The share-back is the growth loop.

## MVP scope (v1)
- **One report type:** the Classic Report (see `docs/03`).
- **One platform:** WhatsApp export only (`.zip`). iMessage later.
- **One delivery:** email a link (Resend). WhatsApp delivery later.
- **No auth, no payments** yet — a token URL per report is enough.
- Async: generation takes minutes and happens in the background; the user is told the
  report will arrive by email (and the status page polls).

## Out of scope for v1 (TODO markers only)
iMessage ingestion · WhatsApp Business delivery · Stripe/payments · accounts/login ·
the "Deep Report" and "Mirror" tiers · multi-chat cross-analysis.

## The onboarding wizard (~11 steps)
Model it on the real flow. The screenshots in `reference/beginning questions/` are the
**source of truth** and are in **no particular filename order** — **open and read each image,
infer the correct sequence, and reproduce EVERY screen shown, including any image/photo-upload
step, even if it isn't in the list below.** The list here is illustrative only. Collect the
answers, carry them into the generation prompt as `onboarding` context. Keep it one question
per screen, friendly, fast.

1. **Language** — pick the report's language (e.g. English, Français, …). Passed to the
   prompt; the report is written in this language.
2. **Relationship / chat type** — single-select: `partner`, `crush`, `friends`, `group`,
   `best friend`, `family`, `work`, `team`, `other`. Sets tone + which dynamics to look for.
3. **Free-form context** — "tell {{PERSONA_NAME}} anything that helps" with a placeholder
   like *"e.g. a group of uni friends"* or *"my girlfriend of 3 years"*. Optional. This is
   high-value: it lets the user name who's who and what matters. Feed it verbatim.
4. **Platform** — `WhatsApp` or `iMessage`. v1: if iMessage, show "coming soon, WhatsApp
   only for now" and stop. Only WhatsApp proceeds.
5. **Continue** → a short reassurance/animation screen (social-proof / "here's what you'll
   get"). Cosmetic.
6. **How-to-export screen** — a short looping video/GIF frame showing how to export a
   WhatsApp chat (WhatsApp → chat → ⋮ → More → Export chat → **Without media** →
   save/share the `.zip`). Static asset for now; a placeholder is fine.
7. **Upload** — accept the exported **`.zip`** (or a `_chat.txt`). Validate it's a real
   WhatsApp export (see `docs/04`); show the message count once parsed.
8. **Email** — collect the address the report link is sent to.
9. **Confirm & generate** — recap their answers; on submit, the route validates + **enqueues
   the Inngest job** and returns immediately.
10. **Status screen** — "‎{{PERSONA_NAME}} is reading your chat… this takes a few minutes,
    we'll email you the link." Polls the report's status.
11. **Report ready** — email lands with the private link → report page (`docs/05`).

### Data captured per session
`{ language, relationship_type, freeform_context, platform, email, report_token,
status: queued|processing|done|failed }` — plus the parsed transcript **held only in memory
for the job**, never written to disk/DB.
