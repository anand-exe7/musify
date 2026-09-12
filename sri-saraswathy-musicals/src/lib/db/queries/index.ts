/**
 * Namespaced re-export of every query module, so callers can do:
 *
 *   import { queries } from "@/lib/db/queries";
 *   const list = await queries.products.getAllProducts();
 *
 * or import a module directly (`@/lib/db/queries/products`).
 */
export * as products from "./products";
export * as categories from "./categories";
export * as users from "./users";
export * as staff from "./staff";
export * as orders from "./orders";
export * as invoices from "./invoices";
export * as vendors from "./vendors";
export * as repair from "./repair";
export * as inquiries from "./inquiries";
export * as pos from "./pos";
export * as settings from "./settings";
