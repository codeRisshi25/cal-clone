import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Cal Clone",
  description: "A Cal.com clone scheduling app",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.className} antialiased bg-cal-bg`}>
        <div className="flex min-h-screen">
          <Sidebar />
          {/* Main content — bottom padding on mobile for fixed nav */}
          <main className="flex-1 pb-16 md:pb-0 overflow-y-auto">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
