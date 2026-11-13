/**
 * Transactional email via Resend — customer-facing only (order confirmations).
 * The admin/billing side does not send email. Every send is best-effort: a
 * failure here must never fail the order, so callers wrap this in try/catch and
 * we also swallow/log internally.
 */
import { Resend } from "resend";
import type { Order } from "@/types";
import { getProductNames } from "@/lib/db/queries/products";
import { formatINR } from "@/lib/utils";
import { BUSINESS } from "@/lib/data/business";

/** Make text safe to put inside email HTML: a name, address or tracking number must never be read as markup. */
export function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
/** An address keeps its line breaks. */
const escLines = (value: unknown) => esc(value).replace(/\r?\n/g, "<br>");

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

function fromAddress(): string {
  // Resend's sandbox sender works without a verified domain for testing.
  return process.env.ORDER_FROM_EMAIL || "Sri Saraswathy Musicals <onboarding@resend.dev>";
}

/* ──────────────────────────────────────────────────────────────────────────
   Email shell.

   Mail clients are not browsers: Gmail strips <style> blocks, Outlook renders
   through Word. So everything here is tables with inline styles, web-safe
   fonts, and flat colours — no flex, no grid, no gradients, no web fonts.
   The palette is the shop's own: ink, gold and ivory, nothing invented.
   ────────────────────────────────────────────────────────────────────────── */
const INK = "#0A0908";
const INK_MUTED = "#5A4A38";
const INK_FAINT = "#8A7A65";
const RULE = "#EBE5D6";
const GOLD = "#C9A24B";
const IVORY = "#FAF6EC";
const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif";

/** One money row in the totals block. `strong` draws the grand total. */
function totalRow(label: string, value: string, opts: { strong?: boolean; muted?: boolean } = {}): string {
  const weight = opts.strong ? "700" : "400";
  const colour = opts.muted ? INK_FAINT : INK;
  const size = opts.strong ? "16px" : "14px";
  const pad = opts.strong ? "14px 0 0" : "7px 0";
  const rule = opts.strong ? `border-top:2px solid ${INK};` : "";
  return `<tr>
      <td style="padding:${pad};${rule}font-family:${SANS};font-size:${size};font-weight:${weight};color:${colour};">${label}</td>
      <td style="padding:${pad};${rule}font-family:${SANS};font-size:${size};font-weight:${weight};color:${colour};text-align:right;white-space:nowrap;">${value}</td>
    </tr>`;
}

/**
 * The frame every customer email shares: ivory page, white sheet, a gold hairline at the top,
 * the shop's name above the headline, and the branches underneath.
 */
function shell(opts: { heading: string; intro?: string; body: string }): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background:${IVORY};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${IVORY};">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#FFFFFF;border:1px solid ${RULE};">

        <tr><td style="height:4px;background:${GOLD};font-size:0;line-height:0;">&nbsp;</td></tr>

        <tr><td style="padding:34px 36px 0;">
          <p style="margin:0;font-family:${SANS};font-size:10px;font-weight:700;letter-spacing:.22em;text-transform:uppercase;color:${GOLD};">Sri Saraswathy Musicals</p>
          <h1 style="margin:14px 0 0;font-family:${SERIF};font-size:25px;line-height:1.25;font-weight:400;color:${INK};">${opts.heading}</h1>
          ${opts.intro ? `<p style="margin:10px 0 0;font-family:${SANS};font-size:14px;line-height:1.6;color:${INK_MUTED};">${opts.intro}</p>` : ""}
        </td></tr>

        ${opts.body}

        <tr><td style="height:30px;font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td style="padding:24px 36px 32px;border-top:1px solid ${RULE};">
          <p style="margin:0;font-family:${SANS};font-size:11px;line-height:1.7;color:${INK_FAINT};">
            ${BUSINESS.branches.map((b) => esc(b.area)).join(" &nbsp;·&nbsp; ")}<br>
            Instruments, set up by hand &nbsp;·&nbsp; Since 1965
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body></html>`;
}

/** A labelled block of quiet text — the delivery address, a tracking number. */
function panel(label: string, inner: string): string {
  return `<tr><td style="padding:22px 36px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${IVORY};border:1px solid ${RULE};">
        <tr><td style="padding:14px 16px;">
          <p style="margin:0 0 5px;font-family:${SANS};font-size:10px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:${INK_FAINT};">${label}</p>
          <p style="margin:0;font-family:${SANS};font-size:14px;line-height:1.6;color:${INK};">${inner}</p>
        </td></tr>
      </table>
    </td></tr>`;
}

/** Exported so the look can be checked without sending anything. */
export async function renderOrderEmail(order: Order): Promise<string> {
  // Names only, for the products on this order — not the whole catalogue with its photos.
  const names = await getProductNames([...new Set(order.items.map((i) => i.productId))]);
  const lines = order.items
    .map((i) => {
      const name = names[i.productId] ?? i.productId;
      return `<tr>
        <td style="padding:11px 0;border-bottom:1px solid ${RULE};font-family:${SANS};font-size:14px;line-height:1.5;color:${INK};">
          ${esc(name)}<span style="color:${INK_FAINT};"> &times; ${esc(i.quantity)}</span>
        </td>
        <td style="padding:11px 0;border-bottom:1px solid ${RULE};font-family:${SANS};font-size:14px;color:${INK};text-align:right;white-space:nowrap;">${formatINR(i.price * i.quantity)}</td>
      </tr>`;
    })
    .join("");

  const body = `
        <tr><td style="padding:22px 36px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            ${lines}
            ${totalRow("Subtotal", formatINR(order.subtotal))}
            ${order.discount ? totalRow(`Discount${order.couponCode ? ` (${esc(order.couponCode)})` : ""}`, `&minus;${formatINR(order.discount)}`) : ""}
            ${totalRow("GST, included in the prices", formatINR(order.gst), { muted: true })}
            ${totalRow("Delivery", order.shipping === 0 ? "Free" : formatINR(order.shipping))}
            ${totalRow("Total", formatINR(order.total), { strong: true })}
          </table>
        </td></tr>
        ${order.address ? panel("Delivering to", escLines(order.address)) : ""}
        ${order.deliveryEta ? panel("Expected", esc(order.deliveryEta)) : ""}`;

  return shell({
    heading: `Thank you${order.customerName ? `, ${esc(order.customerName)}` : ""} — your order is confirmed.`,
    intro: `Order <strong style="color:${INK};">#${esc(order.id)}</strong> &nbsp;·&nbsp; ${esc(order.date)}. We are preparing it now and will write again the moment it leaves the workshop.`,
    body,
  });
}

/** Send an order-confirmation email to the customer. No-op if unconfigured.
 *  NOTE: Resend's sandbox sender (`onboarding@resend.dev`) will only deliver
 *  to the address that owns the Resend account. Set `ORDER_FROM_EMAIL` to an
 *  address on a domain you've verified in Resend to reach real customers. */
export async function sendOrderConfirmation(order: Order, to: string | undefined | null): Promise<void> {
  if (!emailConfigured()) {
    console.warn(`[email] skipped order #${order.id}: RESEND_API_KEY is not set`);
    return;
  }
  if (!to) {
    console.warn(`[email] skipped order #${order.id}: no recipient email on the order`);
    return;
  }
  try {
    const resend = new Resend(process.env.RESEND_API_KEY as string);
    const { data, error } = await resend.emails.send({
      from: fromAddress(),
      to,
      subject: `Your Sri Saraswathy Musicals order #${order.id} is confirmed`,
      html: await renderOrderEmail(order),
    });
    if (error) {
      console.error(`[email] order #${order.id} → ${to} rejected by Resend:`, error);
      return;
    }
    console.info(`[email] order #${order.id} sent to ${to} (id=${data?.id ?? "?"})`);
  } catch (err) {
    console.error(`[email] order #${order.id} → ${to} failed:`, err);
  }
}

export function renderShippedEmail(order: Order): string {
  const track = [order.courier, order.trackingNo].filter(Boolean).map(esc).join(" · ");
  return shell({
    heading: `Good news${order.customerName ? `, ${esc(order.customerName)}` : ""} — your order is on its way.`,
    intro: `Order <strong style="color:${INK};">#${esc(order.id)}</strong> has left us.`,
    body: `${track ? panel("Tracking", track) : ""}
        ${order.address ? panel("Delivering to", escLines(order.address)) : ""}`,
  });
}

/** Tell the customer their order has shipped. Best effort, like every other email here: it never fails the status change. */
export async function sendOrderShipped(order: Order, to: string | undefined | null): Promise<void> {
  if (!emailConfigured() || !to) return;
  try {
    const resend = new Resend(process.env.RESEND_API_KEY as string);
    const { error } = await resend.emails.send({
      from: fromAddress(),
      to,
      subject: `Your Sri Saraswathy Musicals order #${order.id} has shipped`,
      html: renderShippedEmail(order),
    });
    if (error) console.error(`[email] shipped notice for #${order.id} → ${to} rejected by Resend:`, error);
  } catch (err) {
    console.error(`[email] shipped notice for #${order.id} → ${to} failed:`, err);
  }
}
