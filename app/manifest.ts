import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Frequency Atlas",
    short_name: "FreqAtlas",
    description: "Interactive radio-frequency spectrum atlas",
    start_url: `${process.env.NEXT_PUBLIC_BASE_PATH || "/frequency-atlas"}/`,
    display: "standalone",
    background_color: "#07111f",
    theme_color: "#07111f",
    icons: [
      {
        src: `${process.env.NEXT_PUBLIC_BASE_PATH || "/frequency-atlas"}/icon.svg`,
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
