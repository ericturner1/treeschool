const allowedOrigins = [
  "dev.treehomeschool.com",
  process.env.NEXT_PUBLIC_APP_HOST,
  process.env.NEXT_PUBLIC_APP_URL?.replace(/^https?:\/\//, "")
].filter(Boolean);

/** @type {import("next").NextConfig} */
const nextConfig = {
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  allowedDevOrigins: allowedOrigins,
  experimental: {
    typedRoutes: true,
    serverActions: {
      allowedOrigins,
      bodySizeLimit: "205mb"
    }
  }
};

export default nextConfig;
