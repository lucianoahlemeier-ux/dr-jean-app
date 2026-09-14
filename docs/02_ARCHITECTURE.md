# 02 — Architecture

## The whole free stack
| Concern | Tool | Tier |
|---|---|---|
| Frontend + report pages + light API routes | **Next.js on Vercel** | Hobby (free) |
| Long report generation (the slow job) | **Inngest** | free |
| DB (report records, share tokens, status) | **Supabase** (Postgres) | free |
| Email the report link | **Resend** | free |
| The AI that writes the report | **Anthropic API** | **paid — the only cost** |

No VPS. (A Cloudflare Worker is an equally-fine free alternative to Inngest for the job —
its free tier bills CPU time, not wait time, so a long Claude call fits. Pick one; docs
assume Inngest.)

## The one constraint that shapes everything
**Vercel Hobby functions time out at 10 seconds.** A report is a Claude call over a whole
transcript → **minutes**, not seconds. So generation must NOT happen inside the upload
request. Split it:

```
[browser] upload .zip + answers
      │
      ▼
[Vercel API route]  validate + create report row (status=queued) + enqueue Inngest event
      │  (returns in <1s — safely under 10s)
      ▼
[Inngest function]  fetch the uploaded file → parse to transcript (in memory)
                    → call Anthropic (persona prompt) → get report text
                    → save report text to Supabase (status=done) → DELETE raw file
      │
      ▼
[Resend]  email the private link  →  /r/{token} report page reads the saved report
```

The status page polls the report row until `done`.

## Privacy by design (non-negotiable — it's a user promise)
- **Never store the raw chat.** If the upload lands in Supabase storage temporarily, the
  job **deletes it immediately after generating**. Persist only the finished report + the
  onboarding metadata.
- Use Anthropic in a **no-retention** posture; state in your privacy copy that chats aren't
  stored and aren't used to train.
- **Third-party data note:** the uploader consents, but the *other* people in the chat did
  not. You're EU-based — put a plain privacy policy up, offer report deletion, and don't
  retain content. Treat this as a real constraint, not a footnote.

## Data model (Supabase)
`reports(id, token unique, status, language, relationship_type, freeform_context,
platform, email, report_markdown, message_count, created_at, error)`.
Raw transcript: **not a column, not a table, not a bucket object that outlives the job.**

## Env vars (`.env.example`)
```
ANTHROPIC_API_KEY=
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
RESEND_API_KEY=
NEXT_PUBLIC_APP_URL=
```

## Cost note
Only Anthropic costs money. A big chat (10k+ messages) ≈ a large input-token bill, roughly
cents to ~$1 per report on Sonnet (cheaper on Haiku, dearer on Opus). Fine for testing;
at scale it's your main cost and what pricing must cover.
