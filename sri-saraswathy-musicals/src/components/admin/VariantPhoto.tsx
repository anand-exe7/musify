"use client";
import { ImagePlus, Trash2, RefreshCw, Undo2 } from "lucide-react";
import { compressImage } from "@/lib/client/image";

/**
 * One variant's photo in the product editor: a clear thumbnail with Change / Remove
 * buttons that are always visible (not hover-only). Removing only marks it; the photo
 * is erased from the database when the product is saved. `original` is what is saved
 * now, so a removal can be undone before saving.
 */
export function VariantPhoto({
  value, original, onChange, onError,
}: {
  value: string | null | undefined;
  original: string | null | undefined;
  onChange: (photo: string | null) => void;
  onError: (message: string) => void;
}) {
  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try { onChange(await compressImage(f)); } catch (err) { onError(err instanceof Error ? err.message : "Could not process that image."); }
  };
  const btn = "flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold";

  if (value) {
    return (
      <div className="flex items-center gap-2">
        <a href={value} target="_blank" rel="noreferrer" title="Open full size" className="block h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-ink-200 bg-ink-100">
          <img src={value} alt="Variant photo" loading="lazy" decoding="async" className="h-full w-full object-cover" />
        </a>
        <div className="flex flex-col items-start gap-1">
          <label className={`${btn} cursor-pointer bg-ink-100 text-ink-700 hover:bg-ink-200`}>
            <RefreshCw className="h-3 w-3" /> Change
            <input type="file" accept="image/*" className="hidden" onChange={pick} />
          </label>
          <button type="button" onClick={() => onChange(null)} className={`${btn} bg-danger/10 text-danger hover:bg-danger/20`}>
            <Trash2 className="h-3 w-3" /> Remove
          </button>
        </div>
      </div>
    );
  }

  const removed = !!original;
  return (
    <div className="flex items-center gap-2">
      <label className="grid h-14 w-14 shrink-0 cursor-pointer place-items-center rounded-lg border border-dashed border-ink-300 bg-ivory-50 text-ink-400 hover:border-gold-500 hover:text-gold-600" title="Add a photo for this variant">
        <ImagePlus className="h-5 w-5" />
        <input type="file" accept="image/*" className="hidden" onChange={pick} />
      </label>
      {removed ? (
        <div className="flex flex-col items-start gap-1">
          <span className="text-[10px] font-semibold text-danger">Removed — deleted when you save</span>
          <button type="button" onClick={() => onChange(original ?? null)} className={`${btn} bg-ink-100 text-ink-700 hover:bg-ink-200`}><Undo2 className="h-3 w-3" /> Undo</button>
        </div>
      ) : (
        <span className="text-[10px] text-ink-400">No photo</span>
      )}
    </div>
  );
}
