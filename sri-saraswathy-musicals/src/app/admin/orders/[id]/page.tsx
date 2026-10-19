import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { getOrder } from "@/lib/db/queries/orders";
import { getAllProducts } from "@/lib/db/queries/products";
import { getInvoiceByRefId } from "@/lib/db/queries/invoices";
import { getVerifiedSession } from "@/lib/auth/server";
import { adminAccessOf, branchAllowed } from "@/lib/auth/session";
import { BUSINESS } from "@/lib/data/business";
import { OrderView } from "./OrderView";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: `Order ${id} · ${BUSINESS.name}`, robots: { index: false } };
}

/** One online order — what was bought, where it goes, and its status, courier and tracking. Admins and branch staff (own branch only). */
export default async function AdminOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getVerifiedSession();
  if (!session) redirect("/auth/login?redirect=%2Fadmin%2Forders");
  const access = adminAccessOf(session);
  if (!access) redirect("/");

  const { id } = await params;
  const order = await getOrder(id);
  if (!order || !branchAllowed(access, order.branch)) notFound();

  const [products, invoice] = await Promise.all([getAllProducts(), getInvoiceByRefId(id)]);
  const names: Record<string, string> = {};
  for (const p of products) names[p.id] = p.name;

  return <OrderView order={order} names={names} invoice={invoice ? { id: invoice.id, number: invoice.number, reference: invoice.reference ?? "" } : null} />;
}
