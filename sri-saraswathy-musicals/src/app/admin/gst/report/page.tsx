"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";
import type { Invoice } from "@/types";
import { useGst } from "@/lib/store/gst";
import { BUSINESS, branchInfo } from "@/lib/data/business";
import {
  buildGstr1, buildGstr3b, stateWithCode, MONTHS, type Period,
} from "@/lib/gst/report";
import {
  Gstr1Sheet, Gstr3bSheet, GST_REPORT_PRINT_CSS,
  type ReportBusiness, type ReportPeriod,
} from "@/components/gst/GstReportSheet";

type ReportType = "gstr1" | "gstr3b";

/** Now, formatted like the statutory footer: "Sep 07,2026 at 09:25 AM". */
function generatedStamp(now = new Date()): string {
  const mon = now.toLocaleString("en-US", { month: "short" });
  const dd = String(now.getDate()).padStart(2, "0");
  let h = now.getHours();
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${mon} ${dd},${now.getFullYear()} at ${String(h).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")} ${ap}`;
}

function ReportInner() {
  const params = useSearchParams();
  const gst = useGst();

  const type: ReportType = params.get("type") === "gstr3b" ? "gstr3b" : "gstr1";
  const now = new Date();
  const num = (key: string, fallback: number) => {
    const v = Number(params.get(key));
    return Number.isFinite(v) ? v : fallback;
  };
  const period: Period = {
    fromYear: num("fy", now.getFullYear()),
    fromMonth: num("fm", now.getMonth()),
    toYear: num("ty", now.getFullYear()),
    toMonth: num("tm", now.getMonth()),
  };

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let alive = true;
    fetch("/api/invoices")
      .then((r) => { if (!r.ok) throw new Error("invoices"); return r.json(); })
      .then((data) => { if (!alive) return; setInvoices(Array.isArray(data) ? data : []); setState("ready"); })
      .catch(() => { if (alive) setState("error"); });
    return () => { alive = false; };
  }, []);

  const gstr1 = useMemo(
    () => buildGstr1(invoices, period, { standardRate: gst.standardRate, homeState: gst.homeState }),
    [invoices, period.fromYear, period.fromMonth, period.toYear, period.toMonth, gst.standardRate, gst.homeState],
  );
  const gstr3b = useMemo(() => buildGstr3b(gstr1), [gstr1]);

  // Registered person = the Tamil Nadu GSTIN; its principal place is the Porur
  // branch (Branch 2), matching what the shop files.
  const reg = branchInfo("Branch 2");
  const phone10 = reg.phone.replace(/\D/g, "").slice(-10);
  const business: ReportBusiness = {
    name: BUSINESS.name,
    address: `${reg.street}, ${reg.area}, ${reg.zip}`,
    phone: phone10,
    email: BUSINESS.email,
    gstin: BUSINESS.gstin,
    legalName: BUSINESS.name,
    tradeName: "",
    stateLabel: stateWithCode(gst.homeState),
    website: BUSINESS.website,
  };

  const reportPeriod: ReportPeriod = {
    fromYear: period.fromYear,
    toYear: period.toYear,
    fromMonth: MONTHS[period.fromMonth] ?? "",
    toMonth: MONTHS[period.toMonth] ?? "",
  };

  const title = type === "gstr1" ? "GSTR-1" : "GSTR-3B";

  return (
    <div className="p-5 md:p-8">
      <style>{GST_REPORT_PRINT_CSS}</style>

      {/* Toolbar (hidden on print) */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link href="/admin/gst" className="inline-flex items-center gap-2 text-sm font-medium text-ink-500 hover:text-gold-600">
          <ArrowLeft className="h-4 w-4" /> Back to GST
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-ink-400">
            {title} · {reportPeriod.fromMonth} {reportPeriod.fromYear}
            {(period.fromMonth !== period.toMonth || period.fromYear !== period.toYear) && ` – ${reportPeriod.toMonth} ${reportPeriod.toYear}`}
          </span>
          <button
            onClick={() => window.print()}
            disabled={state !== "ready"}
            className="flex items-center gap-2 rounded-xl border border-ink-200 px-4 py-2.5 text-sm font-semibold text-ink-700 hover:border-gold-500 hover:text-gold-600 disabled:opacity-40"
          >
            <Printer className="h-4 w-4" /> Print / Save PDF
          </button>
        </div>
      </div>

      {state === "loading" ? (
        <div className="grid place-items-center rounded-2xl border border-ink-100 bg-ivory-50 py-24 text-center text-ink-400">
          Loading ledger…
        </div>
      ) : state === "error" ? (
        <div className="grid place-items-center rounded-2xl border border-ink-100 bg-ivory-50 py-24 text-center">
          <p className="text-sm font-bold text-ink-900">You appear to be offline</p>
          <p className="mt-1 text-xs text-ink-500">We couldn&apos;t reach the server to build the return.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-ink-100 bg-white p-2 shadow-card md:p-4">
          {type === "gstr1" ? (
            <Gstr1Sheet data={gstr1} business={business} period={reportPeriod} />
          ) : (
            <Gstr3bSheet data={gstr3b} business={business} period={reportPeriod} generated={generatedStamp()} />
          )}
        </div>
      )}
    </div>
  );
}

export default function GstReportPage() {
  return (
    <Suspense fallback={<div className="p-8 text-ink-400">Loading…</div>}>
      <ReportInner />
    </Suspense>
  );
}
