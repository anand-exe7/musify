import { Poppins } from "next/font/google";
import { AdminShell } from "@/components/admin/AdminShell";

// Admin runs in Poppins only — the storefront's display / serif / sans mix is
// pretty but reads busy in dense dashboards. Here we remap every font variable
// to Poppins so a leftover `font-display` or `font-serif` still looks uniform.
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  variable: "--font-admin",
  display: "swap",
});

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`admin-root ${poppins.variable}`}>
      <AdminShell>{children}</AdminShell>
    </div>
  );
}
