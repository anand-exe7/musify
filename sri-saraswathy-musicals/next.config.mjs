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
