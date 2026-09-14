"use client";
import { useEffect, useState } from "react";
import { Truck, Plus, Phone, MapPin, Hash } from "lucide-react";
import { useVendors, vendorMatches } from "@/lib/store/vendors";
import { genDocId } from "@/lib/ids";
import type { Vendor } from "@/types";
import { cn } from "@/lib/utils";

const blankForm = { code: "", name: "", phone: "", address: "", gst: "" };

export default function VendorsPage() {
  const vendors = useVendors((s) => s.vendors);
  const hydrate = useVendors((s) => s.hydrate);
  const addVendor = useVendors((s) => s.addVendor);

  const [form, setForm] = useState(blankForm);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const notify = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2500);
  };

  const submit = async () => {
    if (!form.name.trim()) return notify("Vendor name is required.");
    setSaving(true);
    const code = form.code.trim() || `V-${String(vendors.length + 1).padStart(3, "0")}`;
    const vendor: Vendor = {
      id: genDocId("VEN"),
      code,
      name: form.name.trim(),
      phone: form.phone.trim(),
      address: form.address.trim(),
      gst: form.gst.trim(),
      email: "",
      createdAt: new Date().toISOString(),
      outstanding: 0,
      totalPurchases: 0,
    };
    const saved = await addVendor(vendor);
    setSaving(false);
    if (!saved) return notify("Couldn't save — is the vendor code already taken?");
    setForm(blankForm);
    notify(`Vendor ${saved.name} added`);
  };

  const rows = vendors.filter((v) => vendorMatches(v, query));
  const field = "w-full rounded-lg border border-ink-200 bg-ivory-50 px-3 py-2.5 text-sm text-ink-900 focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-500/20";
  const label = "mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500";

  return (
    <div className="p-5 md:p-8">
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[70] -translate-x-1/2 rounded-full bg-ink-900 px-5 py-3 text-sm font-medium text-ivory-50 shadow-lg">{toast}</div>
      )}

      <div className="mb-6 border-l-4 border-ink-900 pl-4">
        <h1 className="text-2xl font-bold text-ink-900">Vendors</h1>
        <p className="mt-1 text-sm text-ink-500">Suppliers you receive stock from · shared across both branches</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        {/* Create */}
        <section className="rounded-2xl border border-ink-100 bg-ivory-50 p-5 md:p-6 lg:sticky lg:top-24 lg:self-start">
          <div className="mb-4 flex items-center gap-2">
            <Plus className="h-4 w-4 text-gold-600" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-ink-900">Add Vendor</h2>
          </div>
          <div className="space-y-4">
            <div><label className={label}>Vendor Name *</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={field} placeholder="e.g. Naadam Instruments" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={label}>Vendor Code</label><input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className={field} placeholder="auto" /></div>
              <div><label className={label}>Phone</label><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={field} inputMode="numeric" /></div>
            </div>
            <div><label className={label}>Address / Location</label><textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} rows={2} className={cn(field, "resize-none")} /></div>
            <div><label className={label}>GSTIN (optional)</label><input value={form.gst} onChange={(e) => setForm({ ...form, gst: e.target.value.toUpperCase() })} className={cn(field, "font-mono")} /></div>
            <button onClick={submit} disabled={saving} className="w-full rounded-xl bg-ink-900 py-3 text-sm font-semibold text-ivory-50 transition-colors hover:bg-ink-800 disabled:opacity-60">
              {saving ? "Saving…" : "Add Vendor"}
            </button>
          </div>
        </section>

        {/* List */}
        <section>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name, code or phone…" className="mb-3 w-full rounded-xl border border-ink-200 bg-ivory-50 px-4 py-2.5 text-sm focus:border-gold-500 focus:outline-none" />
          <div className="grid gap-3 sm:grid-cols-2">
            {rows.map((v) => (
              <div key={v.id} className="rounded-xl border border-ink-100 bg-ivory-50 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Truck className="h-4 w-4 shrink-0 text-gold-600" />
                    <p className="font-semibold text-ink-900">{v.name}</p>
                  </div>
                  {v.code && <span className="flex items-center gap-1 rounded bg-ink-900/5 px-1.5 py-0.5 text-[10px] font-bold text-ink-500"><Hash className="h-2.5 w-2.5" />{v.code}</span>}
                </div>
                <div className="mt-2 space-y-1 text-xs text-ink-500">
                  {v.phone && <p className="flex items-center gap-1.5"><Phone className="h-3 w-3" />{v.phone}</p>}
                  {v.address && <p className="flex items-start gap-1.5"><MapPin className="mt-0.5 h-3 w-3 shrink-0" />{v.address}</p>}
                  {v.gst && <p className="font-mono text-[11px] text-ink-400">{v.gst}</p>}
                </div>
              </div>
            ))}
            {rows.length === 0 && <p className="col-span-full py-12 text-center text-sm text-ink-400">No vendors yet. Add your first supplier.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
