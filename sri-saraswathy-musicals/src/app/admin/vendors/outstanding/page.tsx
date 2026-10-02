import { redirect } from "next/navigation";

/** Common typo of /admin/vendors/outstandings. */
export default function Page() {
  redirect("/admin/vendors/outstandings");
}
