/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || (process.env.NODE_ENV === 'production' ? "/tile-game" : ""),
  images: {
    unoptimized: true,
  },
  optimizeFonts: false,
  transpilePackages: ["@capacitor/preferences", "@capacitor/core"],
};

export default nextConfig;
