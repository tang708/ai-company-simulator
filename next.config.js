/** @type {import('next').NextConfig} */
const nextConfig = {
  swcMinify: false,
  experimental: {
    serverComponentsExternalPackages: ["mysql2"],
    forceSwcTransforms: false,
  },
};

module.exports = nextConfig;
