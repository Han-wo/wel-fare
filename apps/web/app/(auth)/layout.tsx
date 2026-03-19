export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell hero-grid min-h-screen px-4 py-8 md:px-6 md:py-10">
      <main className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-6xl items-center justify-center">
        {children}
      </main>
    </div>
  );
}
