/**
 * ANA-02: real .xlsx export (not CSV) for analytics and reports. Loaded on demand so the library
 * only ships to the browser when someone actually exports.
 */
export type XlsxCell = string | number | null;
export interface XlsxSheet {
  name: string;
  rows: XlsxCell[][];
  /** Column widths in characters (optional). */
  widths?: number[];
}

/** Excel sheet names: ≤31 chars, none of : \ / ? * [ ] */
function sheetName(s: string): string {
  return s.replace(/[:\\/?*[\]]/g, " ").slice(0, 31) || "Sheet";
}

export async function downloadXlsx(fileName: string, sheets: XlsxSheet[]): Promise<void> {
  const { default: writeXlsxFile } = await import("write-excel-file");
  const data = sheets.map((sh) =>
    sh.rows.map((row, ri) =>
      row.map((v) =>
        v === null || v === undefined
          ? null
          : typeof v === "number"
            ? { value: v, type: Number, ...(ri === 0 ? { fontWeight: "bold" as const } : {}) }
            : { value: String(v), type: String, ...(ri === 0 ? { fontWeight: "bold" as const } : {}) },
      ),
    ),
  );
  const columns = sheets.map((sh) => {
    const n = Math.max(0, ...sh.rows.map((r) => r.length));
    return Array.from({ length: n }, (_, i) => ({
      width: sh.widths?.[i] ?? Math.min(48, Math.max(10, ...sh.rows.map((r) => String(r[i] ?? "").length + 2))),
    }));
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (writeXlsxFile as any)(data, {
    sheets: sheets.map((s) => sheetName(s.name)),
    columns,
    fileName: fileName.endsWith(".xlsx") ? fileName : `${fileName}.xlsx`,
  });
}

/** Paise → rupees as a number with 2 decimals (so Excel can sum it). */
export const rupeesNum = (paise: number) => Math.round(paise) / 100;
