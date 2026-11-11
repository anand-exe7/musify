import { LoadingPanel } from "@/components/admin/LoadState";

/** Shown the moment this page is opened, until it is ready. */
export default function Loading() {
  return (
    <div className="p-5 md:p-8">
      <LoadingPanel label="Opening Categories…" />
    </div>
  );
}
