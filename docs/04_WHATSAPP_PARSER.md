# 04 — WhatsApp Export Parser

## What the user uploads
WhatsApp → open chat → ⋮/More → **Export chat** → **Without Media** → a `.zip` containing a
single `_chat.txt` (name varies slightly by platform/locale). Accept the `.zip` (unzip
server-side) or a raw `.txt`. "Without media" keeps it text-only and small.

## Line format (the common case)
```
[2026-03-28, 21:14:03] Amir: been running on zero sleep all day
DD/MM/YYYY or MM/DD/YYYY, 12h or 24h, brackets or not — varies by locale/OS.
```
Parse defensively:
- Each new message starts with a **timestamp token** (bracketed or `date, time -`). If a
  line doesn't start with one, it's a **continuation** of the previous message (multiline) —
  append it.
- Split each message into `{ timestamp, sender, text }`.
- Support both `[dd/mm/yyyy, hh:mm:ss]` and `dd/mm/yyyy, hh:mm -` styles; try a couple of
  regexes, pick whichever matches most lines.

## Things to handle / strip
- **System lines:** "Messages and calls are end-to-end encrypted…", "X created group",
  "X added Y", "X changed the subject". Drop or tag as system.

  **These almost always arrive in the SAME `sender: text` shape as a real message** — not a
  separate sender-less format. Real exports attribute them either to the group's *current*
  name (e.g. `"Flat 4B chaos: Marco removed you"`) or to the affected member
  (e.g. `"Elio: ~ Paul Bianchi added Elio"`). Relying on a sender-less regex path
  to catch these will miss essentially all of them. Detect a system line by checking, on
  every `sender: text` match (not just the sender-less one):
  - the (normalized) sender equals the chat/group title, OR
  - the text matches a known system phrase — checked anywhere in the text, since the acting
    member's name is often repeated before the phrase itself (e.g. `"~ Marco Bianchi
    created this group"`).

  Known phrases to match (case-insensitive): end-to-end-encrypted notice, `created (this)
  group`, `added`, `removed`, `changed the group name to`, `changed the subject`, `changed
  this group's icon`, `changed the group description`, `changed their phone number`,
  `changed to admin` / `you're now an admin`, `joined using this group's invite link`,
  `security code changed`, `pinned a message`. Anchor "member left" tightly (whole text,
  name-cased tokens only) rather than a bare `left` — a real message that happens to *end*
  with the word "left" (e.g. "sorry, I already left") is not a departure event.

  The **chat/group title** itself must never be counted as a participant — *in a group*. Pull
  it from the export filename (`WhatsApp Chat - <title>.zip`) when available, or as a
  fallback, from the last `"changed the group name/subject to "X""` in the file — WhatsApp
  attributes every historical system line to the group's name *at export time*, so the most
  recent rename is the exact string used as "sender" throughout, even for lines from before
  that rename.

  **This must never fire on a 1:1 DM.** A DM export's filename is just `WhatsApp Chat -
  <other person's real name>.zip` — that "title" is a real participant, not a group name, and
  naively excluding any sender matching it collapses the whole chat down to one person
  (a real bug we shipped once: `report reference/WhatsApp Chat - leo rossi.zip`, a
  DM, parsed to a single participant because the other person's name happened to equal the
  filename-derived "title"). The fix (`applyChatTitleExclusion` in `lib/whatsapp.ts`) only
  excludes a title-matching sender when either:
  - it produces **zero real (non-system) messages anywhere** in the chat — i.e. it's
    exclusively a vessel for system noise, like `"Flat 4B chaos"` in the group case
    above; excluding it costs nothing because it was never a real participant either way; or
  - it's the filename/text-derived title **and** the chat is *genuinely a group* — evidenced
    by an actual group-structural line (created/added/removed/renamed) or **≥3 distinct real
    senders**. This is the belt-and-suspenders case for a system-event phrasing the text
    patterns above don't recognize, still attributed to the group's own name.

  A 1:1 DM (2 real senders, no group-structural evidence) satisfies neither condition, so a
  title-matching sender there is simply left alone as the real person they are.

  **Group-evidence detection needs its own, stricter patterns** — do not reuse the bare
  `/\badded\b/i` / `/\bremoved\b/i` from the system-phrase list above for this. Those
  false-positive constantly on ordinary conversation (a real DM in testing contained "they
  just added the new booking flow" — nothing to do with group membership), which would otherwise
  register as false "this is a group" evidence and wrongly trigger exclusion in a DM. A
  genuine WhatsApp added/removed system line is short and ends right after `"you"` or a
  capitalized name (`"Marco added you"`, `"~ Paul Bianchi added Elio"`) — anchor to
  the end of the text and require that shape for group-evidence purposes specifically.

- **The `~` not-in-contacts marker:** a sender not in your address book is prefixed `~`
  followed by **U+202F (narrow no-break space)**, not a plain space — e.g.
  `"~ Marco Bianchi"`. `.trim()` alone does not remove this: it sits *mid-string*
  (between `~` and the name), not at either edge. Strip the leading `~` and any following
  whitespace explicitly, then collapse any other internal whitespace and trim. Apply this
  normalization everywhere a sender is used — including as the key when counting messages
  per participant — otherwise the same person is split into two "participants" depending on
  whether they were saved as a contact yet when a given message arrived.

  Note this does **not** unify every alias for the same person: if someone is saved under a
  short name later (e.g. full `"Marco Bianchi"` while not-in-contacts, then just
  `"Marco"` once saved), those are genuinely different strings and are not merged by this
  normalization — that's a first-name/full-name identity problem, not a tilde/whitespace
  artifact, and isn't solved by stripping `~`. The onboarding wizard's name-review step (step
  8) is the place a user reconciles that today.

- **Media placeholders:** `<Media omitted>`, `image omitted`, `audio omitted`,
  `<attached: …>`, `sticker omitted`, `This message was deleted`. Keep as a lightweight
  marker (e.g. `[voice note]`) so the persona can *reference* that a voice note happened
  without content.
- **Emoji / non-ASCII:** keep as-is (they're signal).
- **Very large chats:** you may cap or window (e.g. keep most-recent N messages + a sample)
  if you hit token limits — but note this trade-off; the magic scales with how much it read.

## Output to the generator
A clean transcript string (or array) of `[date, time] sender: text`, plus
`message_count`. **Then discard the raw upload** (see `docs/02`).

`message_count` must count real messages only — system lines excluded. The generation
prompt cites this number directly ("I read all N messages") as proof the model read
everything; if system lines are miscounted as messages, that claim becomes false and the
transcript handed to the model is contaminated with fake dialogue attributed to phantom
"senders" (the group's own name, or the affected member of a membership event).

## Validation (onboarding step 7)
If no lines parse into messages, reject with "that doesn't look like a WhatsApp export —
here's how to export" and re-show the how-to. On success, show the message count as
confirmation.

## iMessage — out of scope v1
No clean export (lives in `chat.db` on a Mac). If a user picks iMessage, show "coming soon".
Don't build it now.
