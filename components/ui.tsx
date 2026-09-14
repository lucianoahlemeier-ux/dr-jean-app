import Link from "next/link";
import { clsx } from "clsx";

// Small shadcn-style primitives, hand-rolled so the repo stays self-contained
// (no registry/network fetch). Warm, rounded, friendly per docs/05.

export function Button({
  children,
  className,
  variant = "primary",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "dark";
}) {
  return (
    <button
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-base font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" &&
          "bg-accent text-accent-fg shadow-soft hover:opacity-90",
        variant === "dark" &&
          "bg-ink text-cream shadow-soft hover:bg-ink/90",
        variant === "ghost" &&
          "bg-transparent text-ink hover:bg-ink/5",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function LinkButton({
  href,
  children,
  className,
  variant = "primary",
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
  variant?: "primary" | "dark";
}) {
  return (
    <Link
      href={href}
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-full px-8 py-4 font-serif text-lg transition shadow-soft",
        variant === "primary" && "bg-accent text-accent-fg hover:opacity-90",
        variant === "dark" && "bg-ink text-cream hover:bg-ink/90",
        className,
      )}
    >
      {children}
    </Link>
  );
}

export function Card({
  children,
  className,
  onClick,
  selected,
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  selected?: boolean;
}) {
  return (
    <div
      onClick={onClick}
      className={clsx(
        "rounded-2xl border bg-white/70 p-5 shadow-card transition",
        onClick && "cursor-pointer hover:border-ink/40",
        selected ? "border-ink" : "border-ink/10",
        className,
      )}
    >
      {children}
    </div>
  );
}
