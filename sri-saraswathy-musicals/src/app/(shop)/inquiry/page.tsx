"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * The enquiry form now lives on the home page (id="inquiry"). This route is
 * kept only so old links still work — it forwards to the landing section.
 */
export default function InquiryRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/#inquiry");
  }, [router]);
  return (
    <div className="container-page py-32 text-center text-sm text-ink-400">
      Taking you to the enquiry form…
    </div>
  );
}
