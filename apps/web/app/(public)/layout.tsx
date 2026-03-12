// Public layout — no sidebar, clean centered layout for booking pages
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-cal-bg-muted">
      {children}
    </main>
  );
}
