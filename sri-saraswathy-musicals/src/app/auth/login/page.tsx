"use client";
import Link from "next/link";
import Image from "next/image";
import { Suspense } from "react";
import { motion } from "framer-motion";
import { useSearchParams } from "next/navigation";

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

const ERRORS: Record<string, string> = {
  not_configured: "Google sign-in isn't set up yet. Add your Google OAuth credentials to .env.local.",
  state: "Your sign-in link expired or didn't match. Please try again.",
  oauth: "Google sign-in was cancelled or failed. Please try again.",
  callback: "We couldn't complete sign-in. Please try again.",
  unverified: "Your Google email isn't verified. Verify it with Google, then try again.",
};

function LoginInner() {
  const params = useSearchParams();
  const redirect = params.get("redirect") || "/profile";
  const error = params.get("error");
  const googleHref = `/api/auth/google?redirect=${encodeURIComponent(redirect)}`;

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
            Sign in with Google to see your orders, saved pieces, and to speak to a luthier about an instrument on your wishlist.
          </p>
        </div>

        <div className="relative p-10">
          <blockquote className="font-serif italic text-lg text-ivory-100/90">
            &ldquo;Sri Saraswathy is where I sent my son for his first sitar. It is where he will send his.&rdquo;
            <footer className="mt-2 text-xs uppercase tracking-widest text-gold-400">— Ustad P. Nair</footer>
          </blockquote>
        </div>
      </motion.div>

      {/* Right — Google-only sign in */}
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5, delay: 0.08 }}
        className="flex flex-col justify-center border border-ink-100 bg-ivory-50 p-8 md:p-10"
      >
        <p className="eyebrow">Sign in</p>
        <h2 className="heading-serif mt-3 text-3xl text-ink-900">
          Enter the <em>house.</em>
        </h2>
        <p className="mt-3 text-sm text-ink-500">
          We use Google to sign you in — no password to remember. Your account is created automatically the first time.
        </p>

        {error && (
          <p className="mt-6 border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
            {ERRORS[error] ?? "Something went wrong signing you in. Please try again."}
          </p>
        )}

        <a href={googleHref} className="btn-gold-solid mt-8 w-full justify-center">
          <GoogleGlyph />
          Continue with Google
        </a>

        <p className="mt-6 text-center text-xs text-ink-400">
          By continuing you agree to our{" "}
          <Link href="#" className="text-gold-600 underline underline-offset-2">Terms</Link> and{" "}
          <Link href="#" className="text-gold-600 underline underline-offset-2">Privacy Policy</Link>.
        </p>

        <p className="mt-8 text-center text-[10px] uppercase tracking-widest text-ink-400">
          Staff &amp; branches sign in the same way — admin access is granted to authorised accounts.
        </p>
      </motion.div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="container-narrow py-24 text-center text-ink-400">Loading…</div>}>
      <LoginInner />
    </Suspense>
  );
}
