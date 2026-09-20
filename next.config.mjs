/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  // Serve from the site root unless a subpath is asked for explicitly.
  // Only the GitHub Pages build sets NEXT_PUBLIC_BASE_PATH (to "/tile-game");
  // dev, the local static build and the Capacitor builds all want the root.
  // Note `??`, not `||`: an explicit empty base path is a setting, not a gap.
  basePath: process.env.NEXT_PUBLIC_BASE_PATH ?? '',
  images: {
    unoptimized: true,
  },
  optimizeFonts: false,
  transpilePackages: ["@capacitor/preferences", "@capacitor/core"],
};

export default nextConfig;
