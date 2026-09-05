"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, Check } from "lucide-react";

export default function SignupPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => router.push("/profile"), 900);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}
      className="mx-auto w-full max-w-lg border border-ink-100 bg-ivory-50 p-8 md:p-10">
      <p className="eyebrow">Create account</p>
      <h1 className="heading-serif mt-3 text-3xl text-ink-900">A house account, <em>opened.</em></h1>
      <p className="mt-3 text-sm text-ink-500">Sign up to save orders, receive care reminders, and access member-only fittings.</p>

      <form onSubmit={submit} className="mt-8 space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.18em] text-ink-500">First name</span>
            <input required className="w-full border border-ink-200 bg-ivory-50 px-4 py-3 text-sm focus:border-gold-500 focus:outline-none" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.18em] text-ink-500">Last name</span>
            <input required className="w-full border border-ink-200 bg-ivory-50 px-4 py-3 text-sm focus:border-gold-500 focus:outline-none" />
          </label>
        </div>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.18em] text-ink-500">Email</span>
          <input type="email" required className="w-full border border-ink-200 bg-ivory-50 px-4 py-3 text-sm focus:border-gold-500 focus:outline-none" />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.18em] text-ink-500">Phone (with country code)</span>
          <input type="tel" placeholder="+91 98876 54321" required className="w-full border border-ink-200 bg-ivory-50 px-4 py-3 text-sm focus:border-gold-500 focus:outline-none" />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.18em] text-ink-500">Password</span>
          <input type="password" required minLength={8} className="w-full border border-ink-200 bg-ivory-50 px-4 py-3 text-sm focus:border-gold-500 focus:outline-none" />
          <span className="mt-1.5 block text-[10px] uppercase tracking-widest text-ink-400">At least 8 characters</span>
        </label>

        <label className="flex items-start gap-2 text-sm text-ink-600">
          <input type="checkbox" required className="mt-0.5 h-4 w-4 accent-gold-500" />
          <span>I agree to the <Link href="#" className="text-gold-600 underline underline-offset-2">Terms</Link> and <Link href="#" className="text-gold-600 underline underline-offset-2">Privacy Policy</Link>.</span>
        </label>

        <button type="submit" disabled={loading} className="btn-gold-solid w-full">
          {loading ? "Creating account…" : (<>Create account <ArrowRight className="h-3.5 w-3.5" /></>)}
        </button>
      </form>

      <div className="mt-8 border-t border-ink-100 pt-6">
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-gold-600">What you get</p>
        <ul className="space-y-2 text-sm text-ink-600">
          {[
            "Order tracking & digital invoices",
            "Personal consultation with a luthier",
            "First access to new arrivals",
            "Members-only care workshops",
          ].map((b) => (
            <li key={b} className="flex items-start gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-gold-500" />
              {b}
            </li>
          ))}
        </ul>
      </div>

      <p className="mt-8 text-center text-sm text-ink-500">
        Already have one? <Link href="/auth/login" className="text-gold-600 underline underline-offset-4">Sign in</Link>
      </p>
    </motion.div>
  );
}
