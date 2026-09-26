import type { NextConfig } from "next";

// static-demo branch: the whole site is exported as plain files for GitHub Pages.
// NEXT_PUBLIC_BASE_PATH is "/<repo>" in CI and empty locally.
const nextConfig: NextConfig = {
  output: "export",
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || undefined,
  // /events/abc/ -> events/abc/index.html, which any static host serves without rewrites
  trailingSlash: true,
  devIndicators: false,
};

export default nextConfig;
