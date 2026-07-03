// <!-- WEDGE: The Sunday-night roofing DA digest for Sydney subbies — 15 LGAs, 5–15 leads, AUD 99/mo (GST included), signup in 60 seconds. -->

import Link from "next/link";
import { WaitlistForm } from "./waitlist-form";
import {
  PRICING,
  priceDollars,
  gstComponentDollars,
  PRICE_AMOUNT,
  PRICE_MONTHLY,
  PRICE_MONTHLY_WITH_GST,
  PRICE_MONTHLY_INC_GST,
  GST_SUFFIX,
} from "@/lib/pricing";

// ── JSON-LD Product schema for pricing tiers ──────────────────────────────
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "Product",
  name: "ProjectIntelligence AU — Sunday Roofing DA Digest",
  description:
    "Weekly email + SMS digest of 5–15 roofing DA leads across 15 Greater Sydney LGAs. Delivered every Sunday at 6 pm AEST.",
  brand: {
    "@type": "Brand",
    name: "ProjectIntelligence AU",
  },
  offers: [
    {
      "@type": "Offer",
      name: PRICING.planName,
      price: String(priceDollars),
      priceCurrency: PRICING.currency,
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        price: String(priceDollars),
        priceCurrency: PRICING.currency,
        billingDuration: "P1M",
        unitCode: "MON",
        valueAddedTaxIncluded: PRICING.gstInclusive,
      },
      eligibleQuantity: {
        "@type": "QuantitativeValue",
        value: 1,
        unitText: "seat",
      },
      description: "1 seat. All 15 Sydney LGAs. Email + SMS digest.",
      url: "https://projectintelligence.com.au/signup?plan=solo",
    },
  ],
};

// ── Feature blocks — verbatim copy from docs/17-positioning.md §6 ─────────
const FEATURES = [
  {
    id: "digest",
    step: "Step 5",
    title: "Sunday digest. 15 LGAs. One email.",
    today:
      "You open four council portals Sunday night, give up on the other 11, and still miss the good jobs.",
    withUs:
      "One email at 6 pm Sunday covers all 15 Greater Sydney LGAs — Western Sydney, Inner West, Northern, Southern — in a single scan.",
    detail:
      "Cordell Connect sends a state-wide fire-hose of 47 alerts; you manually triage 6 hours to find 3 real roofing leads. We cover the 15 LGAs in your service area, sorted into the three lead classes the data supports — builder pipeline, fast-track CDC, and strata & heritage — and ranked to the top 5–15 jobs you'd actually quote.",
  },
  {
    id: "vocab",
    step: "Step 4",
    title: "Roofing vocabulary, not keyword soup.",
    today:
      "Cordell keyword-matches \"roof\" across all trades — you get hospital cladding in Newcastle and granny-flat pergolas in Wollongong.",
    withUs:
      "Our relevance layer is trained on roofing language — re-roof, membrane replacement, Colorbond, asbestos roof removal, guttering — not generic construction categories.",
    detail:
      "We score every DA against the vocabulary a roofer actually uses. Before launch we tested on 500 labelled Sydney DA records. The target: 70% of the leads in your digest are genuine roofing jobs you could quote — new-build and alterations pipeline, fast-track CDC re-roofs, and strata & heritage work. Cordell's current precision on the same set is around 6%.",
  },
  {
    id: "signup",
    step: "Step 1",
    title: "Signup in 60 seconds. No sales call.",
    today:
      "Cordell's signup is a demo booking, a quote, 3–10 business days, and an annual contract you can't cancel online.",
    withUs:
      "Email, mobile, card. Done. 28-day trial, first digest this Sunday.",
    detail:
      "Pick your LGA bundles from a pre-built list (Western Sydney, Inner West, Northern, Southern — or all four). Your roofing saved search is pre-seeded. Card on file; not charged for 28 days. Cancel anytime from Account → Subscription — no ticket, no phone call, no hostage situation.",
  },
] as const;

// ── Pricing tiers — LOCKED (docs/16-pricing.md) ───────────────────────────
const PLANS = [
  {
    id: "solo",
    name: PRICING.planName,
    tagline: "For owner-operators who quote their own work.",
    price: priceDollars,
    seats: "1 seat",
    highlight: true,
    includes: [
      "1 seat — your Sunday digest, your phone",
      "All 15 Greater Sydney LGAs (Western Sydney, Inner West, Northern, Southern)",
      "Weekly email digest: 5–15 roofing DAs, ranked by relevance",
      "Sunday SMS: top-3 leads to your +61 mobile",
      "Trained on roofing vocabulary (not keyword soup)",
      "Thumbs feedback — your digest gets smarter each week",
      "Cancel anytime from your account — no support call",
    ],
    finePrint: `${PRICE_MONTHLY_WITH_GST}. Card required. No charge for ${PRICING.trialDays} days. Cancel anytime.`,
  },
  // Multi-seat (formerly "Team") not in scope yet. When it ships, add a new
  // PLANS entry here AND re-enable the picker in /plan, plus put the Schema.org
  // Offer back into the JSON-LD block above.
] as const;

// ── Competitor comparison data — docs/16-pricing.md §7.5 ─────────────────
const COMPARISON = [
  {
    label: "Price",
    piSolo: PRICE_MONTHLY_INC_GST,
    cordell: "AUD 577.50/mo inc GST",
    estimateOne: "AUD 250/mo",
    leadManager: "~AUD 333/mo¹",
  },
  {
    label: "Self-serve signup",
    piSolo: "Yes — 60 seconds",
    cordell: "No — sales call",
    estimateOne: "Limited",
    leadManager: "No — demo only",
  },
  {
    label: "Sunday digest cadence",
    piSolo: "Yes",
    cordell: "No",
    estimateOne: "No",
    leadManager: "No",
  },
  {
    label: "Trade scope",
    piSolo: "Roofing only",
    cordell: "All trades",
    estimateOne: "All trades (tender)",
    leadManager: "All trades",
  },
  {
    label: "AI relevance",
    piSolo: "Yes — roofing vocab",
    cordell: "No",
    estimateOne: "No",
    leadManager: "No",
  },
  {
    label: "28-day trial",
    piSolo: "Yes — card on file",
    cordell: "Demo only",
    estimateOne: "Limited trial",
    leadManager: "Demo only",
  },
  {
    label: "Cancel anytime",
    piSolo: "Yes — in-app",
    cordell: "No",
    estimateOne: "Yes",
    leadManager: "Unknown",
  },
  {
    label: "SMS alerts",
    piSolo: "Yes",
    cordell: "No",
    estimateOne: "No",
    leadManager: "No",
  },
] as const;

// ── FAQ snippets — docs/16-pricing.md §7.7 ───────────────────────────────
const FAQS = [
  {
    q: "Why do you require a card for the trial?",
    a: "To reduce abuse. We reviewed 28 days of real DA data for your LGAs before you even open the first digest — that costs us money and time. The card is how we know you're serious. You won't be charged until day 29, and you can cancel in-app anytime before then.",
  },
  {
    q: `Is the ${PRICE_AMOUNT} price inclusive or exclusive of GST?`,
    a: `Inclusive. ${PRICE_MONTHLY} is the all-in price you pay — GST is built in. Your invoice still itemises the GST component (~${PRICING.currency} ${gstComponentDollars}) separately so you can claim it as a business expense.`,
  },
  {
    q: "What happens if I cancel?",
    a: "Your access continues until the end of your paid period. No prorating, no drama. Cancel from Account → Subscription — no support ticket needed.",
  },
  {
    q: "Can I get a refund?",
    a: "If you've had zero digest interactions (never clicked a DA, never given feedback) and you're charged on day 29, we'll refund the full amount within 7 days. Just email us. No questions asked.",
  },
] as const;

// ─────────────────────────────────────────────────────────────────────────────

export default function MarketingPage() {
  return (
    <>
      {/* ── JSON-LD schema ──────────────────────────────────────────────── */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="min-h-screen flex flex-col bg-[#FAFAFA]">
        {/* ── Skip link (WCAG 2.4.1) ──────────────────────────────────── */}
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>

        {/* ── Sticky nav ───────────────────────────────────────────────── */}
        <header className="sticky top-0 z-30 bg-white border-b border-[#E5E5E5]">
          <nav
            className="max-w-7xl mx-auto px-4 flex items-center justify-between h-14"
            aria-label="Main navigation"
          >
            <Link
              href="/"
              className="text-[#1E3A5F] font-bold text-base tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D97706] focus-visible:ring-offset-1 rounded"
              aria-label="ProjectIntelligence AU — home"
            >
              PI-AU
            </Link>
            <div className="flex items-center gap-2">
              <Link
                href="/login"
                className="px-3 py-2 text-sm font-medium text-[#334E68] hover:text-[#1E3A5F] min-h-[44px] flex items-center transition-colors duration-[150ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D97706] focus-visible:ring-offset-1 rounded"
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

          {/* ═══════════════════════════════════════════════════════════════
              HERO SECTION
              Headline verbatim per locked constraint.
          ═══════════════════════════════════════════════════════════════ */}
          <section className="bg-white px-4 py-12 md:py-20" aria-label="Hero">
            <div className="max-w-7xl mx-auto md:grid md:grid-cols-2 md:gap-12 md:items-center">
              {/* Left column — copy */}
              <div className="space-y-6">
                {/* Eyebrow — docs/17-positioning.md §5 */}
                <p className="text-xs font-semibold uppercase tracking-widest text-[#D97706]">
                  Sydney Roofing Leads
                </p>

                {/* Headline — LOCKED verbatim per task constraint */}
                <h1 className="text-4xl md:text-5xl font-extrabold text-[#102A43] tracking-tight leading-[1.15]">
                  The Sunday roofing digest for Sydney subbies.
                </h1>

                {/* Sub-headline — docs/17-positioning.md §5 + §9. Honest
                    three-class framing (issue #14): DA data structurally misses
                    like-for-like re-roofs, so we name the lead classes the data
                    genuinely supports rather than imply exhaustive re-roof
                    coverage. */}
                <p className="text-base md:text-lg text-[#334E68] leading-relaxed max-w-prose">
                  DA, CDC and strata signals across 15 Sydney LGAs — builder
                  pipeline, fast-track CDC, and strata &amp; heritage leads,
                  every Sunday at 6&nbsp;pm.
                  {" "}{PRICE_MONTHLY} ({GST_SUFFIX}). No sales call.
                </p>

                {/* Primary CTA */}
                <div className="flex flex-col sm:flex-row gap-3">
                  <Link
                    href="/signup"
                    className="flex items-center justify-center w-full sm:w-auto px-6 py-4 text-base font-semibold bg-[#D97706] text-white rounded-md hover:bg-[#B45309] transition-colors duration-[150ms] min-h-[48px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D97706] focus-visible:ring-offset-2"
                  >
                    Start free trial
                  </Link>
                  <a
                    href="#how-it-works"
                    className="flex items-center justify-center w-full sm:w-auto px-6 py-4 text-base font-medium text-[#1E3A5F] border border-[#A9BBCF] rounded-md hover:bg-[#EEF2F7] transition-colors duration-[150ms] min-h-[48px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D97706] focus-visible:ring-offset-2"
                  >
                    See how it works
                  </a>
                </div>

                {/* Trust micro-copy — docs/17-positioning.md §9 */}
                <p className="text-sm text-[#627D98]">
                  No sales call. 28-day trial. Cancel anytime.
                </p>
              </div>

              {/* Right column — digest mockup placeholder */}
              <div
                className="hidden md:flex md:items-center md:justify-center rounded-xl bg-[#EEF2F7] aspect-video mt-8 md:mt-0 border border-[#D4DDE8] p-6"
                aria-hidden="true"
                role="presentation"
              >
                {/* Digest card mockup — no external image dep */}
                <div className="w-full max-w-xs space-y-3">
                  <p className="text-xs font-semibold text-[#627D98] uppercase tracking-wide">
                    Your digest · Sun 27 Apr · 12 leads
                  </p>
                  {[
                    { lga: "Western Sydney", addr: "12 Acacia Ave, Penrith NSW 2750", val: "Est. AUD 180k", why: "Tile-to-metal re-roof, CDC pathway", cls: "Fast-track", clsClass: "bg-[#E0F2FE] text-[#0C4A6E]" },
                    { lga: "Hills District", addr: "4 Banksia Rd, Castle Hill NSW 2154", val: "Est. AUD 95k", why: "Class-2 membrane remediation, strata block", cls: "Strata & heritage", clsClass: "bg-[#F3E8FF] text-[#6B21A8]" },
                    { lga: "Inner West", addr: "88 Parramatta Rd, Leichhardt NSW 2040", val: "Est. AUD 210k", why: "Alterations & additions — head-contractor lead", cls: "Builder pipeline", clsClass: "bg-[#E2E8F0] text-[#334155]" },
                  ].map((card) => (
                    <div
                      key={card.addr}
                      className="bg-white rounded-md border border-[#E5E5E5] p-3 shadow-sm"
                    >
                      <div className="flex flex-wrap items-center gap-1 mb-1">
                        <span className="inline-block text-xs font-semibold bg-[#FEF3C7] text-[#78350F] rounded px-2 py-0.5">
                          {card.lga}
                        </span>
                        <span className={`inline-block text-xs font-semibold rounded px-2 py-0.5 ${card.clsClass}`}>
                          {card.cls}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-[#102A43] leading-snug">
                        {card.addr}
                      </p>
                      <p className="text-xs text-[#627D98]">{card.val}</p>
                      <p className="text-xs italic text-[#486581] mt-0.5">{card.why}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* ═══════════════════════════════════════════════════════════════
              SOCIAL PROOF BAR — competitive anchor numbers
          ═══════════════════════════════════════════════════════════════ */}
          <section
            className="bg-[#1E3A5F] px-4 py-6"
            aria-label="Key facts"
          >
            <div className="max-w-7xl mx-auto">
              <dl className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                {[
                  { dt: "15", dd: "Sydney LGAs covered" },
                  { dt: "5–15", dd: "roofing leads per digest" },
                  { dt: "70%", dd: "target precision vs Cordell 6%" },
                  { dt: "60 sec", dd: "to signup, no sales call" },
                ].map(({ dt, dd }) => (
                  <div key={dd} className="space-y-1">
                    <dt className="text-2xl font-extrabold text-[#D97706]">{dt}</dt>
                    <dd className="text-xs text-[#9FB3C8] leading-snug">{dd}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </section>

          {/* ═══════════════════════════════════════════════════════════════
              FEATURE BLOCKS (3)
              Tied to wedge workflow steps 5, 4, 1 per locked constraint.
          ═══════════════════════════════════════════════════════════════ */}
          <section
            id="how-it-works"
            className="px-4 py-14 bg-[#FAFAFA]"
            aria-label="How it works"
          >
            <div className="max-w-7xl mx-auto">
              <h2 className="text-2xl md:text-3xl font-bold text-[#102A43] tracking-tight mb-2">
                How it works
              </h2>
              <p className="text-sm text-[#627D98] mb-10 max-w-2xl">
                One workflow. Sunday night. Your phone.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {FEATURES.map((f) => (
                  <article
                    key={f.id}
                    className="bg-white rounded-xl border border-[#E5E5E5] p-6 shadow-sm flex flex-col gap-4"
                  >
                    <div>
                      <span className="text-xs font-semibold uppercase tracking-widest text-[#D97706]">
                        {f.step}
                      </span>
                      <h3 className="text-xl font-semibold text-[#1E3A5F] mt-2 leading-snug">
                        {f.title}
                      </h3>
                    </div>
                    <div className="space-y-3 text-sm text-[#334E68] leading-relaxed">
                      <div>
                        <p className="font-semibold text-[#627D98] mb-0.5">Today</p>
                        <p>{f.today}</p>
                      </div>
                      <div>
                        <p className="font-semibold text-[#1E3A5F] mb-0.5">With PI-AU</p>
                        <p>{f.withUs}</p>
                      </div>
                      <p className="text-[#627D98]">{f.detail}</p>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>

          {/* ═══════════════════════════════════════════════════════════════
              PRICING SECTION
              Single Solo price + trial length come from src/lib/pricing.ts
              (source of truth) — card-on-file trial · cancel in-app
          ═══════════════════════════════════════════════════════════════ */}
          <section
            id="pricing"
            className="px-4 py-14 bg-white"
            aria-label="Pricing"
          >
            <div className="max-w-7xl mx-auto">
              {/* Trial banner — docs/16-pricing.md §7.2 */}
              <div className="bg-[#FEF3C7] border border-[#FCD34D] rounded-xl p-4 mb-8 text-sm text-[#78350F] max-w-3xl">
                <strong>Start your 28-day free trial.</strong> Card required — charged on day&nbsp;29 only if you don&apos;t cancel. Full refund within 7&nbsp;days of first charge if you had zero digest interactions.
              </div>

              {/* Headline — docs/16-pricing.md §7.1 */}
              <h2 className="text-2xl md:text-3xl font-bold text-[#102A43] tracking-tight mb-2">
                Simple pricing. No surprises. Cancel anytime.
              </h2>
              <p className="text-sm text-[#627D98] mb-10">
                One plan for owner-operators. No sales call. No annual lock-in.
              </p>

              {/* Pricing cards */}
              <div className="grid grid-cols-1 gap-6 max-w-md mb-12">
                {PLANS.map((plan) => (
                  <div
                    key={plan.id}
                    className={`rounded-xl border p-6 flex flex-col gap-5 ${
                      plan.highlight
                        ? "border-[#D97706] bg-[#FFFBEB] shadow-md"
                        : "border-[#E5E5E5] bg-[#FAFAFA] shadow-sm"
                    }`}
                  >
                    {plan.highlight && (
                      <span className="self-start text-xs font-semibold uppercase tracking-widest bg-[#D97706] text-white px-3 py-1 rounded-full">
                        {PRICING.trialDays}-day free trial
                      </span>
                    )}
                    <div>
                      <h3 className="text-xl font-bold text-[#102A43]">{plan.name}</h3>
                      <p className="text-sm text-[#627D98] mt-0.5">{plan.tagline}</p>
                    </div>
                    <div>
                      <p className="text-3xl font-extrabold text-[#1E3A5F]">
                        {PRICE_AMOUNT}
                        <span className="text-lg font-semibold">/mo</span>
                      </p>
                      <p className="text-xs text-[#627D98] mt-0.5">
                        {GST_SUFFIX} · {plan.seats}
                      </p>
                    </div>
                    <ul className="space-y-2" aria-label={`${plan.name} plan features`}>
                      {plan.includes.map((item) => (
                        <li key={item} className="flex items-start gap-2 text-sm text-[#334E68]">
                          <svg
                            className="shrink-0 mt-0.5 text-[#16A34A]"
                            width="16"
                            height="16"
                            viewBox="0 0 16 16"
                            fill="none"
                            aria-hidden="true"
                          >
                            <path
                              d="M3 8l3.5 3.5L13 4"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                          {item}
                        </li>
                      ))}
                    </ul>
                    <Link
                      href={`/signup?plan=${plan.id}`}
                      className="flex items-center justify-center w-full px-4 py-3 text-sm font-semibold bg-[#D97706] text-white rounded-md hover:bg-[#B45309] transition-colors duration-[150ms] min-h-[48px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D97706] focus-visible:ring-offset-2"
                    >
                      Start {PRICING.trialDays}-day trial
                    </Link>
                    <p className="text-xs text-[#A3A3A3] leading-relaxed">{plan.finePrint}</p>
                  </div>
                ))}
              </div>

              {/* ── Comparison table ──────────────────────────────────── */}
              <h3 className="text-lg font-bold text-[#102A43] mb-4">
                How we compare
              </h3>
              <div className="overflow-x-auto -mx-4 px-4">
                <table className="w-full text-sm border-collapse min-w-[600px]" aria-label="Pricing comparison">
                  <thead>
                    <tr className="border-b border-[#E5E5E5]">
                      <th scope="col" className="text-left py-3 pr-4 text-[#627D98] font-semibold w-36">
                        &nbsp;
                      </th>
                      <th scope="col" className="text-left py-3 px-3 text-[#1E3A5F] font-bold bg-[#EEF2F7] rounded-t">
                        PI-AU Solo
                      </th>
                      <th scope="col" className="text-left py-3 px-3 text-[#627D98] font-semibold">
                        Cordell Connect Lite
                      </th>
                      <th scope="col" className="text-left py-3 px-3 text-[#627D98] font-semibold">
                        EstimateOne
                      </th>
                      <th scope="col" className="text-left py-3 px-3 text-[#627D98] font-semibold">
                        LeadManager
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {COMPARISON.map((row, i) => (
                      <tr
                        key={row.label}
                        className={i % 2 === 0 ? "bg-white" : "bg-[#FAFAFA]"}
                      >
                        <td className="py-2.5 pr-4 text-[#627D98] font-medium">{row.label}</td>
                        <td className="py-2.5 px-3 text-[#102A43] font-medium">{row.piSolo}</td>
                        <td className="py-2.5 px-3 text-[#627D98]">{row.cordell}</td>
                        <td className="py-2.5 px-3 text-[#627D98]">{row.estimateOne}</td>
                        <td className="py-2.5 px-3 text-[#627D98]">{row.leadManager}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-[#A3A3A3] mt-3">
                ¹ LeadManager publishes no self-serve price; ~AUD&nbsp;333/mo is the midpoint of the AUD&nbsp;4–15k/yr Lite range customers report after a sales call.
              </p>
            </div>
          </section>

          {/* ═══════════════════════════════════════════════════════════════
              FAQ SECTION
          ═══════════════════════════════════════════════════════════════ */}
          <section
            className="px-4 py-14 bg-[#FAFAFA]"
            aria-label="Frequently asked questions"
          >
            <div className="max-w-3xl mx-auto">
              <h2 className="text-2xl font-bold text-[#102A43] tracking-tight mb-8">
                Common questions
              </h2>
              <dl className="space-y-6">
                {FAQS.map(({ q, a }) => (
                  <div key={q} className="border-b border-[#E5E5E5] pb-6 last:border-0">
                    <dt className="text-base font-semibold text-[#1E3A5F] mb-2">{q}</dt>
                    <dd className="text-sm text-[#334E68] leading-relaxed">{a}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </section>

          {/* ═══════════════════════════════════════════════════════════════
              FINAL CTA — repeat signup
          ═══════════════════════════════════════════════════════════════ */}
          <section
            className="px-4 py-14 bg-[#1E3A5F] text-white"
            aria-label="Get started"
          >
            <div className="max-w-xl mx-auto text-center space-y-6">
              <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight">
                Ready for your first Sunday digest?
              </h2>
              <p className="text-[#9FB3C8] text-sm leading-relaxed">
                {PRICE_MONTHLY_WITH_GST}. {PRICING.trialDays}-day trial. First digest arrives this Sunday at 6&nbsp;pm. Cancel anytime — no ticket, no phone call.
              </p>
              <Link
                href="/signup"
                className="inline-flex items-center justify-center w-full sm:w-auto px-8 py-4 text-base font-semibold bg-[#D97706] text-white rounded-md hover:bg-[#B45309] transition-colors duration-[150ms] min-h-[48px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D97706] focus-visible:ring-offset-2 focus-visible:ring-offset-[#1E3A5F]"
              >
                Start free trial
              </Link>
              <p className="text-xs text-[#627D98]">No sales call. No lock-in.</p>
            </div>
          </section>

          {/* ═══════════════════════════════════════════════════════════════
              WAITLIST — out-of-scope demand capture (issue #25).
              Not a product promise; measures who's asking so we know where to
              go next. The wedge copy above is untouched.
          ═══════════════════════════════════════════════════════════════ */}
          <section
            id="waitlist"
            className="px-4 py-14 bg-[#F5F7FA] border-t border-[#E4E7EB]"
            aria-labelledby="waitlist-heading"
          >
            <div className="max-w-xl mx-auto space-y-5">
              <div className="space-y-2">
                <h2
                  id="waitlist-heading"
                  className="text-2xl font-extrabold text-[#102A43] tracking-tight"
                >
                  Not a Sydney roofer?
                </h2>
                <p className="text-sm text-[#486581] leading-relaxed">
                  We only cover roofing in Greater Sydney today. Tell us your trade and
                  city and we&apos;ll email you when it opens — no spam, no sales call.
                </p>
              </div>
              <WaitlistForm />
            </div>
          </section>

        </main>

        {/* ═══════════════════════════════════════════════════════════════════
            FOOTER — anti-positioning + legal stubs
            LOCKED: "Not for multi-trade contractors, head-contractor tender
            flow, or national/multi-state rollouts."
        ═══════════════════════════════════════════════════════════════════ */}
        <footer className="bg-[#0A1E30] text-[#9FB3C8] text-sm px-4 py-8">
          <div className="max-w-7xl mx-auto space-y-6">

            {/* Anti-positioning — verbatim per locked constraint */}
            <div className="bg-[#102A43] rounded-lg p-4 text-xs text-[#7E99B6] leading-relaxed max-w-3xl">
              <strong className="text-[#9FB3C8] font-semibold">Not for:</strong>{" "}
              multi-trade contractors, head-contractor tender flow, or national/multi-state rollouts.
              Roofing subbies in Greater Sydney only. Other cities and trades go on a waitlist.
            </div>

            <div className="flex flex-wrap gap-4 items-center justify-between">
              <p className="text-[#627D98]">© 2026 ProjectIntelligence AU · ABN 00&nbsp;000&nbsp;000&nbsp;000</p>
              <nav aria-label="Footer navigation">
                <ul className="flex flex-wrap gap-x-5 gap-y-2">
                  <li>
                    <Link
                      href="/privacy"
                      className="hover:text-white transition-colors duration-[150ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D97706] rounded"
                    >
                      Privacy Policy
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/terms"
                      className="hover:text-white transition-colors duration-[150ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D97706] rounded"
                    >
                      Terms of Service
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/acceptable-use"
                      className="hover:text-white transition-colors duration-[150ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D97706] rounded"
                    >
                      AUP
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/#pricing"
                      className="hover:text-white transition-colors duration-[150ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D97706] rounded"
                    >
                      Pricing
                    </Link>
                  </li>
                </ul>
              </nav>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
