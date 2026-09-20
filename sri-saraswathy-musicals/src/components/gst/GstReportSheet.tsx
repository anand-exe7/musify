/**
 * Printable GST return sheets — GSTR-1 and GSTR-3B — laid out to match the
 * statutory forms (plain bordered tables, no app branding). Rendered by the
 * admin report page and captured with the browser's Print / Save-as-PDF, the
 * same mechanism the service invoice uses.
 *
 * Presentation only: all figures come from `@/lib/gst/report`.
 */
import {
  fmt2, type Gstr1Data, type Gstr3bData, type GstTotals,
} from "@/lib/gst/report";

/** Format an integer **paise** money figure as a rupee amount at 2dp (returns
 *  differ from `fmt2`, which is a plain 2-decimal formatter used for rates). */
const inr2 = (paise: number): string => fmt2((Number(paise) || 0) / 100);

/**
 * Isolates `#report-sheet` for print and gives the sheet its statutory look
 * (black text on white, bordered tables) independent of the app theme.
 */
export const GST_REPORT_PRINT_CSS = `
#report-sheet {
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
  background: #fff; color: #000;
  font-family: Arial, Helvetica, sans-serif; font-size: 11px; line-height: 1.35;
}
#report-sheet .rpt-title { text-align: center; font-weight: 700; font-size: 15px; margin: 10px 0; }
#report-sheet .rpt-center { text-align: center; }
#report-sheet .rpt-muted { color: #333; }
#report-sheet .rpt-section { font-weight: 700; margin: 14px 0 5px; }
#report-sheet .rpt-box { border: 1px solid #000; padding: 8px 10px; margin: 8px 0; }
#report-sheet .rpt-box p { margin: 2px 0; }
#report-sheet table { border-collapse: collapse; width: 100%; margin-top: 4px; }
#report-sheet th, #report-sheet td { border: 1px solid #000; padding: 3px 5px; vertical-align: top; }
#report-sheet th { font-weight: 700; text-align: center; }
#report-sheet td.num, #report-sheet th.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
#report-sheet td.ctr { text-align: center; }
#report-sheet td.lbl { font-weight: 700; }
#report-sheet tr.totals td { font-weight: 700; }
#report-sheet .rpt-foot { margin-top: 18px; text-align: center; font-size: 10px; color: #444; }
#report-sheet .rpt-period { display: flex; justify-content: space-between; gap: 24px; font-size: 11px; }
#report-sheet .rpt-period div p { margin: 2px 0; }
@media print {
  body * { visibility: hidden !important; }
  #report-sheet, #report-sheet * { visibility: visible !important; }
  #report-sheet { position: absolute; left: 0; top: 0; width: 100%; margin: 0; }
  @page { margin: 10mm; size: A4 landscape; }
}
`;

/** The registered-person details printed in the report header. */
export interface ReportBusiness {
  name: string;
  address: string;
  phone: string;
  email: string;
  gstin: string;
  legalName: string;
  tradeName?: string;
  stateLabel: string; // e.g. "33-Tamil Nadu"
  website: string;
}

export interface ReportPeriod {
  fromYear: number;
  toYear: number;
  fromMonth: string; // display name, upper/title-cased by the sheet
  toMonth: string;
}

function PeriodHeader({ period, upper }: { period: ReportPeriod; upper?: boolean }) {
  const m = (s: string) => (upper ? s.toUpperCase() : s);
  return (
    <div className="rpt-period">
      <div>
        <p>From Year&nbsp;&nbsp;{period.fromYear}</p>
        <p>From Month&nbsp;&nbsp;{m(period.fromMonth)}</p>
      </div>
      <div style={{ textAlign: "right" }}>
        <p>To Year&nbsp;&nbsp;{period.toYear}</p>
        <p>To Month&nbsp;&nbsp;{m(period.toMonth)}</p>
      </div>
    </div>
  );
}

function Foot({ website, generated }: { website: string; generated?: string }) {
  return (
    <div className="rpt-foot">
      {generated && <p style={{ margin: "0 0 2px" }}>Generated on {generated}</p>}
      <p style={{ margin: 0 }}>{website}</p>
    </div>
  );
}

/* ─────────────────────────────  GSTR-1  ───────────────────────────── */

export function Gstr1Sheet({
  data, business, period,
}: { data: Gstr1Data; business: ReportBusiness; period: ReportPeriod }) {
  const t = data.totals;
  return (
    <div id="report-sheet" className="mx-auto max-w-[1100px] bg-white p-6 md:p-8">
      <PeriodHeader period={period} upper />

      <div className="rpt-center" style={{ marginTop: 14 }}>
        <p style={{ fontWeight: 700, fontSize: 15, margin: "0 0 4px" }}>{business.name}</p>
        <p className="rpt-muted" style={{ margin: "1px 0" }}>
          Address: {business.address}, Ph. no.: {business.phone} Email: {business.email}
        </p>
        <p className="rpt-muted" style={{ margin: "1px 0" }}>
          GSTIN: {business.gstin}, State: {business.stateLabel}
        </p>
      </div>

      <p className="rpt-title">GSTR 1 Report</p>

      <div className="rpt-box">
        <p>1. GSTIN: {business.gstin}</p>
        <p>2. (a) Legal name of the registered person: {business.legalName}</p>
        <p>&nbsp;&nbsp;&nbsp;(b) Trade name, if any: {business.tradeName || ""}</p>
        <p>3. (a) Aggregate Turnover in the preceding Financial Year:</p>
        <p>&nbsp;&nbsp;&nbsp;(b) Aggregate Turnover - April to June, 2017:</p>
      </div>

      {/* Sale */}
      <p className="rpt-section">Sale</p>
      <div style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th rowSpan={2}>GSTIN/UIN<br />No.</th>
              <th colSpan={3}>Invoice</th>
              <th rowSpan={2}>Rate</th>
              <th rowSpan={2}>CESS<br />Rate</th>
              <th rowSpan={2}>Taxable<br />Value</th>
              <th colSpan={4}>Amount</th>
              <th rowSpan={2}>Place Of<br />Supply</th>
            </tr>
            <tr>
              <th>No.</th><th>Date</th><th>Value</th>
              <th>Integrated<br />Tax</th><th>Central<br />Tax</th><th>State/UT<br />Tax</th><th>CESS</th>
            </tr>
          </thead>
          <tbody>
            {data.sales.length === 0 ? (
              <tr><td colSpan={12} className="ctr rpt-muted">No sales in this period.</td></tr>
            ) : (
              data.sales.map((r, i) => (
                <tr key={`${r.invoiceNo}-${i}`}>
                  <td>{r.gstin}</td>
                  <td>{r.invoiceNo}</td>
                  <td className="num">{r.invoiceDate}</td>
                  <td className="num">{inr2(r.invoiceValue)}</td>
                  <td className="num">{fmt2(r.rate)}</td>
                  <td className="num">{fmt2(r.cessRate)}</td>
                  <td className="num">{inr2(r.taxableValue)}</td>
                  <td className="num">{inr2(r.integratedTax)}</td>
                  <td className="num">{inr2(r.centralTax)}</td>
                  <td className="num">{inr2(r.stateTax)}</td>
                  <td className="num">{inr2(r.cess)}</td>
                  <td>{r.placeOfSupply}</td>
                </tr>
              ))
            )}
            <tr className="totals">
              <td colSpan={3}>Totals</td>
              <td className="num">{inr2(t.invoiceValue)}</td>
              <td></td>
              <td></td>
              <td className="num">{inr2(t.taxableValue)}</td>
              <td className="num">{inr2(t.integratedTax)}</td>
              <td className="num">{inr2(t.centralTax)}</td>
              <td className="num">{inr2(t.stateTax)}</td>
              <td className="num">{inr2(t.cess)}</td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Sale Return */}
      <p className="rpt-section">Sale Return</p>
      <div style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>GSTIN/UIN<br />No.</th>
              <th>Return<br />No.</th>
              <th>Return<br />Date</th>
              <th>Invoice<br />No.</th>
              <th>Invoice<br />Date</th>
              <th>Value</th>
              <th>Rate</th>
              <th>CESS<br />Rate</th>
              <th>Taxable<br />Value</th>
              <th>Integrated<br />Tax</th>
              <th>Central<br />Tax</th>
              <th>State/UT<br />Tax</th>
              <th>CESS</th>
              <th>Place Of<br />Supply</th>
            </tr>
          </thead>
          <tbody>
            <tr className="totals">
              <td colSpan={5}>Totals</td>
              <td className="num">{inr2(0)}</td>
              <td></td>
              <td></td>
              <td className="num">{inr2(0)}</td>
              <td className="num">{inr2(0)}</td>
              <td className="num">{inr2(0)}</td>
              <td className="num">{inr2(0)}</td>
              <td className="num">{inr2(0)}</td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>

      <Foot website={business.website} />
    </div>
  );
}

/* ─────────────────────────────  GSTR-3B  ───────────────────────────── */

/** 3B prints computed figures at 2dp but bare zeros as "0.0", like the form. */
function f3b(n: number): string {
  return n === 0 ? "0.0" : inr2(n);
}

function OutwardRow({ label, v }: { label: string; v: GstTotals }) {
  return (
    <tr>
      <td>{label}</td>
      <td className="num">{f3b(v.taxableValue)}</td>
      <td className="num">{f3b(v.integratedTax)}</td>
      <td className="num">{f3b(v.centralTax)}</td>
      <td className="num">{f3b(v.stateTax)}</td>
      <td className="num">{f3b(v.cess)}</td>
    </tr>
  );
}

const ZERO_ROW: GstTotals = {
  invoiceValue: 0, taxableValue: 0, integratedTax: 0, centralTax: 0, stateTax: 0, cess: 0,
};

export function Gstr3bSheet({
  data, business, period, generated,
}: { data: Gstr3bData; business: ReportBusiness; period: ReportPeriod; generated: string }) {
  const itcRow = (label: string) => (
    <tr>
      <td>{label}</td>
      <td className="num">0.0</td><td className="num">0.0</td><td className="num">0.0</td><td className="num">0.0</td>
    </tr>
  );

  return (
    <div id="report-sheet" className="mx-auto max-w-[1000px] bg-white p-6 md:p-8">
      <PeriodHeader period={period} />

      <p className="rpt-title">GSTR-3B Report</p>

      {/* 1 */}
      <p className="rpt-section">1. Details of outward supplies and Inward supplies liable to reverse charge</p>
      <table>
        <thead>
          <tr>
            <th style={{ textAlign: "left" }}>Nature of Supplies</th>
            <th>Total taxable value</th>
            <th>Integrated Tax</th>
            <th>Central Tax</th>
            <th>State/UT Tax</th>
            <th>CESS</th>
          </tr>
        </thead>
        <tbody>
          <OutwardRow label="Outward taxable supplies (Other than zero rated, nil rated and exempted)" v={data.outward} />
          <OutwardRow label="Outward taxable supplies (Zero rated)" v={ZERO_ROW} />
          <OutwardRow label="Other outward supplies (Nil rated and exempted)" v={ZERO_ROW} />
          <OutwardRow label="Inward supplies (Liable to reverse charge)" v={ZERO_ROW} />
          <OutwardRow label="Non-GST outward supplies" v={ZERO_ROW} />
        </tbody>
      </table>

      {/* 2 */}
      <p className="rpt-section">2. Details of Inter-State supplies made to unregistered persons, composition dealer and UIN holders</p>
      <table>
        <thead>
          <tr>
            <th rowSpan={2}>Place of Supply (State/UT)</th>
            <th colSpan={2}>Supplies made to Unregistered Persons</th>
            <th colSpan={2}>Supplies made to Composition Taxable Persons</th>
            <th colSpan={2}>Supplies made to UIN holders</th>
          </tr>
          <tr>
            <th>Total Taxable Value</th><th>Amount Of Integrated Tax</th>
            <th>Total Taxable Value</th><th>Amount Of Integrated Tax</th>
            <th>Total Taxable Value</th><th>Amount Of Integrated Tax</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="ctr">-</td><td className="ctr">-</td><td className="ctr">-</td>
            <td className="ctr">-</td><td className="ctr">-</td><td className="ctr">-</td><td className="ctr">-</td>
          </tr>
        </tbody>
      </table>

      {/* 3 */}
      <p className="rpt-section">3. Details of eligible Input Tax Credit</p>
      <table>
        <thead>
          <tr>
            <th style={{ textAlign: "left" }}>Details</th>
            <th>Integrated Tax</th><th>Central Tax</th><th>State/UT Tax</th><th>CESS</th>
          </tr>
        </thead>
        <tbody>
          <tr><td className="lbl" colSpan={5}>(A) ITC Available (Whether in full or part)</td></tr>
          {itcRow("(1) Import of goods")}
          {itcRow("(2) Import of services")}
          {itcRow("(3) Inward supplies liable to reverse charge (other than 1 & 2 above)")}
          {itcRow("(4) Inward supplies for ISD")}
          {itcRow("(5) All other ITC")}
          <tr><td className="lbl" colSpan={5}>(D) Ineligible ITC</td></tr>
          {itcRow("(1) As per section 17(5)")}
          {itcRow("(2) Others")}
        </tbody>
      </table>

      {/* 4 */}
      <p className="rpt-section">4. Details of exempt, nil-rated and non-GST inward supplies</p>
      <table>
        <thead>
          <tr>
            <th style={{ textAlign: "left" }}>Nature of Supplies</th>
            <th>Inter-State Supplies</th><th>Intra-State Supplies</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>From a supplier under composition scheme, Exempt and Nil rated supply</td>
            <td className="num">0.0</td><td className="num">0.0</td>
          </tr>
          <tr>
            <td>Non GST supply</td>
            <td className="num">0.0</td><td className="num">0.0</td>
          </tr>
        </tbody>
      </table>

      <Foot website={business.website} generated={generated} />
    </div>
  );
}
