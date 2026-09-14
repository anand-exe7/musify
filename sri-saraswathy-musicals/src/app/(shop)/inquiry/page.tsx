"use client";
import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { MessageCircle, Phone, Mail, MapPin, CheckCircle2, ArrowRight, Send } from "lucide-react";
import { useInquiry, genInquiryId, INQUIRY_TOPICS, type Inquiry } from "@/lib/store/inquiry";
import { BUSINESS, waLink } from "@/lib/data/business";

export default function InquiryPage() {
  const addInquiry = useInquiry((s) => s.addInquiry);
  const [done, setDone] = useState<Inquiry | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    topic: INQUIRY_TOPICS[0],
    productInterest: "",
    message: "",
    branch: "Any" as "Branch 1" | "Branch 2" | "Any",
  });

  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const customerMessage = (i: Inquiry) =>
    `Hi ${BUSINESS.name}! 👋\n\n` +
    `I'd like to enquire about: *${i.topic}*\n` +
    (i.productInterest ? `Interested in: ${i.productInterest}\n` : "") +
    `\n${i.message}\n\n` +
    `— ${i.name}${i.email ? ` (${i.email})` : ""}\n(Ref: ${i.id})`;

  const submit = (openWhatsApp: boolean) => {
    if (!form.name.trim()) return setErr("Please enter your name.");
    if (!/\d{10}/.test(form.phone.replace(/\D/g, ""))) return setErr("Please enter a valid 10-digit mobile number.");
    if (!form.message.trim()) return setErr("Please tell us how we can help.");
    setErr(null);

    const inquiry: Inquiry = {
      id: genInquiryId(),
      createdAt: new Date().toISOString(),
      name: form.name.trim(),
      phone: form.phone.replace(/\D/g, ""),
      email: form.email.trim() || undefined,
      topic: form.topic,
      productInterest: form.productInterest.trim() || undefined,
      message: form.message.trim(),
      status: "new",
      branch: form.branch,
    };
    addInquiry(inquiry);
    setDone(inquiry);
    if (openWhatsApp) {
      window.open(waLink(BUSINESS.whatsapp, customerMessage(inquiry)), "_blank", "noopener,noreferrer");
    }
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const field =
    "w-full border border-ink-200 bg-ivory-50 px-4 py-3 text-sm text-ink-900 placeholder:text-ink-400 focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500/30";
  const label = "mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.2em] text-gold-700";

  return (
    <div className="container-page py-14 md:py-20">
      {/* Heading */}
      <div className="mx-auto max-w-2xl text-center">
        <p className="eyebrow centered">Talk to us</p>
        <h1 className="heading-serif mx-auto mt-5 text-display-lg text-ink-900">
          Make an <em>enquiry</em>.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-base text-ink-500 md:text-lg">
          Looking for a specific instrument, a price, a repair estimate or a bulk order? Send us a note and our team will get back to you — or continue the conversation straight away on WhatsApp.
        </p>
      </div>

      <div className="mx-auto mt-12 grid max-w-5xl gap-8 lg:grid-cols-[1fr_1.2fr] lg:gap-12">
        {/* Left — contact rail */}
        <div className="space-y-4">
          <div className="border border-ink-100 bg-ink-900 p-6 text-ivory-100">
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-gold-400">Prefer to chat?</p>
            <p className="heading-serif mt-3 text-2xl text-ivory-50">We&apos;re on WhatsApp.</p>
            <p className="mt-2 text-sm text-ivory-100/70">Message us directly and we&apos;ll help you pick, price or repair the right instrument.</p>
            <a
              href={waLink(BUSINESS.whatsapp, `Hi ${BUSINESS.name}! I have an enquiry.`)}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 inline-flex items-center gap-2 bg-[#128C4B] px-5 py-3 text-xs font-bold uppercase tracking-[0.18em] text-white transition-colors hover:bg-[#0f7a41]"
            >
              <MessageCircle className="h-4 w-4" /> Chat on WhatsApp
            </a>
          </div>

          <div className="space-y-4 border border-ink-100 bg-ivory-50 p-6">
            {BUSINESS.branches.map((b) => (
              <div key={b.key} className="border-b border-ink-100 pb-4 last:border-0 last:pb-0">
                <p className="font-serif italic text-gold-700">{b.city} · {b.area}</p>
                <p className="mt-1.5 flex items-start gap-2 text-sm text-ink-600"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold-500" />{b.street}, {b.zip}</p>
                <p className="mt-1 flex items-center gap-2 text-sm text-ink-600"><Phone className="h-3.5 w-3.5 shrink-0 text-gold-500" />{b.phone}</p>
              </div>
            ))}
            <p className="flex items-center gap-2 text-sm text-ink-600"><Mail className="h-3.5 w-3.5 shrink-0 text-gold-500" />{BUSINESS.email}</p>
          </div>
        </div>

        {/* Right — form / success */}
        <div>
          {done ? (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="border border-gold-300 bg-ivory-50 p-8 text-center"
            >
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-success/15 text-success">
                <CheckCircle2 className="h-7 w-7" />
              </span>
              <h2 className="heading-serif mt-5 text-3xl text-ink-900">Thank you, {done.name.split(" ")[0]}!</h2>
              <p className="mx-auto mt-3 max-w-md text-sm text-ink-600">
                Your enquiry <span className="font-semibold text-ink-900">{done.id}</span> has reached our team. We&apos;ll be in touch shortly. To speak with us now, continue on WhatsApp.
              </p>
              <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <a
                  href={waLink(BUSINESS.whatsapp, customerMessage(done))}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 bg-[#128C4B] px-6 py-3.5 text-xs font-bold uppercase tracking-[0.18em] text-white transition-colors hover:bg-[#0f7a41]"
                >
                  <MessageCircle className="h-4 w-4" /> Continue on WhatsApp
                </a>
                <Link href="/shop" className="btn-ghost">
                  Browse instruments <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
              <button
                onClick={() => { setDone(null); setForm({ name: "", phone: "", email: "", topic: INQUIRY_TOPICS[0], productInterest: "", message: "", branch: "Any" }); }}
                className="mt-6 text-xs font-medium uppercase tracking-[0.18em] text-ink-400 underline-offset-4 hover:text-gold-600 hover:underline"
              >
                Send another enquiry
              </button>
            </motion.div>
          ) : (
            <div className="border border-ink-100 bg-ivory-50 p-6 md:p-8">
              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label className={label}>Your Name *</label>
                  <input value={form.name} onChange={(e) => set({ name: e.target.value })} className={field} placeholder="Full name" />
                </div>
                <div>
                  <label className={label}>Mobile / WhatsApp *</label>
                  <input value={form.phone} onChange={(e) => set({ phone: e.target.value })} inputMode="numeric" className={field} placeholder="10-digit number" />
                </div>
                <div>
                  <label className={label}>Email (optional)</label>
                  <input value={form.email} onChange={(e) => set({ email: e.target.value })} className={field} placeholder="name@email.com" />
                </div>
                <div>
                  <label className={label}>Preferred Branch</label>
                  <select value={form.branch} onChange={(e) => set({ branch: e.target.value as typeof form.branch })} className={field}>
                    <option value="Any">Any branch</option>
                    {BUSINESS.branches.map((b) => (
                      <option key={b.key} value={b.key}>{b.city} · {b.area}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={label}>Enquiry About</label>
                  <select value={form.topic} onChange={(e) => set({ topic: e.target.value })} className={field}>
                    {INQUIRY_TOPICS.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className={label}>Instrument / Product</label>
                  <input value={form.productInterest} onChange={(e) => set({ productInterest: e.target.value })} className={field} placeholder="e.g. Saraswathi Veena" />
                </div>
                <div className="sm:col-span-2">
                  <label className={label}>How can we help? *</label>
                  <textarea value={form.message} onChange={(e) => set({ message: e.target.value })} rows={4} className={`${field} resize-none`} placeholder="Tell us what you're looking for…" />
                </div>
              </div>

              {err && <p className="mt-4 border border-danger/30 bg-danger/10 px-3 py-2 text-sm font-medium text-danger">{err}</p>}

              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <button onClick={() => submit(true)} className="flex flex-1 items-center justify-center gap-2 bg-[#128C4B] px-6 py-3.5 text-xs font-bold uppercase tracking-[0.18em] text-white transition-colors hover:bg-[#0f7a41]">
                  <MessageCircle className="h-4 w-4" /> Submit &amp; WhatsApp
                </button>
                <button onClick={() => submit(false)} className="flex flex-1 items-center justify-center gap-2 border border-ink-300/60 px-6 py-3.5 text-xs font-bold uppercase tracking-[0.18em] text-ink-900 transition-colors hover:border-gold-500 hover:text-gold-600">
                  <Send className="h-4 w-4" /> Submit Enquiry
                </button>
              </div>
              <p className="mt-3 text-center text-[11px] text-ink-400">Your details go straight to our team. No spam, ever.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
