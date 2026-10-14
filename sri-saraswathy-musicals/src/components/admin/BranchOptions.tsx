"use client";
import { branchLabel } from "@/lib/stock";
import { useAllowedBranches } from "@/lib/store/branch";

/** `<option>`s for the branches the signed-in user may pick, labelled by name. */
export function BranchOptions() {
  const allowed = useAllowedBranches();
  return (
    <>
      {allowed.map((b) => (
        <option key={b} value={b}>{branchLabel(b)}</option>
      ))}
    </>
  );
}
