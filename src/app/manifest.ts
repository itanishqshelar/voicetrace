import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "VoiceTrace",
    short_name: "VoiceTrace",
    description:
      "Voice logging for sales and expenses with AI-powered transcription and insights.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#F8FAFC",
    theme_color: "#4F46E5",
    orientation: "portrait",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
