// The social-proof "wall of love" strip — the growth engine (docs/05). These
// are PLACEHOLDER reaction cards; swap in real chat-screenshot reactions later.
// Labelled by relationship type, scrolling row.

const REACTIONS: { label: string; emoji: string; quote: string }[] = [
  { label: "best friends", emoji: "👯", quote: "why am I listed as 'emotional support chaos' 😭" },
  { label: "11 months", emoji: "🥹", quote: "I'm both laughing and crying!!!!!" },
  { label: "lads' trip", emoji: "🍹", quote: "who did this 😭😭😭" },
  { label: "family", emoji: "🏡", quote: "dad reacted with 👍 again" },
  { label: "situationship", emoji: "💘", quote: "MANDATORY READING" },
  { label: "the group", emoji: "🎭", quote: "we should rename the group like that" },
  { label: "old friends", emoji: "🎓", quote: "twelve years of 6am texts, exposed" },
  { label: "girls", emoji: "✨", quote: "a loyalty audit of four women 💅" },
];

export function ReactionStrip() {
  // Duplicate so the marquee loops seamlessly.
  const cards = [...REACTIONS, ...REACTIONS];
  return (
    <div className="relative overflow-hidden py-2">
      <div className="flex w-max animate-[scroll_40s_linear_infinite] gap-4 hover:[animation-play-state:paused]">
        {cards.map((r, i) => (
          <div
            key={i}
            className="w-64 shrink-0 rounded-2xl border border-ink/10 bg-white/80 p-4 shadow-card"
          >
            <div className="mb-2 text-sm font-medium text-ink-soft">
              {r.emoji} {r.label}
            </div>
            <div className="rounded-2xl rounded-bl-md bg-cream-deep/70 px-3 py-2 text-sm text-ink">
              {r.quote}
            </div>
          </div>
        ))}
      </div>
      <style>{`@keyframes scroll{from{transform:translateX(0)}to{transform:translateX(-50%)}}`}</style>
    </div>
  );
}
