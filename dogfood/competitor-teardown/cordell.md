# Competitor Teardown — Cordell Connect (now Cotality)

**Screenshots analysed:**
- `cordell-connect-home.png` — legacy Cordell Connect login/marketing page
- `cordell-connect-product-loaded.png` — Cotality rebrand product page (desktop)
- `cordell-cotality-product.png` — Cotality full-page scroll (desktop)
- `cordell-mobile.png` — Cotality mobile view

---

## Layout / Information Architecture

The legacy Cordell home (`cordell-connect-home.png`) is a two-column split: a full-bleed construction site hero image left, a login panel right. Navigation bar sits above with tab-style links (Sales Leads, Project Data, 24/7 Availability, Real Time Updates, National Coverage, Grow your Business) — each a distinct product pillar crammed into one row. This is enterprise-catalogue IA: everything is visible, nothing is prioritised.

The Cotality rebrand (`cordell-connect-product-loaded.png`, `cordell-cotality-product.png`) shifts to a single-column editorial scroll. Nav is a dark horizontal bar with mega-menu dropdowns (Our Data, Industries, Our Products, Insights, Our Company). The hero is large typography ("50 Years of construction industry intelligence") over a warm cream/off-white background. Content sections are separated by alternating cream and white bands with ample whitespace — modern editorial in structure, but content is mostly empty/loading in the screenshot, suggesting heavy JS rendering.

Mobile (`cordell-mobile.png`): collapsed hamburger nav. The hero text stacks and shrinks. Sections are single-column. The page is very long; no sticky digest or action CTA visible in the fold. Heavy vertical scroll, poor mobile scannability.

---

## Density

**Low content density by design.** Post-rebrand Cotality has adopted a content-marketing editorial style — large whitespace, single stat or quote per section, no data tables or lead lists visible on the public page. This is appropriate for enterprise brand positioning but useless for a subcontractor who wants to see *leads*. The actual product (project database) is locked behind login; the public surface is pure marketing.

The legacy Cordell home was denser: login form, phone number, support link, and five value-prop tabs all visible above the fold. Functional, not beautiful.

---

## Colour

- **Legacy Cordell:** Green (`#2E7D32` / forest green) primary, white, dark grey text. Construction-industry standard palette — safe, unmemorable.
- **Cotality rebrand:** Coral/terracotta (`#E8603C` approx.) as the primary brand accent. Off-white/cream (`#F5EFE8` approx.) as page background. Near-black (`#1A1208` approx.) for text and footer. The coral is warm and modern — a clear attempt to shed the "2010 enterprise SaaS" look. Coral on cream has low contrast; body text relies on the near-black to carry WCAG compliance.

---

## Typography

- **Cotality:** Appears to use a geometric sans-serif (possibly Founders Grotesk or similar) for headings — large, confident, wide letter-spacing. Body copy is a neutral sans at roughly 16–18px. No serif anywhere. Type scale is editorial: H1 is enormous (~60px desktop), H2/H3 step down quickly. Mobile H1 collapses to ~32px — acceptable.
- **Legacy Cordell:** Standard system sans, small type (~13px body), very utilitarian.

---

## What They Nail

1. **Brand credibility signal:** "Since 1969 / 50 Years of construction industry intelligence" is a powerful trust anchor for enterprise procurement. No startup can replicate this.
2. **Navigation taxonomy:** Industries / Products / Data mega-menus signal comprehensive coverage — reassuring for a head contractor who needs every trade and every state.
3. **Rebrand visual direction:** The coral + cream palette is genuinely distinctive in the construction-SaaS vertical, which is uniformly blue/grey/green. If executed fully, it would stand out in inbox previews.

---

## What Is Stuck in 2010

1. **No self-serve signup visible.** The public site has no "Start free trial" or "Sign up" — only "Contact sales" and "Log in." The entire acquisition motion requires a sales call. For SMB subcontractors this is a conversion killer.
2. **JS-heavy rendering.** The product page screenshot shows large empty white/cream blocks where content should load — JavaScript must hydrate before anything meaningful appears. On 4G mobile this is brutal.
3. **Mobile experience is an afterthought.** The mobile screenshot (`cordell-mobile.png`) is effectively a linearised desktop page — no sticky CTA, no native app feel, no mobile-optimised card layout. Sections are extremely tall with single lines of text.
4. **No cadence or urgency.** Nothing on the public page communicates "you get a weekly curated list." It's all positioning copy ("intelligence since 1969") with no workflow specificity. A roofer can't tell what he'd receive.

---

## Takeaway for Our Design

**Cordell's rebrand gives us the coral/cream palette as a signal to differentiate.** We should not use coral or warm cream as our primary palette — that's Cotality's territory now and it will read as imitative. Instead, our design should feel crisp, mobile-native, and action-oriented: the opposite of Cotality's slow editorial scroll. The single most exploitable gap: **Cordell has no digestible Sunday-night format** — their UI is a database browser, not a curated feed. Our card layout, thumb interaction, and "N leads this week" header should feel like a news digest (think Morning Brew), not a construction database.
