# 05 — Design

Goal: warm, playful, trustworthy — the same *feeling* as the reference site, but your own
brand. Build with Tailwind + shadcn/ui. **Match the look to the screenshots in
`reference/Site/`** — landing page, report page, and overall aesthetic.

## Palette & mood
- **Background:** soft warm cream (reference uses ~`#FFF8F2`). Not white, not grey.
- **Feel:** friendly, rounded, a little cheeky. Consumer, not enterprise. Think iMessage/
  WhatsApp warmth, not a SaaS dashboard.
- Accent: one friendly color for buttons/links. Generous rounding, soft shadows.

## Landing page
- Big playful wordmark + one-line hook ("share any conversation, get {{PERSONA_NAME}}'s
  real take").
- A single primary CTA ("Get the Report") → the onboarding wizard.
- **Social-proof strip** = the growth engine: a scrolling row of "reaction" cards (chat
  screenshots of people reacting to their report), labelled by relationship type (family,
  situationship, best friends, lads' trip…). Use placeholders now; this is where virality
  lives, so make the slot prominent.
- Short "three ways to get read" section if you add tiers later (v1 = just the one).
- FAQ: what chats work, which apps, how long it takes, **is it safe** (privacy answer),
  how to share.

## Onboarding wizard
- One question per screen, big tap targets, a progress feel, minimal typing.
- Relationship type = a grid of emoji chips.
- The how-to-export screen shows a looping GIF/video frame of the WhatsApp export steps.
- Upload screen: big drop zone for the `.zip`, then a satisfying "read N messages" confirm.

## Report page (`/r/{token}`)
Target layout: `report reference/Screenshot *.png`. Content/voice target:
`report reference/report_reference_output.md`. See docs/03 for the full structure and the
quote/bubble convention this layout depends on.

- **Comfortable measure** (~65ch, `max-w-measure`), readable serif for prose, clear spacing
  between section headers.
- **Top chrome is static, not model-generated** (docs/03 Part A): a small "Classic Report"
  badge, the model's title (`# `) rendered big/centered/serif, a bordered byline card
  (persona avatar + name + `persona.byline`, straight from `lib/persona.ts`), then the
  privacy line ("the conversation used to create this report wasn't saved") linking to
  `/privacy`.
- **Section headers** (H2): centered, serif, with a small `— ◆ —` ornament underneath in the
  persona's accent colour — CSS-driven (`.report-prose h2::after`), not typed by the model,
  so it's consistent every time.
- **Quoted chat lines render as bubbles**, not blockquotes: rounded, tinted with the
  persona's accent (not Brandon's green), grouped by consecutive same-sender lines, with a
  sender label only when a quote has more than one speaker. See `ChatQuote` in
  `app/r/[token]/page.tsx` and the `` ```chat `` convention in `lib/prompt.ts`/docs/03.
- **Leaderboard / star review** render as plain bulleted lists (restore the browser's default
  disc bullet — Tailwind's preflight strips it, so `.report-prose ul/ol` must set
  `list-style-type` explicitly or bullets silently vanish).
- The closing callback line should land **bolded** (model wraps it in `**...**`).
- Sticky-ish **share** affordance (copy link / share to WhatsApp) — the point is sharing it
  back into the chat.
- Bottom: a "which chat is next?" grid → loops users back into the wizard.

## Tone of copy
Playful, warm, confident, a little funny. Never clinical. The brand voice should feel like
the persona wrote the site too.
