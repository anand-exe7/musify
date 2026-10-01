import { toCsv } from "@/lib/gst/summary";

type Cell = string | number;

/** Paise → rupees string at 2 decimals, as used by every CSV export. */
export const rupees = (paise: number) => (paise / 100).toFixed(2);

/** Download `rows` (first row = header) as a UTF-8 CSV that Excel opens cleanly. */
export function downloadCsv(filename: string, rows: Cell[][]) {
  const csv = "﻿" + toCsv(rows); // toCsv neutralises formula-leading cells
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export const stamp = () => new Date().toISOString().slice(0, 10);
