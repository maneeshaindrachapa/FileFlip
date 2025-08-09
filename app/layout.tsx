import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";

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
      <body className="antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <div className="fixed inset-0 -z-10 flex items-center justify-center">
            <div className="h-[500px] w-[500px] rounded-full bg-blue-600/20 blur-3xl" />
            <div className="h-[520px] w-[520px] rounded-full bg-indigo-600/20 blur-3xl" />
          </div>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
