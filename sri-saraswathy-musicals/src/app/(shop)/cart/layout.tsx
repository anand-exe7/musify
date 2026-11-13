import type { Metadata } from "next";

// Per-customer page: keep it out of search results.
export const metadata: Metadata = {
  title: "Cart",
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
