"use client";
import { useEffect, useState } from "react";
import { BUSINESS, branchInfo } from "@/lib/data/business";
export { toWhatsAppNumber } from "@/lib/data/business";

/** A branch's public contact line. `whatsapp` is dialable: 91 + 10 digits. */
export interface BranchContact {
  id: string;
  name: string;
  phone: string;
  whatsapp: string;
}

/** Until the saved numbers load (or if they can't), the numbers in the business profile. */
const FALLBACK: BranchContact[] = BUSINESS.branches.map((b) => ({ id: b.key, name: b.area, phone: b.phone, whatsapp: b.whatsapp }));

let cache: BranchContact[] | null = null;
let inflight: Promise<BranchContact[]> | null = null;

function load(): Promise<BranchContact[]> {
  inflight ??= fetch("/api/branches/contacts", { cache: "no-store" })
    .then((r) => (r.ok ? (r.json() as Promise<BranchContact[]>) : FALLBACK))
    .then((list) => (cache = Array.isArray(list) && list.length ? list : FALLBACK))
    .catch(() => FALLBACK)
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Drop the cached numbers (after they are edited on the Branches page). */
export function invalidateBranchContacts() {
  cache = null;
}

/** Every branch's contact line, as saved on Admin → Branches. */
export function useBranchContacts(): BranchContact[] {
  const [list, setList] = useState<BranchContact[]>(() => cache ?? FALLBACK);
  useEffect(() => {
    let alive = true;
    void load().then((l) => alive && setList(l));
    return () => {
      alive = false;
    };
  }, []);
  return list;
}

/** The WhatsApp number for a branch; "Any branch" / unknown → the main branch (Branch 1) as saved on Admin → Branches. */
export function whatsappFor(list: BranchContact[], branch?: string | null): string {
  const hit = list.find((b) => b.id === branch) ?? list.find((b) => b.id === "Branch 1");
  return hit?.whatsapp || (branch && branch !== "Any" ? branchInfo(branch).whatsapp : BUSINESS.whatsapp);
}

/** The phone number to print for a branch. */
export function phoneFor(list: BranchContact[], branch?: string | null): string {
  const hit = list.find((b) => b.id === branch);
  return hit?.phone || branchInfo(branch ?? "").phone;
}
