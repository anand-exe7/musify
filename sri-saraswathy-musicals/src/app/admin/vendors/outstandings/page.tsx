import { redirect } from "next/navigation";

/** Vendor Outstandings now lives on the Vendor Bills page, under "By vendor". Old links and bookmarks still work. */
export default async function Page({ searchParams }: { searchParams: Promise<{ vendor?: string }> }) {
  const { vendor } = await searchParams;
  redirect(`/admin/purchases/invoices?view=vendors${vendor ? `&vendor=${encodeURIComponent(vendor)}` : ""}`);
}
