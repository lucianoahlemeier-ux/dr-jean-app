# CLAUDE.md — build instructions for this repo

You are building the MVP specified in `docs/`. This file governs how you work.

## Golden rules
1. **Read `docs/` in order before writing code.** They are the source of truth.
2. **Never store the raw chat.** In-memory parse → generate → discard. Persist only the
   finished report + metadata. This is a privacy promise the product makes to users; treat
   a violation as a build failure.
3. **Persona is a placeholder.** Leave `{{PERSONA_NAME}}` and the voice config for the
   human to fill. Do not hardcode "Brandon".
4. **Free-tier only.** Next.js/Vercel, Supabase, Inngest, Resend, Anthropic API. If a task
   seems to need paid infra, stop and ask.
5. **MVP scope only.** WhatsApp-only, Classic Report only, email-only delivery. Anything
   else (iMessage, WhatsApp delivery, auth, the "Deep Report"/"Mirror" tiers) is out of
   scope — note it as a TODO, don't build it. The one-time-payment paywall (Stripe) shipped
   and IS in scope — see the report page, `app/api/checkout/[token]`, and
   `app/api/stripe/webhook`.
6. **Ask before scope-adding.** If a doc is ambiguous, ask rather than invent.

## Why the architecture is shaped this way (don't "simplify" it away)
Report generation calls Claude over a whole transcript and takes **minutes**. Vercel Hobby
serverless functions **die at 10 seconds**. So generation **cannot** run in the request that
handles the upload. The flow is intentionally split:
`upload route (fast: validate + enqueue) → Inngest job (slow: parse + Claude + save) →
email link → report page reads saved report`.
Do not collapse this back into one long request.

## This is a prompt, not an agent
The generation engine is **one Claude call** (optionally two: extract, then write — see
`docs/03`). There is **no** LangGraph, no tool-loop, no agent framework. Don't add one.

## Build order
1. Onboarding wizard → reproduce every screen in `reference/beginning questions/` (including
   any image-upload step) → ends in a `.zip` upload (`docs/01`).
2. WhatsApp parser (`docs/04`).
3. Inngest generation job + persona prompt (`docs/03`).
4. Report page at a private token URL (`docs/05`).
5. Resend email with the link (optional — the link is the real deliverable).
6. **Get the code onto GitHub** once it works locally and looks right — if this folder was
   cloned from a repo (an `origin` exists), push back to that same repo on `main`; otherwise
   create a new public repo (`docs/06`).

## Deliverables
- `.env.example` with every key needed.
- `README.md` with exact setup: Supabase schema/SQL, Inngest setup, Resend, Anthropic key,
  and how to run locally against a sample export.
- A working `npm run dev`.
- A **public GitHub repo** on the builder's own account with the code pushed.

## Publishing safety (public repo)
Before the push in step 6, ensure `.gitignore` excludes `.env` and any secret files. The repo
is **public** — never commit API keys. Only `.env.example` (placeholder values) goes in.
