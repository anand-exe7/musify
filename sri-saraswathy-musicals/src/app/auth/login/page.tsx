"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { InstrumentSVG } from "@/components/ui/InstrumentSVG";
import { Eye, EyeOff, ArrowRight } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => router.push("/profile"), 900);
  };

  return (
    <div className="container-narrow grid gap-10 md:grid-cols-2 md:gap-16">
      {/* Left — visual */}
      <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6 }}
        className="hidden flex-col justify-between border border-ink-100 bg-gradient-to-br from-ink-900 to-ink-800 p-10 text-ivory-100 md:flex">
        <div>
          <p className="eyebrow !text-gold-400">Welcome back</p>
          <h1 className="heading-serif mt-4 text-4xl">
            The shop is <em>open.</em>
          </h1>
          <p className="mt-4 max-w-sm text-ivory-100/70">
            Sign in to see your orders, saved pieces, and to speak to a luthier about an instrument on your wishlist.
          </p>
        </div>
        <div className="relative mx-auto h-56 w-full max-w-xs animate-float">
          <InstrumentSVG instrument="veena" />
        </div>
        <blockquote className="mt-8 font-serif italic text-lg text-ivory-100/80">
          "Sri Saraswathy is where I sent my son for his first sitar. It is where he will send his."
          <footer className="mt-2 text-xs uppercase tracking-widest text-gold-400">— Ustad P. Nair</footer>
        </blockquote>
      </motion.div>

      {/* Right — form */}
      <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6, delay: 0.1 }}
        className="border border-ink-100 bg-ivory-50 p-8 md:p-10">
        <p className="eyebrow">Sign in</p>
        <h2 className="heading-serif mt-3 text-3xl text-ink-900">Enter the <em>house.</em></h2>
        <form onSubmit={submit} className="mt-8 space-y-5">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.18em] text-ink-500">Email or phone</span>
            <input type="text" defaultValue="arjun.rao@gmail.com" required className="w-full border border-ink-200 bg-ivory-50 px-4 py-3 text-sm text-ink-900 focus:border-gold-500 focus:outline-none" />
          </label>
          <label className="block">
            <div className="flex items-center justify-between">
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.18em] text-ink-500">Password</span>
              <Link href="#" className="mb-1.5 text-[10px] uppercase tracking-widest text-gold-600 hover:underline">Forgot?</Link>
            </div>
            <div className="relative">
              <input type={showPw ? "text" : "password"} defaultValue="••••••••" required className="w-full border border-ink-200 bg-ivory-50 px-4 py-3 pr-11 text-sm text-ink-900 focus:border-gold-500 focus:outline-none" />
              <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-700">
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </label>
          <label className="flex items-center gap-2 text-sm text-ink-600">
            <input type="checkbox" className="h-4 w-4 accent-gold-500" defaultChecked />
            Keep me signed in
          </label>
          <button type="submit" disabled={loading} className="btn-gold-solid w-full">
            {loading ? "Signing in…" : (<>Sign in <ArrowRight className="h-3.5 w-3.5" /></>)}
          </button>
        </form>

        <div className="my-8 divider-gold text-[10px] uppercase tracking-widest text-ink-400">or continue with</div>

        <div className="grid grid-cols-2 gap-3">
          <button className="btn-ghost">Google</button>
          <button className="btn-ghost">Phone OTP</button>
        </div>

        <p className="mt-8 text-center text-sm text-ink-500">
          New here? <Link href="/auth/signup" className="text-gold-600 underline underline-offset-4 hover:text-gold-700">Create an account</Link>
        </p>
        <p className="mt-4 text-center text-[10px] uppercase tracking-widest text-ink-400">
          Staff & branches? <Link href="/admin" className="text-gold-600 hover:underline">Admin panel →</Link>
        </p>
      </motion.div>
    </div>
  );
}
