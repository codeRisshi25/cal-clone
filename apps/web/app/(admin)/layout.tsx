import Sidebar from "@/components/Sidebar";

// Admin layout — wraps event-types, bookings, availability with Sidebar
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      {/* Main content — bottom padding on mobile for fixed nav */}
      <main className="flex-1 pb-16 md:pb-0 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
