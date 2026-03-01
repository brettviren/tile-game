/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || "",
  images: {
    unoptimized: true,
  },
  optimizeFonts: false,
  transpilePackages: ["@capacitor/preferences", "@capacitor/core"],
};

export default nextConfig;
