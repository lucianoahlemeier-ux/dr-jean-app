import Link from "next/link";
import Image from "next/image";
import { persona } from "@/lib/persona";

// Wordmark header. Matches reference/Site: an avatar chip + serif wordmark on a
// cream bar.
export function Header() {
  return (
    <header className="sticky top-0 z-20 border-b border-ink/10 bg-cream/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
        <Link href="/" className="flex items-center gap-3">
          <Image
            src={persona.avatar}
            alt={persona.name}
            width={36}
            height={36}
            className="h-9 w-9 shrink-0 rounded-full object-cover"
          />
          <span className="font-serif text-2xl text-ink">{persona.name}</span>
        </Link>
      </div>
    </header>
  );
}
