import { MusicLoader } from "@/components/MusicLoader";

/** Route-level loading fallback (shown during navigation / streaming). */
export default function Loading() {
  return (
    <div className="fixed inset-0 z-[100]">
      <MusicLoader />
    </div>
  );
}
