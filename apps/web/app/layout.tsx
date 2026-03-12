import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Cal Clone",
  description: "A Cal.com clone scheduling app",
};

// Root layout — just the HTML shell. Route groups handle their own chrome.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.className} antialiased bg-cal-bg`}>
        {children}
      </body>
    </html>
  );
}
