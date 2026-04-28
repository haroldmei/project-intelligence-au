# Competitor Teardown — EstimateOne

**Screenshots analysed:**
- `estimateone-desktop.png` — EstimateOne homepage, 1280px viewport
- `estimateone-mobile.png` — EstimateOne homepage, 375px viewport

---

## Layout / Information Architecture

EstimateOne's homepage is a **two-column above-the-fold hero** (desktop): left column is a dark navy background with large white headline ("Find and win construction tenders direct from builders"), a short value-prop paragraph, and a green "Get started" CTA button. Right column is a full-bleed construction crane photo. Below the fold, the page scrolls through several content sections separated by alternating light grey and very light mint backgrounds.

Navigation bar: white bar with the E1 logo, a multi-tier mega-menu (Head Contractor, Subcontractor, Supplier, Tenders, Resources), Login and a green "Create an account" CTA. The nav explicitly segments by user type — a sensible IA choice for a multi-sided platform.

Mobile: the two-column hero collapses to single-column with the image clipped to a narrow horizontal band at top. Navigation collapses to hamburger. The headline font scale holds surprisingly well at 375px — readable above the fold. CTA is full-width below the subtext. However, the page becomes very tall on mobile — sections below the fold are sparse with single image + single text blocks taking enormous vertical space.

Page depth is very long — both desktop and mobile screenshots show 8000–11000px of page height. Content below the fold includes: a "6 reasons to love E1" section (the stylised wire-frame "6" graphic), feature breakdowns, and a standard marketing footer. The content below fold is mostly empty in the screenshots — possibly deferred loading.

---

## Density

**Low (marketing page).** EstimateOne's homepage is a pure conversion funnel: two CTAs (Login / Create an account), a hero, and marketing copy. No actual tender listings are visible on the public page — that's all gated. The page is intentionally sparse and modern, leaning into the "platform brand" aesthetic rather than showing data. Compared to BCI Central (which surfaces real project data on public pages), EstimateOne keeps the public surface clean.

---

## Colour

- **Primary:** Deep navy / dark teal (`#0A2540` approx.) — used for the hero background panel, nav elements, and footer.
- **Accent:** Emerald green (`#00C27C` approx.) — used for "Get started" and "Create an account" CTAs. High contrast against both navy and white. This green is energetic and distinctive.
- **Background:** White and very light grey alternating sections.
- **Text:** White on navy (hero), near-black `#1A1A1A` on white (body sections).

The navy + emerald green combination is clean and confident. The green CTA on navy background exceeds WCAG AA contrast easily (~8:1 estimated). The palette reads as a modern fintech/proptech brand — not specifically construction. This is intentional: E1 is positioning away from heavy-industry aesthetics toward a digital-platform feel.

---

## Typography

EstimateOne uses what appears to be a modern geometric sans-serif (possibly Inter or a custom variant). Headlines are bold weight, large scale (~48–56px desktop), with tight letter-spacing. The headline "Find and win construction tenders direct from builders" is punchy and benefit-led. Body copy is ~16px, regular weight, line-height approximately 1.6. Type hierarchy is clear: H1 → supporting paragraph → CTA.

Mobile type scale holds well: H1 drops to approximately 32–36px, still dominant above the fold. No serif elements; entirely sans-serif.

The "6" wire-frame graphic in the mid-page section is an unusual typographic design choice — a large sculptural numeral made of wire/mesh material. It reads as "award-winning design studio" rather than "construction industry platform" — deliberately premium.

---

## What They Nail

1. **Role-based navigation IA.** Head Contractor / Subcontractor / Supplier mega-menu immediately orients every buyer type. A roofing subcontractor knows exactly where to click. This is the correct IA pattern for a multi-sided marketplace.
2. **"Create an account" as primary CTA.** Unlike Cordell (contact sales) and BCI (blurred paywall), EstimateOne leads with self-serve signup. This is the right conversion motion for SMB subcontractors.
3. **Emerald green CTA contrast.** The green button pops dramatically against both the navy hero and white sections. On mobile it becomes a full-width tap target — highly accessible.
4. **Clean, modern brand.** The navy + emerald palette and sculptural typographic elements position E1 as a tech-forward platform, not a legacy construction-industry database. This attracts younger estimators and tech-comfortable users.
5. **Mobile hero holds up.** Above-the-fold mobile render is genuinely usable — full headline, subtext, and CTA without scrolling. Better than Cordell and BCI mobile.

---

## What Is Stuck in 2010

1. **Horizontal not vertical.** EstimateOne's trade menu covers "Roofing tenders" among 40+ other trades — alphabetically buried. There's zero roofing-specific vocabulary, curation, or relevance. A roofing sub gets the same interface as an HVAC installer.
2. **Tender-stage, not DA-stage.** E1 is explicitly about tenders from head contractors — a downstream stage of the procurement flow. By the time a DA becomes an E1 tender, the roofing subcontractor has missed the early-access advantage of seeing the DA at lodgement. This is a fundamental product positioning gap E1 cannot close without rebuilding their data sources.
3. **No Sunday-night cadence.** E1 is a pull-model database: you search when you need to. There's no pushed weekly digest, no SMS, no email alert with a curated lead list. The engagement pattern is "when I remember to log in."
4. **Long scroll, thin content.** Below the fold, the marketing page shows large visual elements (the wire "6" graphic) with minimal text. On mobile, this translates to significant scroll distance for minimal information. The page feels designed for desktop editorial awards, not mobile conversion.
5. **No pricing visible.** Like Cordell and BCI, EstimateOne requires account creation before any pricing is shown. For a price-sensitive sole trader, this is a friction point that our AUD 199/mo displayed on the landing page immediately resolves.

---

## Takeaway for Our Design

**EstimateOne shows that a modern, clean navy + green palette can work in construction-tech — and that self-serve signup as the primary CTA is the right commercial motion.** Our design should match EstimateOne's CTA directness while going further on mobile-first execution (their mobile below-the-fold is very weak) and weekly-cadence specificity. The single biggest design statement we can make: **put the digest format front and centre on the landing page** — not "find tenders" but "your next Sunday digest has 12 roofing DAs waiting." This specificity (trade + cadence + count) is something EstimateOne structurally cannot do as a horizontal platform. Our colour direction should differentiate from E1's navy/emerald — lean into a warmer, more urgent palette (our "Sunday night in the ute" context calls for something that reads in a dark truck cab, not a glass-curtain-wall office).
