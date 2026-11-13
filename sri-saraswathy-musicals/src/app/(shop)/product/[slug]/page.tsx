import type { Metadata } from "next";
import { getProductBySlug } from "@/lib/db/queries/products";
import { JsonLd } from "@/components/seo/JsonLd";
import { SITE_NAME, breadcrumbJsonLd, productDescription, productImage, productJsonLd } from "@/lib/seo";
import { ProductView } from "./ProductView";

type Props = { params: Promise<{ slug: string }> };

// Prices and stock change; render per request so the markup is never stale.
export const dynamic = "force-dynamic";

async function load(slug: string) {
  try {
    return await getProductBySlug(slug);
  } catch {
    return undefined; // DB unavailable: fall back to the client view and generic metadata
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const product = await load(slug);
  if (!product) return { title: "Instrument", robots: { index: false } };

  const description = productDescription(product);
  const image = productImage(product);
  const path = `/product/${product.slug}`;
  return {
    title: product.name,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      url: path,
      title: `${product.name} | ${SITE_NAME}`,
      description,
      ...(image ? { images: [{ url: image, alt: product.name }] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: `${product.name} | ${SITE_NAME}`,
      description,
      ...(image ? { images: [image] } : {}),
    },
  };
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const product = await load(slug);
  return (
    <>
      {product && (
        <JsonLd
          data={[
            productJsonLd(product),
            breadcrumbJsonLd([
              { name: "Home", path: "/" },
              { name: "Shop", path: "/shop" },
              { name: product.name, path: `/product/${product.slug}` },
            ]),
          ]}
        />
      )}
      <ProductView params={params} />
    </>
  );
}
