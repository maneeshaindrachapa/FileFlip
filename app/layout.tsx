import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FlipFile | Free Online Converters | Fast, Private, No Upload",
  description:
    "End-to-end Conversion Platform - From media files to units — convert everything you need in seconds,right in your browser.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        {/* AdSense - Replace this once adsense is approved ca-pub-XXXXXXXXXXXXXXXX */}
        <script
          async
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-XXXXXXXXXXXXXXXX"
          crossOrigin="anonymous"
        ></script>
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
