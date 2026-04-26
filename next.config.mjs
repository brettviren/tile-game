/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  // Use NEXT_PUBLIC_BASE_PATH if explicitly set (even to ""); fall back to
  // "/tile-game" for production builds (GitHub Pages) and "" for dev.
  basePath: 'NEXT_PUBLIC_BASE_PATH' in process.env
    ? process.env.NEXT_PUBLIC_BASE_PATH
    : (process.env.NODE_ENV === 'production' ? '/tile-game' : ''),
  images: {
    unoptimized: true,
  },
  optimizeFonts: false,
  transpilePackages: ["@capacitor/preferences", "@capacitor/core"],
};

export default nextConfig;
