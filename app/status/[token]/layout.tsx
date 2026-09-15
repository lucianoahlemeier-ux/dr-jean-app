import type { Metadata } from "next";

// The status page is a client component and so can't export metadata itself;
// this layout carries it. Same reasoning as the report page: a status URL
// contains the same private token, so it must never be indexed either.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function StatusLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
