/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || '/frequency-atlas',
  images: { unoptimized: true },
};
module.exports = nextConfig;
