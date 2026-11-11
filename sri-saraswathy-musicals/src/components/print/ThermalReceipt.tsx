import { BUSINESS, branchInfo } from "@/lib/data/business";
import { gstSummary, taxLabel, halfRate, fmtDate, type PrintDoc } from "@/lib/print/doc";

export type ThermalWidth = 58 | 80;

/** ₹ without the symbol, two decimals — receipts are narrow. */
function amt(paise: number): string {
  return (paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Thermal (Bluetooth / USB roll printer) receipt — 80 mm or 58 mm paper. Plain black text in a standard font,
 * no backgrounds, so it prints cleanly on any ESC/POS printer driver from the browser's print dialog.
 * Carries the same GST split-up as the A4 sheet (BIL-01 / QUO-02).
 */
export function ThermalReceipt({ doc, width = 80, id = "thermal-sheet" }: { doc: PrintDoc; width?: ThermalWidth; id?: string }) {
  const branch = branchInfo(doc.branch);
  const s = gstSummary(doc.lines, doc.cgst, doc.sgst, doc.igst);
  const contentMm = width === 80 ? 72 : 48;
  const fs = width === 80 ? 11 : 9.5;
  const row = { display: "flex", justifyContent: "space-between", gap: 6 } as const;
  const rule = { borderTop: "1px dashed #000", margin: "5px 0" } as const;

  return (
    <div
      id={id}
      style={{
        width: `${contentMm}mm`,
        padding: "2mm 0",
        margin: "0 auto",
        fontFamily: "Arial, Helvetica, sans-serif",
        fontSize: fs,
        lineHeight: 1.35,
        color: "#000",
        background: "#fff",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: fs + 4, fontWeight: 700 }}>{BUSINESS.name}</div>
        <div>{branch.area} · {branch.street}</div>
        <div>{branch.zip}</div>
        <div>Ph: {branch.phone}</div>
        <div>GSTIN: {BUSINESS.gstin}</div>
      </div>
      <div style={rule} />
      <div style={{ textAlign: "center", fontWeight: 700, fontSize: fs + 2, textTransform: "uppercase", letterSpacing: 1 }}>
        {doc.title}{doc.cancelled ? " (CANCELLED)" : ""}
      </div>
      {doc.notice && <div style={{ textAlign: "center", border: "1px solid #000", padding: "2px 4px", margin: "4px 0", fontWeight: 700 }}>{doc.notice}</div>}
      <div style={row}><span>No: {doc.number}</span><span>{fmtDate(doc.date)}</span></div>
      {(doc.meta ?? []).map((m) => (
        <div key={m.label} style={row}><span>{m.label}</span><span>{m.value}</span></div>
      ))}
      <div style={rule} />
      <div>Customer: <b>{doc.customer.name}</b></div>
      {doc.customer.phone && <div>Ph: {doc.customer.phone}</div>}
      {doc.customer.gstin && <div>GSTIN: {doc.customer.gstin}</div>}
      <div style={rule} />

      {/* Items: name on its own line, then qty × rate … amount */}
      <div style={{ ...row, fontWeight: 700 }}><span>Item</span><span>Amount</span></div>
      {doc.lines.map((l, i) => (
        <div key={i} style={{ marginTop: 3 }}>
          <div style={{ fontWeight: 600, wordBreak: "break-word" }}>{i + 1}. {l.name}</div>
          <div style={row}>
            <span>
              {l.qty} × {amt(l.rate)}
              {l.gst > 0 ? ` · GST ${l.gst}%` : ""}
              {(l.discount ?? 0) > 0 ? ` · -${amt(l.discount ?? 0)}` : ""}
            </span>
            <span>{amt(l.amount)}</span>
          </div>
          {l.note && <div style={{ fontSize: fs - 1 }}>Note: {l.note}</div>}
        </div>
      ))}
      <div style={rule} />

      {(doc.discount ?? 0) > 0 && <div style={row}><span>Discount</span><span>-{amt(doc.discount ?? 0)}</span></div>}
      <div style={row}><span>Taxable value</span><span>{amt(doc.subtotal)}</span></div>
      {s.totalTax > 0 &&
        (s.interState ? (
          <div style={row}><span>{taxLabel("IGST", s)}</span><span>{amt(doc.igst)}</span></div>
        ) : (
          <>
            <div style={row}><span>{taxLabel("CGST", s)}</span><span>{amt(doc.cgst)}</span></div>
            <div style={row}><span>{taxLabel("SGST", s)}</span><span>{amt(doc.sgst)}</span></div>
          </>
        ))}
      {s.totalTax > 0 && <div style={row}><span>Total GST</span><span>{amt(s.totalTax)}</span></div>}
      {(doc.delivery ?? 0) > 0 && <div style={row}><span>Delivery</span><span>{amt(doc.delivery ?? 0)}</span></div>}
      <div style={{ ...row, fontWeight: 700, fontSize: fs + 3, borderTop: "1px solid #000", borderBottom: "1px solid #000", padding: "3px 0", marginTop: 4 }}>
        <span>TOTAL ₹</span><span>{amt(doc.total)}</span>
      </div>

      {/* GST rate-wise breakup when more than one rate is on the bill */}
      {s.rows.length > 1 && (
        <div style={{ marginTop: 5 }}>
          <div style={{ fontWeight: 700 }}>GST breakup</div>
          {s.rows.map((r) => (
            <div key={r.rate} style={row}>
              <span>{r.rate}% on {amt(r.taxable)}</span>
              <span>{s.interState ? `IGST ${amt(r.igst)}` : `C ${halfRate(r.rate)} ${amt(r.cgst)} · S ${amt(r.sgst)}`}</span>
            </div>
          ))}
        </div>
      )}

      {doc.paymentMode && <div style={{ ...row, marginTop: 4 }}><span>Payment</span><span>{doc.paymentMode.toUpperCase()}</span></div>}
      {(doc.payments ?? []).map((p, i) => (
        <div key={i} style={row}><span>{p.label}</span><span>{amt(p.amount)}</span></div>
      ))}
      {doc.paid !== undefined && <div style={row}><span>Paid</span><span>{amt(doc.paid)}</span></div>}
      {doc.balance !== undefined && <div style={{ ...row, fontWeight: 700 }}><span>Balance due</span><span>{amt(doc.balance)}</span></div>}

      <div style={rule} />
      <div style={{ textAlign: "center" }}>
        {doc.kind === "quotation" ? "This is a quotation, not a bill." : doc.kind === "receipt" ? "Payment acknowledgement." : "Goods once sold cannot be taken back."}
        <br />
        Thank you! Visit again.
      </div>
    </div>
  );
}
