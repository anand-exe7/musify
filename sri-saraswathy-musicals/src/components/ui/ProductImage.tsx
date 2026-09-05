"use client";
import Image from "next/image";
import { useState } from "react";
import { InstrumentSVG } from "./InstrumentSVG";
import type { Product } from "@/types";

interface Props {
  product: Product;
  photoIndex?: number;      // which photo from photos[] gallery (defaults to 0)
  sizes?: string;
  priority?: boolean;
  className?: string;
  imageClassName?: string;  // classes applied to the <img>
}

/**
 * Displays a real product photo with graceful fallback to the SVG illustration.
 * Uses next/image for optimization + responsive sizing.
 */
export function ProductImage({
  product,
  photoIndex = 0,
  sizes = "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 300px",
  priority,
  className,
  imageClassName,
}: Props) {
  const [failed, setFailed] = useState(false);

  const src = (product.photos?.[photoIndex]) ?? product.photo;

  if (failed || !src) {
    return (
      <div className={className ?? "relative h-full w-full"}>
        <InstrumentSVG instrument={product.images[0]} />
      </div>
    );
  }

  return (
    <div className={className ?? "relative h-full w-full overflow-hidden"}>
      <Image
        src={src}
        alt={product.name}
        fill
        sizes={sizes}
        priority={priority}
        onError={() => setFailed(true)}
        className={`object-cover ${imageClassName ?? ""}`}
      />
    </div>
  );
}
