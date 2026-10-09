import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A streamed <link rel="manifest"> lands after </head> and Chrome ignores it.
  // Keep metadata in the initial head so individual and collection PWAs install.
  htmlLimitedBots: /.*/,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.supabase.co",
      },
    ],
  },
};

export default nextConfig;
