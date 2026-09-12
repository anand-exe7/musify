"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import { Check } from "lucide-react";

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

export default function SignupPage() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="mx-auto w-full max-w-lg border border-ink-100 bg-ivory-50 p-8 md:p-10"
    >
      <p className="eyebrow">Create account</p>
      <h1 className="heading-serif mt-3 text-3xl text-ink-900">A house account, <em>opened.</em></h1>
      <p className="mt-3 text-sm text-ink-500">
        No forms, no passwords — continue with Google and your account is created automatically.
      </p>

      <a href="/api/auth/google?redirect=%2Fprofile" className="btn-gold-solid mt-8 w-full justify-center">
        <GoogleGlyph />
        Continue with Google
      </a>

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
