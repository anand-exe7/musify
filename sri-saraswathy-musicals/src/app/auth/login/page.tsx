"use client";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Eye, EyeOff, ArrowRight } from "lucide-react";
import { useAuth } from "@/lib/store/auth";

function GoogleGlyph() {
  return (
    <svg viewBox="0 0 48 48" className="h-4 w-4" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const loginUser = useAuth((s) => s.login);
  const [showPw, setShowPw] = useState(false);
  const [pw, setPw] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    loginUser();
    setTimeout(() => router.push("/profile"), 650);
  };

  const continueWithGoogle = () => {
    loginUser();
    router.push("/profile");
  };

  return (
    <div className="container-narrow grid gap-10 md:grid-cols-2 md:gap-16">
      {/* Left — visual */}
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5 }}
        className="relative hidden flex-col justify-between overflow-hidden border border-ink-100 text-ivory-100 md:flex"
      >
        <Image
          src="https://images.unsplash.com/photo-1465847899084-d164df4dedc6?ixlib=rb-4.0.3&auto=format&fit=crop&w=1400&q=80"
          alt=""
          fill
          sizes="(max-width: 768px) 0vw, 480px"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/60 to-ink-950/30" />

        <div className="relative p-10">
          <p className="eyebrow !text-gold-400">Welcome back</p>
          <h1 className="heading-serif mt-4 text-4xl">
            The shop is <em>open.</em>
          </h1>
          <p className="mt-4 max-w-sm text-ivory-100/80">
            Sign in to see your orders, saved pieces, and to speak to a luthier about an instrument on your wishlist.
          </p>
        </div>

        <div className="relative p-10">
          <blockquote className="font-serif italic text-lg text-ivory-100/90">
            &ldquo;Sri Saraswathy is where I sent my son for his first sitar. It is where he will send his.&rdquo;
            <footer className="mt-2 text-xs uppercase tracking-widest text-gold-400">— Ustad P. Nair</footer>
          </blockquote>
        </div>
      </motion.div>

      {/* Right — form */}
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5, delay: 0.08 }}
        className="border border-ink-100 bg-ivory-50 p-8 md:p-10"
      >
        <p className="eyebrow">Sign in</p>
        <h2 className="heading-serif mt-3 text-3xl text-ink-900">
          Enter the <em>house.</em>
        </h2>
        <form onSubmit={submit} className="mt-8 space-y-5">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.18em] text-ink-500">Email or phone</span>
            <input
              type="text"
              defaultValue="arjun.rao@gmail.com"
              required
              className="w-full border border-ink-200 bg-ivory-50 px-4 py-3 text-sm text-ink-900 focus:border-gold-500 focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.18em] text-ink-500">Password</span>
            <div className="relative">
              <input
                type={showPw ? "text" : "password"}
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                placeholder="Enter your password"
                required
                className="w-full border border-ink-200 bg-ivory-50 px-4 py-3 pr-11 text-sm text-ink-900 placeholder:text-ink-400 focus:border-gold-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                aria-label={showPw ? "Hide password" : "Show password"}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 transition-colors hover:text-gold-600"
              >
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

        <div className="my-8 divider-gold text-[10px] uppercase tracking-widest text-ink-400">or</div>

        <button type="button" onClick={continueWithGoogle} className="btn-ghost w-full">
          <GoogleGlyph />
          Continue with Google
        </button>

        <p className="mt-8 text-center text-sm text-ink-500">
          New here?{" "}
          <Link href="/auth/signup" className="text-gold-600 underline underline-offset-4 hover:text-gold-700">
            Create an account
          </Link>
        </p>
        <p className="mt-4 text-center text-[10px] uppercase tracking-widest text-ink-400">
          Staff & branches?{" "}
          <Link href="/admin" className="text-gold-600 hover:underline">
            Admin panel →
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
