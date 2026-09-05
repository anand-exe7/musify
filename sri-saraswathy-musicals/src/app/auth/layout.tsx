import Link from "next/link";
import { Logo } from "@/components/ui/Logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-ivory-50">
      <header className="border-b border-ink-100 bg-ivory-50">
        <div className="container-page flex items-center justify-between py-4">
          <Logo size="sm" />
          <Link href="/" className="text-xs uppercase tracking-[0.2em] text-ink-500 hover:text-gold-600">
            ← Back to shop
          </Link>
        </div>
      </header>
      <main className="flex min-h-[calc(100vh-72px)] items-center justify-center py-10">
        {children}
      </main>
    </div>
  );
}
