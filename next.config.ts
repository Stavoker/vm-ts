import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
  serverExternalPackages: ["playwright", "pdfkit", "@google-analytics/data", "google-gax"],
  outputFileTracingIncludes: {
    "/api/analytics/reports/**": ["./public/fonts/**"],
  },
};

export default nextConfig;
