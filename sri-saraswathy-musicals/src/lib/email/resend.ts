/**
 * Transactional email via Resend — customer-facing only (order confirmations).
 * The admin/billing side does not send email. Every send is best-effort: a
 * failure here must never fail the order, so callers wrap this in try/catch and
 * we also swallow/log internally.
 */
import { Resend } from "resend";
import type { Order } from "@/types";
import { getAllProducts } from "@/lib/db/queries/products";
import { formatINR } from "@/lib/utils";

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

function fromAddress(): string {
  // Resend's sandbox sender works without a verified domain for testing.
  return process.env.ORDER_FROM_EMAIL || "Sri Saraswathy Musicals <onboarding@resend.dev>";
}

async function renderOrderEmail(order: Order): Promise<string> {
  const names = new Map((await getAllProducts()).map((p) => [p.id, `${p.brand} ${p.name}`]));
  const rows = order.items
    .map((i) => {
      const name = names.get(i.productId) ?? i.productId;
      return `<tr>
        <td style="padding:8px 0;border-bottom:1px solid #eee;">${name} &times; ${i.quantity}</td>
        <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;">${formatINR(i.price * i.quantity)}</td>
      </tr>`;
    })
    .join("");

  return `<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#1a1a1a;">
    <h1 style="font-size:22px;">Thank you${order.customerName ? `, ${order.customerName}` : ""} — your order is confirmed.</h1>
    <p style="color:#555;">Order <strong>#${order.id}</strong> · ${order.date}</p>
    <table style="width:100%;border-collapse:collapse;margin-top:16px;font-family:Arial,sans-serif;font-size:14px;">
      ${rows}
      <tr><td style="padding:8px 0;">Subtotal</td><td style="padding:8px 0;text-align:right;">${formatINR(order.subtotal)}</td></tr>
      <tr><td style="padding:8px 0;">GST</td><td style="padding:8px 0;text-align:right;">${formatINR(order.gst)}</td></tr>
      <tr><td style="padding:8px 0;">Shipping</td><td style="padding:8px 0;text-align:right;">${order.shipping === 0 ? "Free" : formatINR(order.shipping)}</td></tr>
      <tr><td style="padding:12px 0;font-weight:bold;border-top:2px solid #111;">Total</td><td style="padding:12px 0;text-align:right;font-weight:bold;border-top:2px solid #111;">${formatINR(order.total)}</td></tr>
    </table>
    <p style="color:#555;margin-top:16px;">${order.address}</p>
    <p style="color:#999;font-size:12px;margin-top:24px;">Sri Saraswathy Musicals · Vadapalani · Porur</p>
  </div>`;
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
