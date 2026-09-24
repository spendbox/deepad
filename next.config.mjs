/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Celebrant photos are shrunk on the phone first, but allow up to 6 MB just in case.
  experimental: { serverActions: { bodySizeLimit: '6mb' } },
};

export default nextConfig;
