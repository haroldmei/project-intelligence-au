import Link from "next/link";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#F0F4F8] flex flex-col">
      {/* Minimal header */}
      <header className="flex items-center justify-center h-14 border-b border-[#D9E2EC] bg-white">
        <Link
          href="/"
          className="text-[#1E3A5F] font-bold text-base tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D97706] focus-visible:ring-offset-2 rounded"
          aria-label="ProjectIntelligence AU — back to home"
        >
          PI-AU
        </Link>
      </header>

      {/* Centered content */}
      <main
        id="main-content"
        className="flex-1 flex items-start justify-center px-4 py-10 md:items-center"
      >
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}
