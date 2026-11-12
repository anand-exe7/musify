/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // /admin has no page of its own. Redirecting here (rather than from a server
  // component) also avoids a dev-only "negative time stamp" error from React's
  // render timing on a component that only redirects.
  async redirects() {
    return [{ source: "/admin", destination: "/admin/billing", permanent: false }];
  },
  images: {
    // Allowed `quality` values for next/image (silences the unconfigured-quality
    // warning and keeps hero art crisp without shipping the largest variant).
    qualities: [75, 90, 95],
    // Product photos are served by our own routes with a `?v=<fingerprint>` cache key. Next 16 blocks a
    // local image whose src carries a query string unless the path is listed here. The photos are already
    // small WebP written by the admin, so the components that show them also pass `unoptimized` and skip
    // the optimizer entirely; this entry is what keeps the loader from rejecting the URL.
    localPatterns: [
      { pathname: "/api/catalog/**" },
      { pathname: "/api/pos/inventory/**" },
      { pathname: "/api/inventory/**" },
      { pathname: "/**", search: "" },
    ],
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "plus.unsplash.com" },
      { protocol: "https", hostname: "source.unsplash.com" },
      { protocol: "https", hostname: "loremflickr.com" },
      { protocol: "https", hostname: "picsum.photos" },
    ],
  },
};

export default nextConfig;
