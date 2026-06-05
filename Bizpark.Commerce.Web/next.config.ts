import type { NextConfig } from "next";

function apiUploadHost(): string | null {
  try {
    const raw = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000/api";
    return new URL(raw.replace(/\/api\/?$/, "/")).hostname;
  } catch {
    return null;
  }
}

function supabaseProjectHost(): string | null {
  try {
    const raw = process.env.NEXT_PUBLIC_SUPABASE_PROJECT_URL || process.env.SUPABASE_PROJECT_URL;
    if (!raw) return null;
    return new URL(raw).hostname;
  } catch {
    return null;
  }
}

const uploadHost = apiUploadHost();
const supabaseHost = supabaseProjectHost();

const nextConfig: NextConfig = {
  output: "standalone",
  reactCompiler: true,
  images: {
    remotePatterns: [
      { protocol: "http", hostname: "localhost", pathname: "/uploads/**" },
      { protocol: "https", hostname: "*.blob.core.windows.net", pathname: "/**" },
      ...(uploadHost && uploadHost !== "localhost"
        ? [{ protocol: "https" as const, hostname: uploadHost, pathname: "/uploads/**" }]
        : []),
      ...(supabaseHost
        ? [{ protocol: "https" as const, hostname: supabaseHost, pathname: "/storage/v1/object/public/**" }]
        : [{ protocol: "https" as const, hostname: "*.supabase.co", pathname: "/storage/v1/object/public/**" }]),
    ],
  },
};

export default nextConfig;
