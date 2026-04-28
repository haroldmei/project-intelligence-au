# Competitor Teardown — BCI Central (now Hubexo / LeadManager)

**Screenshots analysed:**
- `bci-central-home.png` — BCI Central / Hubexo product page showing a "Trending Project" detail view

---

## Layout / Information Architecture

The screenshot captures what appears to be a **project detail page** rather than the homepage — showing "AU Sunshine Private Hospital" as a trending project. The IA is a three-region layout:

1. **Top bar:** Orange/red branding strip with a prominent "Contact Us" CTA and search. Navigation appears minimal at the top.
2. **Main content (left ~60%):** Project detail card — project name, description paragraph, "Key contacts & award criteria" section header, and a grid of contact role cards (blurred/redacted). Below this, "Similar Active Construction Projects" — a multi-column card list of project tiles, each showing project name, type, region, and approximate value.
3. **Right sidebar (~40%):** Project metadata panel — Project Type, Approximate Value, Start Date, Location, Project ID.
4. **Footer:** Hubexo branding, footer nav columns (Solutions, Resources, Company), social links.

This is a **database-record UI paradigm**: every screen is a record or a list of records. Dense metadata, no visual hierarchy cues for priority. Information is complete but overwhelming — a sole trader on mobile would abandon within seconds.

---

## Density

**Very high.** The project detail page packs: a full description paragraph, multiple accordion sections, a 3×3 grid of contact role tiles (all blurred/redacted in the public view — contact data is the paid lock), and a multi-row "Similar Projects" horizontal scroll of cards, all on one page. This is appropriate for a desktop research workflow (head-contractor precon team reviewing specs) but hostile to a mobile glance interaction.

The "Similar Active Construction Projects" grid is particularly dense — 6+ project tiles per row at desktop, with small text and no visual breathing room. At mobile, this would collapse into a very long single-column list.

---

## Colour

- **Primary accent:** Orange-red / tomato (`#E63312` approx.) — used for the top branding bar, "Contact Us" button, and select highlights.
- **Page background:** White, clean.
- **Card backgrounds:** Light grey (`#F5F5F5` approx.) for project tiles.
- **Text:** Dark charcoal (`#222` approx.) for body, medium grey for metadata labels.
- **Contact tiles:** White cards with role label in grey, name blurred (paywall signal).

Orange-red on white fails WCAG AA at smaller sizes; the top bar text appears white-on-orange-red which passes at the large size used.

---

## Typography

Standard enterprise sans-serif throughout — likely system stack or a Proxima Nova variant. Type scale is utilitarian: H1 at roughly 28px (project name), body at 14px, labels at 12px. Very compressed — designed to show maximum information per pixel, not for readability comfort. No distinctive typographic personality; could be any 2016-era SaaS product.

Mobile rendering would be readable but clinical — no typographic warmth.

---

## What They Nail

1. **Contact data as the core value prop.** The blurred/redacted contact grid is a smart UI decision: it telegraphs "we have the names and phone numbers, you just need to pay." For head-contractor precon teams, this is exactly the right hook.
2. **"Trending Project" editorial curation.** Surfacing a featured project at the top of the public page hints at curation — this is a gesture toward the "digest" format that works. They just don't deliver on it (it's one project, not a curated list for your trade).
3. **"Similar Active Projects" section.** Related-project discovery is genuinely useful and shows product thinking about pipeline workflow, not just data retrieval.
4. **Metadata completeness.** Project Type, Approximate Value, Start Date, Location, Project ID — all above the fold in the sidebar. A roofer can qualify a project in seconds from that panel alone.

---

## What Is Stuck in 2010

1. **Contact data is the product — not relevance.** BCI/Hubexo sells access to who to call, not which projects to pursue. This forces the subcontractor to do their own relevance filter (is this a re-roof? is it in my LGA?) before the contact data becomes useful. The triage burden is on the buyer.
2. **No trade-specific vertical.** The UI is identical for a roofer, an electrician, and a civil contractor. No vocabulary tuning, no trade-aware filtering visible on the public surface. The "Trending Project" shown is a hospital — not relevant to a roofing subcontractor in Western Sydney.
3. **Desktop-only UX.** Sidebar + main column + dense card grids are completely non-functional on mobile. A sole trader checking leads between site visits has no path to quick information on this interface.
4. **Paywall at every contact.** The blurred contact grid trains users that the core value requires payment before they can assess fit. There's no "try with public data" path. High friction for SMB.
5. **Orange-red is aggressive.** The top bar colour is attention-grabbing but creates visual tension with the content below. It's a banner, not a brand identity that carries through the product.

---

## Takeaway for Our Design

**BCI shows us that "contact data behind a paywall" is a viable business model but a hostile UX for SMB subcontractors.** Their interface is optimised for a precon manager with 20 minutes to research one project — not for a sole trader with 5 minutes to scan Sunday-night leads. Our strongest design counter-move: **show the full DA detail first (public data = no blurring), and reserve the paid value-add for relevance ranking and digest curation, not data access.** This inverts BCI's model and removes the paywall anxiety from the very moment a user evaluates a lead. Design implication: our DA card should show address, scope, value, and portal link — completely unredacted — as the baseline. The paywall is the digest curation, not the raw data.
