import { LoadingPanel } from "@/components/admin/LoadState";

/** Shown while a quotation is fetched on the server, so opening one never looks like a blank page. */
export default function Loading() {
  return (
    <div className="p-5 md:p-8">
      <LoadingPanel label="Loading quotation…" />
    </div>
  );
}
