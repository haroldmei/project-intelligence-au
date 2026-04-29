import type { Metadata } from "next";

// <!-- WEDGE: The Sunday-night roofing DA digest for Sydney subbies — 15 LGAs, 5–15 leads, AUD 199/mo, signup in 60 seconds. -->

export const metadata: Metadata = {
  // SEO — verbatim from docs/17-positioning.md §9 snippet bank
  title:
    "ProjectIntelligence AU — Sunday roofing DA digest for Sydney subbies",
  description:
    "Get 5–15 curated re-roof DA leads across 15 Greater Sydney LGAs every Sunday at 6 pm. AUD 199/mo + GST. 14-day trial. No annual lock-in.",

  // Open Graph
  openGraph: {
    title: "ProjectIntelligence AU — Sydney Roofing DA Digest",
    description:
      "Weekly email + SMS digest of 5–15 re-roof DAs across 15 Sydney LGAs. AUD 199/mo. 14-day trial. No sales call. Signup in 60 seconds.",
    url: "https://projectintelligence.com.au",
    siteName: "ProjectIntelligence AU",
    locale: "en_AU",
    type: "website",
  },

  // Twitter card
  twitter: {
    card: "summary_large_image",
    title: "ProjectIntelligence AU — Sydney Roofing DA Digest",
    description:
      "Weekly email + SMS digest of 5–15 re-roof DAs across 15 Sydney LGAs. AUD 199/mo. 14-day trial. No sales call. Signup in 60 seconds.",
  },

  // Robots
  robots: {
    index: true,
    follow: true,
  },
};

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
