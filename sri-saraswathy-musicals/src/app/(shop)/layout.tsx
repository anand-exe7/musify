import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { MobileNav } from "@/components/layout/MobileNav";

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      <main className="min-h-dvh pt-20 pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0">{children}</main>
      <Footer />
      <MobileNav />
    </>
  );
}
