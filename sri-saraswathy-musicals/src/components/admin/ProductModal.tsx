"use client";
import { useRef, useState } from "react";
import { X, Plus, Trash2, ImagePlus } from "lucide-react";
import { usePOS, type InvProduct, type Variant } from "@/lib/store/pos";
import { cn } from "@/lib/utils";

const DEPTS = ["Indian", "Western", "Unisex"];

function blankProduct(): InvProduct {
  return {
    id: `p${Date.now()}`,
    name: "",
    category: "Strings",
    department: "Indian",
    photo: undefined,
    basePrice: 0,
    baseWeight: 500,
    description: "",
    active: true,
    discountLabel: "",
    newArrival: false,
    lowStockAt: 4,
    gstRate: 18,
    hsn: "",
    isGstApplicable: true,
    variants: [{ attr: "Standard", finish: "Natural", price: 0, weight: 500, stock: 0 }],
  };
}

/** GST rate options offered in the product form; `null` = non-GST product. */
const GST_RATES: { label: string; value: number | null }[] = [
  { label: "Non-GST", value: null },
  { label: "0%", value: 0 },
  { label: "5%", value: 5 },
  { label: "12%", value: 12 },
  { label: "18%", value: 18 },
  { label: "28%", value: 28 },
];

export function ProductModal({ product, onClose }: { product: InvProduct | null; onClose: () => void }) {
  const addProduct = usePOS((s) => s.addProduct);
  const updateProduct = usePOS((s) => s.updateProduct);
  const CATEGORIES = usePOS((s) => s.categories);
  const isNew = !product;
  const [draft, setDraft] = useState<InvProduct>(product ? structuredClone(product) : blankProduct());
  const fileRef = useRef<HTMLInputElement>(null);

  const set = (patch: Partial<InvProduct>) => setDraft((d) => ({ ...d, ...patch }));
  const setVariant = (i: number, patch: Partial<Variant>) =>
    setDraft((d) => ({ ...d, variants: d.variants.map((v, idx) => (idx === i ? { ...v, ...patch } : v)) }));
  const addRow = () =>
    setDraft((d) => ({ ...d, variants: [...d.variants, { attr: "", finish: "", price: d.basePrice, weight: d.baseWeight, stock: 0 }] }));
  const removeRow = (i: number) => setDraft((d) => ({ ...d, variants: d.variants.filter((_, idx) => idx !== i) }));

  const onUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => set({ photo: reader.result as string });
    reader.readAsDataURL(file);
  };

  const save = () => {
    const clean: InvProduct = {
      ...draft,
      name: draft.name.trim() || "Untitled product",
      basePrice: Number(draft.basePrice) || 0,
      isGstApplicable: draft.gstRate != null,
    };
    if (isNew) addProduct(clean);
    else updateProduct(clean.id, clean);
    onClose();
  };

  const field = "w-full rounded-lg border border-ink-200 bg-ivory-50 px-3 py-2.5 text-sm text-ink-900 focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-500/20";
  const label = "mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500";

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-ink-950/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="my-4 w-full max-w-3xl rounded-2xl bg-ivory-50 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* header */}
        <div className="flex items-center justify-between border-b border-ink-100 px-6 py-4">
          <h2 className="text-lg font-bold text-ink-900">{isNew ? "Add Product" : "Edit Product"}</h2>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full text-ink-500 hover:bg-ink-900/5"><X className="h-4 w-4" /></button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-6 py-5">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Basic */}
            <div>
              <p className="mb-3 text-sm font-bold text-ink-900">Basic Details</p>
              <label className={label}>Product Name</label>
              <input value={draft.name} onChange={(e) => set({ name: e.target.value })} className={field} placeholder="e.g. Saraswathi Veena" />
              <label className={cn(label, "mt-4")}>Description</label>
              <textarea value={draft.description} onChange={(e) => set({ description: e.target.value })} rows={4} className={cn(field, "resize-none")} />
              <p className="mb-2 mt-4 text-sm font-bold text-ink-900">Media Gallery</p>
              <div className="flex items-center gap-3">
                <div className="relative h-20 w-20 overflow-hidden rounded-lg border border-ink-200 bg-ink-100">
                  {draft.photo && <img src={draft.photo} alt="" className="h-full w-full object-cover" />}
                  {draft.photo && <span className="absolute left-1 top-1 rounded bg-ink-900/80 px-1 py-0.5 text-[7px] font-bold uppercase text-ivory-50">Primary</span>}
                </div>
                <button onClick={() => fileRef.current?.click()} className="grid h-20 w-20 place-items-center rounded-lg border border-dashed border-ink-300 text-ink-400 hover:border-gold-500 hover:text-gold-600">
                  <ImagePlus className="h-6 w-6" />
                </button>
                <input ref={fileRef} type="file" accept="image/*" onChange={onUpload} className="hidden" />
              </div>
            </div>

            {/* Org & pricing */}
            <div>
              <p className="mb-3 text-sm font-bold text-ink-900">Organization &amp; Pricing</p>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={label}>Category</label><select value={draft.category} onChange={(e) => set({ category: e.target.value })} className={field}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></div>
                <div><label className={label}>Department</label><select value={draft.department} onChange={(e) => set({ department: e.target.value })} className={field}>{DEPTS.map((c) => <option key={c}>{c}</option>)}</select></div>
                <div><label className={label}>Base Price (₹)</label><input type="number" value={draft.basePrice || ""} onChange={(e) => set({ basePrice: Number(e.target.value) })} className={field} /></div>
                <div><label className={label}>Base Weight (g)</label><input type="number" value={draft.baseWeight || ""} onChange={(e) => set({ baseWeight: Number(e.target.value) })} className={field} /></div>
              </div>
              <label className={cn(label, "mt-4")}>Discount Label</label>
              <input value={draft.discountLabel ?? ""} onChange={(e) => set({ discountLabel: e.target.value })} className={field} placeholder="e.g. Festive Offer" />
              <label className="mt-4 flex items-center gap-2 text-sm text-ink-700">
                <input type="checkbox" checked={!!draft.newArrival} onChange={(e) => set({ newArrival: e.target.checked })} className="h-4 w-4 accent-gold-500" /> Mark as &quot;New Arrival&quot;
              </label>

              {/* visibility toggle */}
              <div className="mt-4 flex items-center justify-between rounded-lg border border-ink-100 bg-[#FAF7EF] px-3 py-2.5">
                <div>
                  <p className="text-sm font-semibold text-ink-900">Visible to customers</p>
                  <p className="text-xs text-ink-500">{draft.active ? "Shown in the storefront catalog" : "Hidden / marked out of stock"}</p>
                </div>
                <button onClick={() => set({ active: !draft.active })} className={cn("relative h-6 w-11 rounded-full transition-colors", draft.active ? "bg-success" : "bg-ink-300")}>
                  <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all", draft.active ? "left-[22px]" : "left-0.5")} />
                </button>
              </div>

              <p className="mb-2 mt-4 text-sm font-bold text-ink-900">Inventory Alerts</p>
              <label className={label}>Low-stock alert at</label>
              <input type="number" value={draft.lowStockAt} onChange={(e) => set({ lowStockAt: Number(e.target.value) })} className={field} />

              <p className="mb-2 mt-4 text-sm font-bold text-ink-900">Tax (GST)</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={label}>Default GST Rate</label>
                  <select
                    value={draft.gstRate == null ? "none" : String(draft.gstRate)}
                    onChange={(e) => {
                      const v = e.target.value === "none" ? null : Number(e.target.value);
                      set({ gstRate: v, isGstApplicable: v != null });
                    }}
                    className={field}
                  >
                    {GST_RATES.map((g) => (
                      <option key={g.label} value={g.value == null ? "none" : String(g.value)}>{g.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={label}>HSN / SAC Code</label>
                  <input value={draft.hsn ?? ""} onChange={(e) => set({ hsn: e.target.value })} className={field} placeholder="e.g. 9207" />
                </div>
              </div>
              <p className="mt-1.5 text-[11px] text-ink-400">
                {draft.gstRate == null
                  ? "Non-GST — never taxed, even on a GST bill."
                  : "Default rate at the POS; editable per line when billing."}
              </p>
            </div>
          </div>

          {/* Variants */}
          <div className="mt-6 rounded-xl border border-ink-100 bg-[#FAF7EF] p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-ink-900">Product Variants</p>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">Manage models, finishes, and specific inventory</p>
              </div>
              <button onClick={addRow} className="flex items-center gap-1.5 rounded-lg bg-ink-900 px-3 py-2 text-xs font-semibold text-ivory-50 hover:bg-ink-800"><Plus className="h-3.5 w-3.5" /> Add Row</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-sm">
                <thead><tr className="text-left text-[9px] font-bold uppercase tracking-wider text-ink-400"><th className="pb-2">Variant</th><th>Finish</th><th>Price (₹)</th><th>Weight (g)</th><th>Stock</th><th className="text-right">Actions</th></tr></thead>
                <tbody>
                  {draft.variants.map((v, i) => (
                    <tr key={i} className={cn(v.disabled && "opacity-50")}>
                      <td className="pr-2 py-1.5"><input value={v.attr} onChange={(e) => setVariant(i, { attr: e.target.value })} className="w-28 rounded-lg border border-ink-200 bg-ivory-50 px-2 py-2 text-sm focus:border-gold-500 focus:outline-none" /></td>
                      <td className="pr-2"><input value={v.finish} onChange={(e) => setVariant(i, { finish: e.target.value })} className="w-24 rounded-lg border border-ink-200 bg-ivory-50 px-2 py-2 text-sm focus:border-gold-500 focus:outline-none" /></td>
                      <td className="pr-2"><input type="number" value={v.price || ""} onChange={(e) => setVariant(i, { price: Number(e.target.value) })} className="w-24 rounded-lg border border-ink-200 bg-ivory-50 px-2 py-2 text-sm focus:border-gold-500 focus:outline-none" /></td>
                      <td className="pr-2"><input type="number" value={v.weight || ""} onChange={(e) => setVariant(i, { weight: Number(e.target.value) })} className="w-20 rounded-lg border border-ink-200 bg-ivory-50 px-2 py-2 text-sm focus:border-gold-500 focus:outline-none" /></td>
                      <td className="pr-2"><input type="number" value={v.stock} onChange={(e) => setVariant(i, { stock: Number(e.target.value) })} className="w-20 rounded-lg border border-ink-200 bg-ivory-50 px-2 py-2 text-sm focus:border-gold-500 focus:outline-none" /></td>
                      <td className="text-right"><div className="flex items-center justify-end gap-1"><button onClick={() => setVariant(i, { disabled: !v.disabled })} className={cn("rounded px-2 py-1 text-[10px] font-bold uppercase", v.disabled ? "bg-success/15 text-success" : "bg-ink-100 text-ink-500")}>{v.disabled ? "Enable" : "Disable"}</button><button onClick={() => removeRow(i)} className="grid h-7 w-7 place-items-center rounded text-danger hover:bg-danger/10"><Trash2 className="h-3.5 w-3.5" /></button></div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* footer */}
        <div className="flex justify-end gap-2 border-t border-ink-100 px-6 py-4">
          <button onClick={onClose} className="rounded-xl border border-ink-200 px-5 py-2.5 text-sm font-semibold text-ink-700 hover:bg-ink-900/5">Cancel</button>
          <button onClick={save} className="rounded-xl bg-ink-900 px-5 py-2.5 text-sm font-semibold text-ivory-50 hover:bg-ink-800">{isNew ? "Create Product" : "Save Changes"}</button>
        </div>
      </div>
    </div>
  );
}
