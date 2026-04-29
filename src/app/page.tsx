import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "ProjectIntelligence AU — Roofing DA Digest for Sydney Subbies",
  description:
    "The Sunday-night roofing DA digest for Sydney subbies — 15 LGAs, 5–15 leads, AUD 199/mo, signup in 60 seconds.",
};

const FEATURES = [
  {
    title: "15 Sydney LGAs",
    body: "One Sunday email + SMS. Every DA lodged in your suburbs this week — nothing from the other side of the city.",
  },
  {
    title: "Re-roof vocab, not keywords",
    body: "AI-scored for re-roofing relevance — Colorbond, tile replacement, dwelling re-roof. Not just any DA with 'roof' in it.",
  },
  {
    title: "60-second signup",
    body: "No sales call. Pick your LGAs, choose a plan, and you're done. First digest arrives Sunday at 6 pm AEST.",
  },
];

const PLANS = [
  {
    id: "solo",
    name: "Solo",
    price: "AUD 199/mo",
    seats: "1 seat",
    features: "All 15 LGAs · Email + SMS digest",
  },
  {
    id: "team",
    name: "Team",
    price: "AUD 499/mo",
    seats: "3 seats",
    features: "All 15 LGAs · Email + SMS digest",
  },
];

export default function MarketingPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#FAFAFA]">
      {/* ── Nav ── */}
      <header className="sticky top-0 z-30 bg-white border-b border-[#E5E5E5]">
        <nav
          className="max-w-7xl mx-auto px-4 flex items-center justify-between h-14"
          aria-label="Main navigation"
        >
          <Link
            href="/"
            className="text-[#1E3A5F] font-bold text-base tracking-tight"
            aria-label="ProjectIntelligence AU — home"
          >
            PI-AU
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="px-3 py-2 text-sm font-medium text-[#334E68] hover:text-[#1E3A5F] min-h-[44px] flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D97706] focus-visible:ring-offset-1 rounded"
            >
              Log in
            </Link>
            <Link
              href="/signup"
              className="px-4 py-2 text-sm font-semibold bg-[#D97706] text-white rounded-md hover:bg-[#B45309] min-h-[44px] flex items-center transition-colors duration-[150ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D97706] focus-visible:ring-offset-2"
            >
              Start trial
            </Link>
          </div>
        </nav>
      </header>

      <main id="main-content" className="flex-1">
        {/* ── Hero ── */}
        <section className="bg-white px-4 py-12 md:py-20">
          <div className="max-w-7xl mx-auto md:grid md:grid-cols-2 md:gap-12 md:items-center">
            <div className="space-y-6">
              <h1 className="text-4xl md:text-5xl font-extrabold text-[#102A43] tracking-tight leading-tight">
                The Sunday-night roofing DA digest for Sydney subbies — 15 LGAs,
                5–15 leads, AUD 199/mo, signup in 60 seconds.
              </h1>
              <Link
                href="/signup"
                className="flex items-center justify-center w-full px-6 py-4 text-base font-semibold bg-[#D97706] text-white rounded-md hover:bg-[#B45309] transition-colors duration-[150ms] min-h-[48px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D97706] focus-visible:ring-offset-2 md:w-auto md:inline-flex"
              >
                Start free trial
              </Link>
              <p className="text-sm text-[#627D98]">
                No sales call. 14-day trial. Cancel anytime.
              </p>
            </div>
            <div
              className="hidden md:block rounded-xl bg-[#D4DDE8] aspect-video mt-8 md:mt-0"
              aria-hidden="true"
              role="presentation"
            >
              <div className="h-full flex items-center justify-center text-[#7E99B6] font-medium text-lg">
                Sydney skyline / construction
              </div>
            </div>
          </div>
        </section>

        {/* ── Features ── */}
        <section className="px-4 py-12 bg-[#FAFAFA]" aria-label="Features">
          <div className="max-w-7xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {FEATURES.map((f) => (
                <div
                  key={f.title}
                  className="bg-white rounded-xl border border-[#E5E5E5] p-6 shadow-sm"
                >
                  <h2 className="text-xl font-semibold text-[#1E3A5F] mb-2">
                    {f.title}
                  </h2>
                  <p className="text-sm text-[#627D98] leading-relaxed">{f.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Pricing ── */}
        <section className="px-4 py-12 bg-white" aria-label="Pricing">
          <div className="max-w-7xl mx-auto">
            <h2 className="text-2xl font-bold text-[#102A43] mb-2 tracking-tight">
              Pricing
            </h2>
            <p className="text-sm text-[#627D98] mb-8">
              All prices + GST. No lock-in. 14-day free trial on all plans.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl">
              {PLANS.map((plan) => (
                <div
                  key={plan.id}
                  className="bg-[#FAFAFA] border border-[#E5E5E5] rounded-xl p-6 flex flex-col gap-4"
                >
                  <div>
                    <h3 className="text-xl font-semibold text-[#102A43]">
                      {plan.name}
                    </h3>
                    <p className="text-2xl font-bold text-[#1E3A5F] mt-1">
                      {plan.price}
                    </p>
                    <p className="text-sm text-[#627D98]">
                      {plan.seats} · {plan.features}
                    </p>
                  </div>
                  <Link
                    href={`/signup?plan=${plan.id}`}
                    className="flex items-center justify-center w-full px-4 py-3 text-sm font-semibold bg-[#D97706] text-white rounded-md hover:bg-[#B45309] transition-colors duration-[150ms] min-h-[48px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D97706] focus-visible:ring-offset-2"
                  >
                    Start 14-day trial
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* ── Footer ── */}
      <footer className="bg-[#0A1E30] text-[#9FB3C8] text-sm px-4 py-8">
        <div className="max-w-7xl mx-auto flex flex-wrap gap-4 items-center justify-between">
          <p>© 2026 ProjectIntelligence AU</p>
          <nav aria-label="Footer navigation">
            <ul className="flex flex-wrap gap-4">
              <li>ABN 00 000 000 000</li>
              <li>
                <Link href="/privacy" className="hover:text-white transition-colors">
                  Privacy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="hover:text-white transition-colors">
                  Terms
                </Link>
              </li>
            </ul>
          </nav>
        </div>
      </footer>
    </div>
  );
}
