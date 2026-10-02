import { redirect } from "next/navigation";

/** Legacy path — the module moved to /admin/purchases. Kept as a redirect so
 *  bookmarks and in-flight tabs land on the new page. */
export default function StockInwardRedirect() {
  redirect("/admin/purchases");
}
