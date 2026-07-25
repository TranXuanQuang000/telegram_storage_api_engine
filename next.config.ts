import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
    remotePatterns: [
      { protocol: "https", hostname: "img.otruyenapi.com", pathname: "/uploads/comics/**" },
      { protocol: "https", hostname: "**.otruyencdn.com", pathname: "/uploads/**" },
      { protocol: "https", hostname: "s4.anilist.co", pathname: "/file/anilistcdn/**" },
      { protocol: "https", hostname: "uploads.mangadex.org", pathname: "/covers/**" },
    ],
  },
};

export default nextConfig;
