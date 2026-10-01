import { GeistMono } from "geist/font/mono";
import { GeistPixelSquare } from "geist/font/pixel";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Basenine Feedback", template: "%s · Basenine Feedback" },
  description: "Visual feedback for Webflow sites, pinned to the exact element.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistPixelSquare.variable} ${GeistMono.variable} h-full`}>
      <head>
        {/* Satoshi is Basenine's brand face (Fontshare, free licence). */}
        <link rel="preconnect" href="https://api.fontshare.com" crossOrigin="" />
        <link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=satoshi@400,500,700&display=swap" />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
