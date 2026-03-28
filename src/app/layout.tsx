import type { Metadata, Viewport } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import Navbar from "@/components/Navbar";
import ChatFab from "@/components/chat/ChatFab";
import PWARegister from "@/components/PWARegister";
import Script from "next/script";
import { Inter, JetBrains_Mono } from "next/font/google";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const jetBrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
});

export const metadata: Metadata = {
  title: "VoiceTrace — Voice to Business Intelligence",
  description:
    "Speak your daily sales in Hindi, English, or Hinglish. VoiceTrace converts voice into structured data, stores it, and generates AI-powered insights for street vendors.",
  keywords: [
    "voice",
    "sales",
    "tracking",
    "AI",
    "street vendor",
    "Hindi",
    "business intelligence",
  ],
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "VoiceTrace",
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: "#4F46E5",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`h-full antialiased ${inter.variable} ${jetBrainsMono.variable}`}
    >
      <body className={`${inter.className} min-h-full flex`}>
        {/* Hidden Google Translate widget */}
        <div id="google_translate_element" style={{ display: "none" }} />
        <Sidebar />
        <div className="flex-1 flex flex-col min-h-screen overflow-x-hidden">
          <Navbar />
          {children}
        </div>
        <ChatFab />
        <Script
          id="google-translate-init"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              function googleTranslateElementInit() {
                new google.translate.TranslateElement({
                  pageLanguage: 'en',
                  includedLanguages: 'en,hi,mr',
                  autoDisplay: false
                }, 'google_translate_element');
              }
            `,
          }}
        />
        <Script
          src="https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit"
          strategy="afterInteractive"
        />
        <PWARegister />
      </body>
    </html>
  );
}
