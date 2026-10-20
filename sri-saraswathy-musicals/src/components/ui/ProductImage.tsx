"use client";
import Image from "next/image";
import { useState } from "react";
import type { Product } from "@/types";

interface Props {
  product: Product;
  photoIndex?: number;
  sizes?: string;
  priority?: boolean;
  className?: string;
  imageClassName?: string;
  /** "contain" shows the whole photo (studio shots on white); "cover" fills and crops. */
  fit?: "cover" | "contain";
}

const FALLBACK =
  "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80";

export function ProductImage({
  product,
  photoIndex = 0,
  sizes = "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 300px",
  priority,
  className,
  imageClassName,
  fit = "cover",
}: Props) {
  const wanted = product.photos?.[photoIndex] ?? product.photo ?? FALLBACK;
  // Remember which photo failed to load (not the photo shown), so a different photo —
  // e.g. the one for another variant — is tried afresh instead of being stuck on the first.
  const [failed, setFailed] = useState<string | null>(null);
  const src = failed === wanted ? FALLBACK : wanted;

  return (
    <div className={className ?? "relative h-full w-full overflow-hidden bg-ink-100"}>
      <Image
        src={src}
        alt={product.name}
        fill
        sizes={sizes}
        priority={priority}
        onError={() => wanted !== FALLBACK && setFailed(wanted)}
        className={`${fit === "contain" ? "object-contain" : "object-cover"} ${imageClassName ?? ""}`}
      />
    </div>
  );
}
