"use client";
import { useEffect, useRef, useState } from "react";
import { useInventory } from "@/lib/store/pos";
import { useVendors } from "@/lib/store/vendors";
import { useAllSales } from "@/lib/client/sales";
import { fetchJson } from "@/lib/client/api";
import { downloadCsv, stamp } from "@/lib/csv";
import { itemHistoryRows, categoryHistoryRows, type PurchaseRecord } from "@/lib/reports/inventory";

export type HistoryJob =
  | { kind: "one"; id: string; name: string }
  | { kind: "items"; query: string }
  | { kind: "category" };

/**
 * Builds a purchase & sales history CSV. It needs every sale, every purchase and the whole catalogue, so it is
 * mounted only while an export is running — the Inventory screen itself never loads any of that.
 */
export function HistoryExport({ job, range, onDone, onError }: {
  job: HistoryJob;
  range: { from?: string; to?: string };
  onDone: () => void;
  onError: (message: string) => void;
}) {
  const products = useInventory();
  const invLoaded = products.length > 0;
  const { sales, loading } = useAllSales();
  const vendors = useVendors((s) => s.vendors);
  const hydrateVendors = useVendors((s) => s.hydrate);
  const [inwards, setInwards] = useState<PurchaseRecord[] | null>(null);
  const [ids, setIds] = useState<string[] | null>(job.kind === "items" ? null : []);
  const ran = useRef(false);

  useEffect(() => {
    void hydrateVendors();
    fetchJson<PurchaseRecord[]>("/api/stock-inward")
      .then((d) => setInwards(Array.isArray(d) ? d : []))
      .catch(() => onError("Couldn't load purchases for the export."));
    if (job.kind === "items") {
      fetchJson<string[]>(`/api/inventory?view=ids&${job.query}`)
        .then((d) => setIds(Array.isArray(d) ? d : []))
        .catch(() => onError("Couldn't work out which products to export."));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (ran.current || loading || !inwards || !ids || !invLoaded) return;
    ran.current = true;
    const vendorName = (id: string) => vendors.find((v) => v.id === id)?.name ?? id;
    if (job.kind === "category") {
      downloadCsv(`category-purchase-sales-${stamp()}`, categoryHistoryRows(products, inwards, sales, vendorName, range));
    } else if (job.kind === "one") {
      downloadCsv(`history-${job.name.replace(/[^\w]+/g, "-").toLowerCase()}-${stamp()}`, itemHistoryRows(products, inwards, sales, vendorName, range, new Set([job.id])));
    } else {
      downloadCsv(`item-purchase-sales-history-${stamp()}`, itemHistoryRows(products, inwards, sales, vendorName, range, new Set(ids)));
    }
    onDone();
  }, [loading, inwards, ids, invLoaded, products, sales, vendors, range, job, onDone]);

  return null;
}
