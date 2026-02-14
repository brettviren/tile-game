/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || "",
  images: {
    unoptimized: true,
  },
  transpilePackages: ["lucide-react", "@capacitor/preferences", "@capacitor/core"],
};

export default nextConfig;
