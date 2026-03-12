import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";

export const metadata: Metadata = {
  title: "Cal Clone",
  description: "A Cal.com clone scheduling app",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased bg-gray-50">
        <div className="flex min-h-screen">
          <Sidebar />
          {/* Main content — on mobile we add bottom padding for the fixed nav */}
          <main className="flex-1 pb-16 md:pb-0">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
