import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ProjectIntelligence",
    short_name: "PI-AU",
    description: "Sunday-night roofing DA digest for Sydney.",
    start_url: "/digest",
    display: "standalone",
    background_color: "#F0F4F8",
    theme_color: "#1E3A5F",
    icons: [
      { src: "/icon", sizes: "32x32", type: "image/png" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
