# System Requirements Specification — ProjectIntelligence AU (PI-AU)

<!-- WEDGE: The Sunday-night roofing DA digest for Sydney subbies — 15 LGAs, 5–15 leads, AUD 199/mo, signup in 60 seconds. -->

**Document ID:** PI-AU-SRS-001
**Version:** 1.0
**Date:** 2026-04-28
**Status:** DRAFT
**Scale tier:** preview
**Stack contract:** docs/00-tech-stack.md (LOCKED)

---

## 1. Introduction

### 1.1 Purpose

This System Requirements Specification (SRS) defines the functional and non-functional requirements for **ProjectIntelligence AU (PI-AU)**, a SaaS product that delivers a weekly curated digest of roofing-relevant Development Applications (DAs) to Sydney subcontractor businesses. The document is written to IEEE 830-1998 standard and serves as the binding contract between the product, design, and engineering functions for V1 (preview tier).

### 1.2 Scope

PI-AU V1 covers:

- Nightly ingestion of DA records from NSW Planning Portal Online DA Service API and 15 council aggregator feeds (via DA Leads / Council DA APIs) for 15 Greater Sydney LGAs.
- AI-powered relevance scoring pipeline (rule → embedding → LLM rerank) against a pre-seeded roofing vocabulary.
- Sunday 6 pm AEST delivery of a 5–15-item digest via email (Resend) and SMS (Twilio top-3).
- Self-serve signup with 14-day trial, Stripe AU billing, and LGA bundle selection.
- Per-DA thumbs feedback capture and personalised reranking after ≥ 200 labelled pairs.
- Web portal for digest history, account settings, and subscription management.

**Out of scope for V1:**

Multi-trade verticals (HVAC, electrical, civil, plumbing), Melbourne/Brisbane expansion, AusTender/NSW eTendering tender feed, contact-data enrichment, native mobile app, multi-tenant role-based permissions, API access, Slack/webhook alerts, annual billing, referral programme.

### 1.3 Definitions and Acronyms

| Term | Definition |
|---|---|
| **DA** | Development Application — a formal application to a NSW local government council for approval to carry out development work |
| **LGA** | Local Government Area — a council administrative area in NSW |
| **ICP** | Ideal Customer Profile — the primary buyer segment (owner-operator of a 4–15-person Sydney roofing firm) |
| **Digest** | The weekly curated list of 5–15 relevant DAs delivered to a subscribed user by email and SMS every Sunday at 6 pm AEST |
| **Relevance pipeline** | The three-stage AI scoring system: (1) rule/keyword filter, (2) embedding cosine similarity via pgvector, (3) LLM rerank via claude-haiku-4-5 |
| **Saved query** | The per-user natural-language query whose embedding is stored in pgvector and used as the similarity target for DA ranking |
| **Thumbs feedback** | Binary (👍/👎) per-DA feedback signal submitted by users via email or web portal |
| **AEST** | Australian Eastern Standard Time (UTC+10) / Australian Eastern Daylight Time (UTC+11) — the delivery timezone |
| **GST** | Goods and Services Tax — Australian 10% consumption tax applied to SaaS subscriptions |
| **SPAM Act** | Spam Act 2003 (Cth) — Australian legislation governing commercial electronic messages; requires opt-out mechanisms |
| **APPs** | Australian Privacy Principles — Schedule 1, Privacy Act 1988 (Cth) |
| **pgvector** | PostgreSQL extension (v0.7+) providing vector storage and HNSW index for cosine similarity search |
| **Precision** | TP / (TP + FP) — fraction of surfaced DAs that are genuinely relevant to the user's trade |
| **Recall** | TP / (TP + FN) — fraction of all genuinely relevant DAs in scope that the system surfaces |
| **eval harness** | The promptfoo-based offline evaluation suite at `eval/` using a 500-pair labelled (DA description, relevant: bool) roofing dataset |
| **Solo tier** | AUD 199/mo plan — 1 seat, 15 Sydney LGAs, roofing vertical |
| **Team tier** | AUD 499/mo plan — 3 seats, same scope as Solo |
| **ACV** | Annual Contract Value |
| **SRS** | System Requirements Specification |
| **FR** | Functional Requirement |
| **NFR** | Non-Functional Requirement |
| **CDC** | Complying Development Certificate — an alternative NSW planning approval path that may bypass DA lodgement |

### 1.4 References

| ID | Document |
|---|---|
| R-01 | `docs/00-tech-stack.md` — Tech Stack Contract (LOCKED, 2026-04-28) |
| R-02 | `docs/01-market-analysis.md` — Market Analysis Report Rev 2 |
| R-03 | `docs/01b-product-spec.md` — Product Specification (DRAFT) |
| R-04 | `docs/01c-wedge.md` — Wedge & Differentiation (LOCKED) |
| R-05 | NSW Planning Portal Online DA Service API v2 |
| R-06 | DA Leads API (330+ councils) |
| R-07 | Council DA API (290+ councils) |
| R-08 | Stripe AU documentation |
| R-09 | Twilio SMS API documentation |
| R-10 | Resend transactional email API documentation |
| R-11 | IEEE 830-1998 — Recommended Practice for Software Requirements Specifications |
| R-12 | Privacy Act 1988 (Cth) / Australian Privacy Principles |
| R-13 | Spam Act 2003 (Cth) |
| R-14 | promptfoo documentation (eval harness framework) |

---

## 2. Overall Description

### 2.1 Product Perspective

PI-AU is a standalone SaaS web application. It is not a module of a larger system. It consumes public government and council DA data via APIs, processes it through an AI relevance pipeline, and delivers curated lead digests to subscribed trade businesses. It integrates with:

- **Upstream data sources:** NSW Planning Portal API, DA Leads API, Council DA API (ingestion)
- **AI inference:** Anthropic Claude API (haiku-4-5 for LLM rerank) and OpenAI API (text-embedding-3-small for embeddings)
- **Payments:** Stripe AU (subscriptions, trials, GST)
- **Email:** Resend (transactional email, React Email templates)
- **SMS:** Twilio (Sunday digest top-3 SMS)
- **Auth:** Lucia (session management, argon2id password hashing)
- **Analytics:** PostHog (product events, feature flags)
- **Error tracking:** Sentry
- **Hosting:** Vercel (Next.js 15, App Router, Vercel Cron)
- **Database:** PostgreSQL 16 + pgvector 0.7 (via Prisma 5, Prisma Accelerate)

The tech stack is fixed per R-01. No substitutions without rerunning `tech-stack-selector`.

### 2.2 Product Functions (Summary)

| Function | Description |
|---|---|
| DA Ingestion | Nightly ETL of newly lodged DAs from configured LGA feeds into Postgres |
| Relevance Scoring | Three-stage AI pipeline: keyword rule → pgvector embedding similarity → claude-haiku-4-5 LLM rerank |
| Digest Generation | Assemble per-user 5–15-item ranked DA list with one-line "why this matched" summaries |
| Email Delivery | Sunday 6 pm AEST Resend email with full DA cards (mobile-first React Email template) |
| SMS Delivery | Sunday 6 pm AEST Twilio SMS with top-3 DA summaries (≤ 3 × 160 chars) |
| Thumbs Feedback | In-email and portal single-tap 👍/👎 per DA card; stored in Postgres |
| Personalised Reranking | After ≥ 200 thumbs pairs, per-user positive/negative examples injected into LLM rerank prompt |
| Self-Serve Signup | 60-second account creation, email OTP, LGA bundle selection, Stripe trial activation |
| Billing Management | View, upgrade (Solo → Team), and cancel subscriptions via Stripe; GST compliant |
| AI Cost Tracking | Per-user weekly token cost logged to `ai_cost_log`; Sentry alert if ceiling exceeded |
| Eval Harness | Offline promptfoo precision/recall evaluation gate (launch prerequisite) |
| Web Portal | Digest history, thumbs review, account/LGA/notification settings |

### 2.3 User Classes and Characteristics

| Class | Description | Tech Proficiency | V1 Status |
|---|---|---|---|
| **Solo Subscriber (Estimator Eli)** | Owner-operator of a 4–15-person Sydney roofing firm; primary ICP; reads digest on iPhone; quotes Sunday night/Monday morning | Medium (iPhone-first; uses Xero/Airtable) | **Primary V1 user** |
| **Team Subscriber (Growth-Stage Gabby)** | Operations manager at a 10–20-person roofing firm; manages 2 estimators; comfort with SaaS onboarding | High | **V1 Team tier (3 seats)** |
| **Edge Subscriber (Sole-Trader Steve)** | Sole trader / roof plumber; validates price floor; iPhone-only; low desktop tolerance | Medium-low | **V1 trial validation; lower conversion expected** |
| **System (Cron actor)** | The Sunday digest cron job (Vercel Cron) and nightly ingestion cron | n/a | **Internal actor** |
| **Ops Admin** | Founder/operator performing weekly manual ground-truth labelling for precision recap stat | High | **Internal; no dedicated admin UI in V1** |
| **BD Beth (HVAC)** | Business development at a 30-person HVAC firm | High | **Out of V1 — waitlist only** |
| **PreCon Pete** | Pre-construction lead at a Tier 3 builder | High | **Out of V1 — waitlist only** |

### 2.4 Operating Environment

| Aspect | Specification |
|---|---|
| Runtime | Node.js 22.x, TypeScript, pnpm |
| Framework | Next.js 15 (App Router) |
| Database | PostgreSQL 16 + pgvector 0.7 on a single Postgres node (Prisma Accelerate pooler) |
| Hosting | Vercel (preview tier) |
| Cron | Vercel Cron (Sunday 5:00 pm AEST digest trigger; 11:00 pm AEST nightly ingestion) |
| CI | Buildkite (`$BK_API_TOKEN` provisioned) |
| Browsers | Mobile Safari (iOS 16+), Chrome Mobile (Android 12+), Gmail Mobile; desktop Chrome/Firefox secondary |
| Mobile | iPhone-first; minimum viewport 375px; touch targets ≥ 44×44 px |
| Email clients | iOS Mail, Gmail Mobile (Android), Gmail Web; Outlook desktop secondary |
| Network | Public internet; 4G mobile as primary connection for end users |

### 2.5 Constraints

| ID | Constraint | Source |
|---|---|---|
| C-01 | **Public data only.** No scraping of Cordell, LeadManager, EstimateOne, or any commercial site under ToS restriction. Data sources limited to: NSW Planning Portal DA API, DA Leads API, Council DA API, VendorPanel public listings, AusTender OCDS API (V2 only). | R-04 §6 legal-compliance |
| C-02 | **Single Postgres node.** No separate vector cluster (Qdrant, Pinecone) at preview tier. pgvector inside the same Postgres instance until HNSW scan > 50ms. | R-01 §3 not_in_stack |
| C-03 | **No BullMQ / queue.** The Sunday digest is a single Vercel Cron job with a simple retry wrapper, not a queue worker. BullMQ deferred to launch+. | R-01 §queue |
| C-04 | **No Terraform / IaC.** Preview tier; Vercel preview deploy only. No Kubernetes, no Cloud Run, no multi-region. | R-01 §deploy |
| C-05 | **AI cost ceiling.** AUD 0.50/user/month on AI inference (≈ AUD 0.13/user/week). Every LLM call instrumented with `{user_id, phase, input_tokens, output_tokens, model}` to `ai_cost_log`. | R-01 §ai.cost_tracking |
| C-06 | **Single-user accounts in V1.** Team tier is a flat seat list (3 independent accounts sharing a billing relationship). Real RBAC deferred to V2. | R-04 §6 auth-engineer |
| C-07 | **No SSO / enterprise IDP.** Auth via Lucia: password + email OTP or magic-link. No Google Workspace, no Okta. | R-01 §auth |
| C-08 | **AU-only V1.** AUD pricing; GST via Stripe AU; no EU/global billing. SMS to Australian mobile numbers (+61) only. | R-01 §payments |
| C-09 | **Sydney roofing only in V1.** 15 Greater Sydney LGAs, roofing vertical. No HVAC, electrical, civil, plumbing. No Melbourne/Brisbane. | R-04 §3 anti-axis |
| C-10 | **Eval harness is a launch gate.** Precision ≥ 0.70 at recall ≥ 0.60 on the 500-pair labelled set must be achieved before GA. | R-01 §ai.eval_launch_gate |
| C-11 | **SPAM Act 2003 compliance.** All commercial electronic messages must include opt-out mechanism. SMS STOP reply must trigger immediate opt-out. | R-13 |
| C-12 | **APPs compliance.** Privacy Act 1988 / APPs governs any personal information held (email, mobile number, ABN). Privacy policy required at launch. | R-12 |
| C-13 | **Mobile-first UI.** Tailwind responsive prefix order: base (mobile) → sm → md → lg → xl. Digest card layout: full-width stacked on mobile; two-column grid at md:. Touch targets ≥ 44×44 px. | R-01 §5 |
| C-14 | **No re-hosting of council documents.** Deep links to council DA portal URLs only. PI-AU must not cache, copy, or re-host council attachments (architectural drawings, SEEs). | R-04 §1.4 Step 7 |

---

## 3. Functional Requirements

### 3.1 DA Ingestion

---

**FR-001** `[wedge-critical]`
**Nightly DA ingestion — NSW Planning Portal API**

The system SHALL ingest newly lodged DA records from the NSW Planning Portal Online DA Service API v2 for all 15 configured Greater Sydney LGAs on a nightly schedule (11:00 pm AEST, Sunday through Saturday).

*Acceptance criteria:*
- Cron fires at 23:00 AEST ± 5 minutes.
- All DAs lodged in the preceding 24-hour window for the 15 configured LGAs are fetched and written to the `development_applications` table in Postgres within 60 minutes of cron start.
- Each record stores: `da_id`, `council`, `address`, `description`, `estimated_value` (nullable), `lodgement_date`, `applicant_name`, `portal_url`, `raw_scope_text`, `source_api`, `ingested_at`.
- Duplicate records (same `da_id` from same council) are upserted, not duplicated.
- An API error on any LGA triggers a Sentry alert and a single retry after 15 minutes.
- Ingestion count per LGA per night is written to an `ingestion_log` table for drift detection.

*Priority:* Must-have
*Effort:* L

---

**FR-002** `[wedge-critical]`
**Nightly DA ingestion — council aggregator feeds (DA Leads / Council DA)**

For LGAs not covered by the NSW Planning Portal API, the system SHALL ingest DA records via DA Leads API and/or Council DA API as configured per-LGA.

*Acceptance criteria:*
- All 15 target LGAs are covered by at least one API feed (NSW Planning Portal or a council aggregator).
- Schema normalisation maps aggregator fields to the same `development_applications` columns as FR-001.
- Error handling and ingestion logging are identical to FR-001.
- Source API is recorded in `source_api` column for provenance.

*Priority:* Must-have
*Effort:* M

---

**FR-003** `[wedge-critical]`
**Ingestion drift detection and alerting**

The system SHALL detect and alert when DA ingestion volume for any LGA drops to zero or falls more than 50% below the rolling 7-day average.

*Acceptance criteria:*
- After each nightly run, for each LGA, the system computes the ingestion count and compares it to the 7-day rolling average stored in `ingestion_log`.
- If any LGA count = 0 or drops > 50%, a Sentry alert fires with the LGA name and the delta.
- Alert includes the source API name and the last successful ingestion timestamp.

*Priority:* Must-have
*Effort:* S

---

### 3.2 Relevance Scoring Pipeline

---

**FR-004** `[wedge-critical]`
**Rule pass — roofing keyword filter**

The system SHALL perform a deterministic SQL keyword filter on all ingested DAs for each user before any embedding or LLM call, passing only DAs that match the user's LGA bundle AND contain at least one roofing vocabulary keyword in `description` or `raw_scope_text`.

*Acceptance criteria:*
- Default roofing vocabulary includes (but is not limited to): "re-roof", "reroofing", "membrane", "Colorbond", "metal deck roofing", "roof replacement", "asbestos roof", "asbestos removal", "guttering replacement", "roof tiling", "roof plumbing", "solar-ready roof".
- Filter is applied via SQL `ILIKE` or `tsvector` full-text search — zero LLM cost.
- DAs failing the rule pass are excluded from downstream embedding/rerank steps.
- DAs failing rule pass but present in any user's LGA are stored as `rule_filtered_out = true` for recall audit purposes.

*Priority:* Must-have
*Effort:* S

---

**FR-005** `[wedge-critical]`
**Embedding pass — pgvector cosine similarity**

The system SHALL embed each DA record passing the rule filter using OpenAI `text-embedding-3-small` and rank it against the user's saved-query embedding stored in pgvector via cosine similarity.

*Acceptance criteria:*
- DA embedding input is the concatenation of `description` + `raw_scope_text` (truncated to 8,000 tokens if necessary).
- User saved-query embedding is computed once at account creation (FR-015) and stored in pgvector in the `users` table.
- Cosine similarity is computed using pgvector HNSW index (`vector_cosine_ops`).
- Top-50 candidates (by cosine similarity) per user per weekly run are passed to the LLM rerank step.
- Embedding API cost per DA is logged to `ai_cost_log` with `phase = 'embedding'`.
- If pgvector HNSW scan latency exceeds 50 ms for any query, a warning is logged (no alert in V1; reviewed at next quarterly stack review).

*Priority:* Must-have
*Effort:* L

---

**FR-006** `[wedge-critical]`
**LLM rerank — claude-haiku-4-5 scoring**

The system SHALL send the top-30 DA candidates per user (from FR-005) to `claude-haiku-4-5` for relevance scoring and one-line summary generation.

*Acceptance criteria:*
- Input prompt includes: user's saved-query text, DA description, DA estimated value, DA address, and (after ≥ 200 thumbs pairs) up to 5 positive and 5 negative example DA descriptions from the user's thumbs history (FR-025).
- Model returns for each DA: `relevance_score` (0–10 integer), `why_matched` (one sentence, ≤ 30 words).
- Final digest list contains 5–15 DAs with `relevance_score ≥ 4`, ranked descending.
- If fewer than 5 DAs score ≥ 4, the system includes the highest-scoring DAs available (minimum 0) and sends a "quiet week" digest (FR-010).
- Total LLM inference cost per user per weekly run is logged to `ai_cost_log` with `phase = 'rerank'` and must not exceed AUD 0.13.
- If any user's weekly run cost exceeds AUD 0.13, a Sentry alert fires.

*Priority:* Must-have
*Effort:* XL

---

**FR-007** `[wedge-critical]`
**AI cost tracking — ai_cost_log table**

The system SHALL instrument every LLM and embedding API call with structured cost logging.

*Acceptance criteria:*
- Every call to OpenAI embedding API or Anthropic Claude API writes a row to `ai_cost_log(user_id, phase, model, input_tokens, output_tokens, cost_aud, week_start, created_at)`.
- `cost_aud` is computed from the model's published per-token price at time of call.
- A weekly aggregate query per user is available (used by Sentry alert in FR-006).
- Table is queryable by ops for cost auditing without additional tooling.

*Priority:* Must-have
*Effort:* S

---

**FR-008** `[wedge-critical]`
**Eval harness — launch gate**

The system SHALL include a promptfoo-based offline eval harness at `eval/` that validates the relevance pipeline against a 500-pair labelled roofing dataset before GA.

*Acceptance criteria:*
- `eval/` contains a promptfoo config and 500 (DA description, relevant: bool) labelled pairs covering the roofing vocabulary.
- Running `promptfoo eval` in `eval/` produces precision and recall metrics.
- Launch gate: precision ≥ 0.70 at recall ≥ 0.60 on the full 500-pair set.
- CI (Buildkite) runs the eval harness on every PR that modifies the relevance pipeline; the pipeline fails if the gate is not met.
- Inter-rater agreement target for labelled set: Cohen's κ ≥ 0.60 (labelling methodology documented in `eval/README.md`).

*Priority:* Must-have (pre-launch gate)
*Effort:* L

---

### 3.3 Digest Generation and Delivery

---

**FR-009** `[wedge-critical]`
**Sunday digest cron trigger**

The system SHALL trigger the weekly digest generation and delivery pipeline via Vercel Cron every Sunday at 17:00 AEST (5:00 pm AEST = UTC+10/11 adjusted).

*Acceptance criteria:*
- Cron fires at Sunday 17:00 AEST ± 5 minutes.
- The cron job invokes the digest pipeline for all active subscribers (trial + paid, not cancelled).
- If the cron job fails (unhandled exception or timeout), Sentry is alerted and the job is retried once after 15 minutes via the retry wrapper.
- The cron endpoint is protected against unauthenticated invocation (Vercel Cron secret header).
- Uptime monitor (single check per R-01 §observability.uptime) confirms the Sunday cron endpoint responds 200 within 30 seconds.

*Priority:* Must-have
*Effort:* M

---

**FR-010** `[wedge-critical]`
**Email digest delivery — mobile-first React Email template**

The system SHALL deliver a weekly email digest to each active subscriber via Resend at Sunday 6:00 pm AEST.

*Acceptance criteria:*
- Email is sent via Resend API using a React Email template rendered server-side.
- Subject line: `"Your Sydney Roofing Digest — [N] leads this week"` where N is the count of DA cards in the digest.
- Template contains, in order: (a) precision recap stat header (if ≥ 4 weeks of history; else onboarding tip), (b) full-width stacked DA cards (5–15 items on mobile; 2-column grid at md: on desktop), (c) footer with opt-out link and PI-AU branding.
- Each DA card includes: street address, LGA, estimated value (if available, else "value not disclosed"), scope summary (≤ 2 sentences from `why_matched`), applicant name, "View DA →" deep link to council portal URL.
- If no DAs meet the relevance threshold (score ≥ 4), a "quiet week" email is sent with the raw count of DAs checked that week and the message "No strong re-roof leads this week — we checked [N] DAs across your 15 LGAs."
- Email renders correctly (no broken layout, no clipped content) in: iOS Mail (iPhone 14), Gmail Mobile Android, Gmail Web. Tested via Resend preview and/or Litmus/Email on Acid.
- Delivery completes within 5 minutes of cron trigger (not 6:00 pm wall clock; within 5 min of when the digest pipeline completes for that user).
- A delivery failure triggers a Sentry alert and a single retry within 30 minutes.

*Priority:* Must-have
*Effort:* M

---

**FR-011** `[wedge-critical]`
**SMS top-3 digest delivery — Twilio**

The system SHALL deliver an SMS with the top-3 DA summaries to each active subscriber with SMS opt-in enabled, at Sunday 6:00 pm AEST (concurrent with email).

*Acceptance criteria:*
- SMS is sent via Twilio API to the user's verified Australian mobile number (+61 prefix).
- SMS contains 3 DA summaries, one per concatenated SMS part, each as: `"[Address] | [Scope ≤ 20 words] | AUD [Value or 'N/A'] | [Shortened link]"`.
- Total SMS is ≤ 3 concatenated parts (≤ 480 characters total).
- Links are direct portal DA URLs (not PI-AU redirects per C-14); URL shortening via a provider-native or open short-URL service is acceptable for character economy.
- SMS delivery failure is non-blocking: email delivery is not delayed by SMS failure; Sentry alert fires on SMS failure but does not retry in V1.
- SMS is only sent to users with `sms_opt_in = true` (default: true at account creation).
- Twilio STOP reply webhook (FR-029) triggers immediate `sms_opt_in = false` in Postgres.

*Priority:* Must-have
*Effort:* S

---

**FR-012** `[wedge-critical]`
**One-tap click-through to council DA portal**

The system SHALL provide a direct deep link to the source council DA portal page for every DA card in the email digest and the web portal.

*Acceptance criteria:*
- "View DA →" link in email navigates directly to the council DA portal URL for that specific DA record (stored as `portal_url` in `development_applications`).
- Link opens in the system browser (not a PI-AU webview).
- PI-AU does not re-host, proxy, or cache any council documents (C-14).
- Link is a permanent direct URL; no PI-AU redirect or tracking endpoint in V1 (tracking deferred to PostHog event on web portal clicks).

*Priority:* Must-have
*Effort:* S

---

**FR-013** `[wedge-critical]`
**Weekly precision recap stat — email header**

The system SHALL display a precision recap stat at the top of the weekly email digest for users with ≥ 4 weeks of digest history.

*Acceptance criteria:*
- Stat text: `"Last 4 weeks: you saw [N] of [M] re-roof DAs in your area — [P]% precision"` where N = user thumbs-up count, M = total relevant DAs in user's LGAs per ops-maintained ground-truth labels, P = N/M × 100 (rounded to nearest integer).
- Ground-truth M is maintained by ops in a `da_ground_truth` table (updated weekly; ops admin process, not automated in V1).
- Stat is absent for users with < 4 weeks of history; replaced with: `"Your digest is new — we'll show your precision stats after 4 weeks of digests."`.
- Stat is the first content block in the email, above DA cards.

*Priority:* Must-have
*Effort:* M

---

### 3.4 User Authentication and Account Management

---

**FR-014** `[wedge-critical]`
**Self-serve account creation — 60-second signup**

The system SHALL allow a new user to create an account, verify their email, and reach the LGA setup screen in under 60 seconds on a 4G mobile connection, with no sales call.

*Acceptance criteria:*
- Signup form fields: email (required), password (required, ≥ 12 chars), mobile number (required, AU +61 format), trade (pre-filled "Roofing", read-only in V1).
- On form submit: account is created, a verification email is sent via Resend (React Email template), and the user is redirected to the LGA setup screen.
- Time from homepage button click to LGA setup screen (excluding email verification wait) is ≤ 60 seconds measured on a simulated 4G connection (Chrome DevTools throttling).
- Auth uses Lucia sessions; passwords hashed with argon2id.
- Email OTP verification is required before the first digest fires (not before LGA setup — allows onboarding to proceed).
- No sales call, demo booking, or phone consultation required at any point in signup.

*Priority:* Must-have
*Effort:* M

---

**FR-015** `[wedge-critical]`
**LGA bundle selection and saved query seeding**

The system SHALL present 4 pre-built LGA bundles at onboarding and pre-seed a roofing vocabulary saved query embedding at account creation.

*Acceptance criteria:*
- 4 LGA bundles displayed as selectable options:
  - "Western Sydney" (Penrith, Blacktown, Parramatta, Cumberland, The Hills)
  - "Inner West & City" (Inner West, City of Sydney, Strathfield, Burwood)
  - "Northern Sydney" (North Sydney, Willoughby, Hornsby, Lane Cove, Ku-ring-gai)
  - "Southern Sydney" (Sutherland, St George, Georges River)
- User can select 1 or more bundles; covers all 15 LGAs total.
- Selection saved to Postgres as the user's default LGA filter immediately.
- Default saved query text: `"re-roof, membrane replacement, Colorbond roof replacement, asbestos roof removal, roof tiling, metal deck roofing, guttering replacement"`.
- OpenAI text-embedding-3-small embedding of the default query is computed and stored in pgvector at account creation (not at first digest run).
- Users cannot edit the saved query in V1 (custom saved queries are `[Out-of-wedge → V2]`).
- After LGA selection, system displays: `"Your first digest will arrive this Sunday at 6 pm — we're already scanning 15 Sydney LGAs for re-roof DAs."` (or the next Sunday if < 60 hours until next digest).

*Priority:* Must-have
*Effort:* S

---

**FR-016** `[wedge-supporting]`
**Email OTP verification**

The system SHALL require email OTP verification before the first digest fires.

*Acceptance criteria:*
- A 6-digit OTP is sent to the user's email at account creation via Resend.
- OTP expires in 15 minutes.
- On valid OTP entry, `email_verified = true` is set in Postgres.
- If email is not verified by the Thursday before the first expected Sunday digest, a reminder email is sent.
- Digest is not sent to unverified accounts.

*Priority:* Must-have
*Effort:* S

---

**FR-017** `[wedge-supporting]`
**Password and session management**

The system SHALL implement secure session management per the tech stack contract.

*Acceptance criteria:*
- Sessions managed by Lucia with JWT + refresh token pattern.
- Passwords hashed with argon2id (minimum parameters: memory=19MiB, iterations=2, parallelism=1 per OWASP 2024).
- Session tokens stored in httpOnly, SameSite=Lax cookies.
- Sessions expire after 30 days of inactivity; refresh token extends for another 30 days on activity.
- Password reset via email link (Resend); reset link expires in 1 hour.

*Priority:* Must-have
*Effort:* M

---

### 3.5 Billing and Subscription

---

**FR-018** `[wedge-critical]`
**Stripe trial activation and checkout**

The system SHALL present a Stripe Checkout flow for plan selection and trial activation immediately after LGA setup.

*Acceptance criteria:*
- Pricing screen shows two plans: Solo (AUD 199/mo + GST) and Team (AUD 499/mo + GST, 3 seats).
- "Start 14-day trial" button opens Stripe Checkout (embedded or hosted) with the selected plan.
- GST (10%) is shown as a line item in Stripe Checkout; total displayed as AUD 218.90 (Solo) or AUD 548.90 (Team).
- Card is saved to Stripe customer but not charged until day 15.
- On successful checkout, user receives a Resend confirmation email: `"Trial started — your first digest arrives [next Sunday date]"`.
- On day 12, an automated Resend email fires: `"Your trial ends in 2 days — your card will be charged AUD 218.90 on [date] unless you cancel."`.
- On day 15, Stripe charges the card; if charge fails, Resend sends a payment failure email with a link to update card details.
- No free tier; trial is the only entry point.

*Priority:* Must-have
*Effort:* M

---

**FR-019** `[wedge-critical]`
**Subscription cancellation — no dark patterns**

The system SHALL allow a user to cancel their subscription from the account settings page with no more than two clicks and no retention friction.

*Acceptance criteria:*
- "Account → Subscription" page shows: current plan name, next billing date, next billing amount, and a "Cancel subscription" button.
- Clicking "Cancel subscription" shows a single confirmation screen with the final billing date and the text "Your access continues until [date]. No further charges."
- Confirming cancellation immediately calls Stripe to cancel future charges (no proration; access continues to period end).
- A Resend confirmation email is sent: `"Subscription cancelled — access continues until [date]."`.
- Cancelled accounts retain read-only access to digest history until period end; no data is deleted at cancellation.
- No modal popups asking "Are you sure?", no offers, no phone call prompts.

*Priority:* Must-have
*Effort:* S

---

**FR-020** `[wedge-supporting]`
**LGA bundle update from account settings**

The system SHALL allow a user to update their LGA bundle selection from account settings.

*Acceptance criteria:*
- "Account → My Area" page shows the 4-bundle picker with the user's current selection highlighted.
- User can add or remove bundles.
- Saving updates the LGA filter in Postgres immediately; the new selection applies to the next Sunday digest, not retroactively.
- A confirmation message is shown: `"Your area updated — takes effect from next Sunday's digest."`.

*Priority:* Must-have
*Effort:* S

---

**FR-021** `[wedge-supporting]`
**Team seat upgrade — Solo to Team**

The system SHALL allow a Solo subscriber to upgrade to the Team plan (3 seats) via the Stripe billing portal.

*Acceptance criteria:*
- "Account → Subscription → Upgrade to Team" navigates to Stripe billing portal for plan change.
- Stripe handles proration automatically.
- After upgrade, the account owner can invite up to 2 additional email addresses as seat holders from "Account → Team."
- Each seat holder receives an invitation email (Resend) and creates their own Lucia account linked to the billing account.
- Each seat holder receives their own Sunday digest with the same LGA bundle as the account owner (editable per seat after invite).
- Each seat holder can set their own thumbs preferences independently.

*Priority:* Should-have
*Effort:* M

---

**FR-022** `[wedge-critical]`
**SMS opt-in / opt-out — SPAM Act compliance**

The system SHALL provide an explicit SMS opt-in/opt-out mechanism compliant with Spam Act 2003.

*Acceptance criteria:*
- At account creation, SMS opt-in defaults to `true` with explicit disclosure: "By providing your mobile number you agree to receive Sunday SMS digests. You can opt out anytime."
- "Account → Notifications" shows a toggle "Sunday SMS digest (top 3 leads)" defaulting to ON.
- Toggling OFF sets `sms_opt_in = false` in Postgres immediately; no further SMS is sent from the next digest run.
- Replying STOP to any Twilio SMS triggers a Twilio inbound webhook that sets `sms_opt_in = false` in Postgres within 60 seconds (FR-029).
- User can re-enable SMS opt-in from Account → Notifications at any time.

*Priority:* Must-have (SPAM Act compliance)
*Effort:* S

---

### 3.6 Per-DA Thumbs Feedback

---

**FR-023** `[wedge-critical]`
**In-email thumbs feedback capture**

The system SHALL allow a user to submit a thumbs-up or thumbs-down on each DA card in the email digest via a single tap, without JavaScript.

*Acceptance criteria:*
- Each DA card in the email contains two plain HTML anchor tags: `<a href="/api/feedback?id=[da_id]&user=[token]&v=1">👍</a>` and `<a href="/api/feedback?id=[da_id]&user=[token]&v=0">👎</a>` where `[token]` is a HMAC-signed one-time token valid for 7 days.
- The API endpoint `/api/feedback` accepts GET requests (email link tap), validates the token, writes `(user_id, da_id, feedback: up|down, created_at)` to `da_feedback` in Postgres, and returns a plain HTML "Marked ✓ — thank you" page.
- Touch target area for 👍/👎 is ≥ 44×44 px in the rendered email (achieved via padding in the React Email template).
- Feedback works in iOS Mail and Gmail Mobile without JavaScript.
- If the token is expired or invalid, the response is: "This feedback link has expired. View your digest at [portal URL] to submit feedback."

*Priority:* Must-have
*Effort:* M

---

**FR-024** `[wedge-supporting]`
**Web portal thumbs review and correction**

The system SHALL allow a user to review and modify their thumbs history for any DA from the web portal.

*Acceptance criteria:*
- "My Digests" page in the web portal lists all past digests, each showing DA cards with the user's current thumb status.
- User can toggle a thumb (up → down, down → up, or remove entirely) for any DA in any past digest.
- A changed thumb is written to `da_feedback` in Postgres within 2 seconds of user action.
- Updated thumbs are used in the next Sunday scoring run (FR-006 / FR-025).

*Priority:* Should-have
*Effort:* S

---

**FR-025** `[wedge-supporting]`
**Per-user personalised reranking — 200-thumbs threshold**

The system SHALL incorporate a user's thumbs history into the LLM rerank prompt after that user has ≥ 200 thumbs-labelled pairs.

*Acceptance criteria:*
- The Sunday scoring job checks the count of `da_feedback` rows for each user before constructing the LLM rerank prompt.
- If count ≥ 200: the prompt includes the top-5 most-recently-thumbed-up DA descriptions as positive examples and the top-5 most-recently-thumbed-down descriptions as negative examples.
- If count < 200: the prompt uses only the global roofing vocabulary model (no user-specific examples).
- The personalisation onset triggers an in-email note in that week's digest: `"Your digest is now personalised to your quoting style."` (shown once only; `personalisation_notified_at` flag in users table).
- The A/B check against the cold-start model is evaluated via the eval harness (not in-production A/B testing in V1; eval harness comparison is the validation method).

*Priority:* Must-have (retention driver at months 2–3)
*Effort:* L

---

### 3.7 Web Portal

---

**FR-026** `[wedge-supporting]`
**Web portal — digest history view**

The system SHALL provide a web portal where users can view their past digests.

*Acceptance criteria:*
- Authenticated users land on a "My Digests" page showing a list of past weekly digests in reverse chronological order.
- Each digest entry shows: digest date, number of DA cards, and a clickable link to expand the full digest.
- Expanded digest shows the same DA cards as the email (address, LGA, value, scope, why_matched, portal link) with thumbs buttons.
- Desktop layout shows 2-column DA card grid; mobile shows single-column stacked cards.
- Page is server-rendered (Next.js App Router RSC) for initial load; thumbs actions are client-side mutations (server actions or API routes).

*Priority:* Should-have
*Effort:* M

---

**FR-027** `[wedge-supporting]`
**Web portal — account and notification settings**

The system SHALL provide account settings pages for profile, LGA selection, notifications, and subscription management.

*Acceptance criteria:*
- "Account" section contains sub-pages: Profile (email, mobile, name), My Area (LGA bundle picker — FR-020), Notifications (SMS toggle — FR-022), Subscription (plan, billing date, upgrade/cancel — FR-019, FR-021).
- All settings changes are persisted to Postgres immediately with optimistic UI updates.
- Mobile layout: settings pages use a single-column stacked layout with full-width tap targets.

*Priority:* Must-have
*Effort:* M

---

### 3.8 Notifications and Webhooks

---

**FR-028** `[wedge-critical]`
**Trial end reminder email — day 12**

The system SHALL send an automated reminder email via Resend on the 12th day of a user's trial.

*Acceptance criteria:*
- Triggered by a scheduled check (Vercel Cron daily, or Stripe webhook on trial_will_end event — whichever is simpler per implementation).
- Email body: `"Your 14-day trial ends in 2 days on [date]. Your card on file will be charged AUD [amount] + GST. Cancel anytime before [date] at [portal URL]."`.
- Sent only to users who have not cancelled before day 12.

*Priority:* Must-have
*Effort:* S

---

**FR-029** `[wedge-critical]`
**Twilio STOP webhook — SMS opt-out**

The system SHALL process Twilio inbound message webhooks to handle SMS STOP replies.

*Acceptance criteria:*
- Twilio inbound webhook endpoint `/api/webhooks/twilio` receives STOP replies.
- Endpoint validates Twilio webhook signature.
- On STOP keyword (case-insensitive), sets `sms_opt_in = false` for the matching mobile number in Postgres within 60 seconds.
- Twilio sends the STOP confirmation reply automatically per Twilio default opt-out behaviour.
- No further SMS is sent to that number until the user re-enables from the web portal.

*Priority:* Must-have (SPAM Act compliance)
*Effort:* S

---

**FR-030** `[wedge-supporting]`
**Stripe webhook handling**

The system SHALL process Stripe webhook events to update subscription state in Postgres.

*Acceptance criteria:*
- Stripe webhook endpoint `/api/webhooks/stripe` validates Stripe-Signature header.
- Handles at minimum: `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`, `invoice.payment_failed`.
- On `subscription.deleted`: sets `subscription_status = 'cancelled'` and `access_until = period_end` in users table.
- On `payment_failed`: sends a Resend payment failure email with card update link.
- Idempotent: duplicate events (same `event.id`) are safely ignored.

*Priority:* Must-have
*Effort:* M

---

### 3.9 Analytics and Observability

---

**FR-031** `[wedge-supporting]`
**PostHog product event instrumentation**

The system SHALL instrument key user actions with PostHog events.

*Acceptance criteria:*
- Events instrumented at minimum: `signup_started`, `signup_completed`, `lga_bundle_selected`, `trial_activated`, `digest_email_opened` (via Resend open tracking pixel — if available), `da_card_clicked` (web portal), `thumbs_submitted` (email and portal), `subscription_upgraded`, `subscription_cancelled`.
- PostHog loaded with consent-before-load: PostHog initialisation deferred until user consents (cookie banner on first visit; consent stored in `user_consent` table).
- Feature flags via PostHog flags (no separate vendor per R-01).

*Priority:* Should-have
*Effort:* M

---

**FR-032** `[wedge-supporting]`
**Sentry error tracking**

The system SHALL report unhandled exceptions and defined alert conditions to Sentry.

*Acceptance criteria:*
- Sentry SDK integrated for both Next.js server (Node runtime) and client.
- All unhandled exceptions automatically reported.
- Defined alert conditions (from FR-001, FR-003, FR-006, FR-009, FR-010, FR-011, FR-029) fire Sentry alerts with structured context (user_id, phase, error message).
- Sentry alert rules configured to notify the operator on-call (email or Slack in V1).

*Priority:* Must-have
*Effort:* S

---

**FR-033** `[wedge-supporting]` `[Iteration 10]`
**In-product cancel Undo / reactivate**

The system SHALL let a subscriber reverse a scheduled cancellation from inside the product, without visiting the Stripe billing portal (ux-design §7.10b; product-spec SF-3.1 — avoid Cordell-style exit friction).

*Acceptance criteria:*
- `POST /api/billing/subscription` clears `cancel_at_period_end` on the active/trialing Stripe subscription and returns `{ ok, accessUntil }` (auth-gated, rate-limited, 404 when no customer/subscription).
- The post-cancel confirmation toast includes an `[Undo]` action (within its 8s window) that calls the reactivate route and confirms "Subscription resumed."
- The `/account` pending-cancellation state ("Cancellation scheduled…") shows a "Resume subscription" button that calls the reactivate route and returns the account to the active (cancel CTA) state.
- After reactivating via either path, `cancel_at_period_end` is false end-to-end (verified by the `customer.subscription.updated` webhook persisting `cancelAtPeriodEnd=false`).

*Priority:* Should-have
*Effort:* S

---

### 3.10 Out-of-Wedge Requirements (V2)

The following functional areas are explicitly deferred. They MUST NOT be built in V1.

| FR ID | Feature | Tag | Rationale |
|---|---|---|---|
| FR-V2-001 | Custom saved queries (user-editable natural-language filters) | `[Out-of-wedge → V2]` | Pre-seeded vocabulary sufficient for V1 validation; adds UX complexity |
| FR-V2-002 | Depot postcode radius filter | `[Out-of-wedge → V2]` | LGA bundles cover the use case; postcode radius is nice-to-have precision |
| FR-V2-003 | HVAC vertical | `[Out-of-wedge → V2]` | Wedge #2; roofing wedge must be validated first |
| FR-V2-004 | Civil-works subcontractor vertical | `[Out-of-wedge → V2]` | Wedge #3; same rationale |
| FR-V2-005 | Melbourne / Brisbane expansion | `[Out-of-wedge → V2]` | Sydney-only V1; expansion gated on 100 Sydney paying customers |
| FR-V2-006 | Multi-trade filter / cross-vertical digest | `[Out-of-wedge → V2]` | Contradicts Niche axis |
| FR-V2-007 | Contact-data enrichment (architect/applicant phone numbers) | `[Out-of-wedge → V2]` | Cordell's moat; not the wedge |
| FR-V2-008 | Head-contractor tender feed (AusTender / NSW eTendering) | `[Out-of-wedge → V2]` | EstimateOne's moat; out of wedge |
| FR-V2-009 | API access for programmatic DA queries | `[Out-of-wedge → V2]` | Power-user feature; no V1 ICP needs it |
| FR-V2-010 | Slack / webhook push alerts | `[Out-of-wedge → V2]` | Sunday digest cadence supersedes real-time alerts in V1 |
| FR-V2-011 | Native mobile app (iOS / Android via Expo) | `[Out-of-wedge → V2]` | Mobile-first web sufficient at preview tier |
| FR-V2-012 | Team-seat hierarchy / RBAC | `[Out-of-wedge → V2]` | V1 Team tier is flat seat list |
| FR-V2-013 | Annual prepay billing (2 months free) | `[Out-of-wedge → V2]` | Deferred until month-3 retention data exists |
| FR-V2-014 | Per-user fine-tuned relevance model (beyond 200-thumbs weighting) | `[Out-of-wedge → V2]` | Full fine-tune is launch-tier AI work |
| FR-V2-015 | "Quiet week" alternate content (roofing industry news) | `[Out-of-wedge → V2]` | Content strategy deferred; V1 digest is DA-only |
| FR-V2-016 | Referral / affiliate programme | `[Out-of-wedge → V2]` | Growth lever; premature at preview scale |
| FR-V2-017 | Waitlist management for out-of-scope verticals (HVAC, PreCon Pete) | `[Out-of-wedge → V2]` | Simple email collection only in V1; no waitlist product |

---

## 4. Non-Functional Requirements

### 4.1 Performance

**NFR-001 — Digest pipeline latency**
The Sunday digest pipeline (ingestion → scoring → email delivery) for all active subscribers SHALL complete within 60 minutes of the 17:00 AEST cron trigger, such that email delivery finishes by 18:00 AEST.

*Measurement:* Timestamp delta between `cron_started_at` and last `digest_sent_at` for all active users, logged to `digest_run_log`. Alert if any run exceeds 55 minutes.

---

**NFR-002 — Web portal page load**
Web portal pages (digest history, account settings) SHALL load with a Time-to-Interactive (TTI) of ≤ 2 seconds on a 4G connection (Chrome Lighthouse mobile simulation).

*Measurement:* Lighthouse CI in Buildkite pipeline; TTI score must be ≤ 2s on the mobile preset. Tested on the digest history page and the LGA setup page.

---

**NFR-003 — Signup flow latency**
The signup-to-LGA-setup-screen flow SHALL complete in ≤ 60 seconds on a 4G mobile connection (excluding email verification wait).

*Measurement:* Measured via Playwright e2e test on Chrome Mobile emulation with 4G network throttling; test passes if total elapsed time ≤ 60 seconds.

---

**NFR-004 — Stripe checkout latency**
The Stripe Checkout page SHALL load within 3 seconds on a 4G connection.

*Measurement:* Playwright e2e test timing the Stripe Checkout redirect; alert if > 3s (Stripe-side; PI-AU cannot control, but the integration must not add > 500ms of overhead).

---

**NFR-005 — pgvector query latency**
pgvector HNSW cosine similarity queries for per-user DA ranking SHALL complete in ≤ 50ms at the 95th percentile (p95) for up to 10,000 DA vectors and 100 active users.

*Measurement:* Logged query duration in `ai_cost_log` (or a separate `perf_log`); p95 computed weekly; warning if > 50ms (no escalation in V1; reviewed at quarterly stack review per R-01 §6).

---

**NFR-006 — API endpoint latency**
All Next.js API route handlers SHALL respond in ≤ 500ms at p95 under normal load (≤ 100 concurrent active users, preview tier).

*Measurement:* Pino request logging with response time; Sentry performance monitoring.

---

### 4.2 Scalability

**NFR-007 — DA record volume**
The system SHALL support ingestion and storage of up to 10,000 DA records per week without schema or index changes.

*Measurement:* Load test with 10,000 synthetic DA records; verify ingestion pipeline completes within NFR-001 bounds.

---

**NFR-008 — Active subscriber ceiling**
The system SHALL support up to 100 active subscribers at preview tier without database tuning or infrastructure changes beyond the single Postgres node with Prisma Accelerate.

*Measurement:* Load simulation of 100 concurrent digest jobs (simulated via k6); each job must complete within NFR-001 bounds.

---

**NFR-009 — pgvector scale**
The pgvector HNSW index SHALL maintain NFR-005 query latency bounds with up to 500,000 stored DA embeddings (projected 18-month accumulation at 10,000/week).

*Measurement:* Pre-launch load test with 500,000 synthetic 1536-dim vectors; verify p95 ≤ 50ms.

---

### 4.3 Security

**NFR-010 — Password storage**
All user passwords SHALL be hashed with argon2id using parameters meeting OWASP 2024 minimum: memory cost ≥ 19 MiB, iterations ≥ 2, parallelism ≥ 1.

*Measurement:* Code review; unit test verifying argon2id parameters at CI.

---

**NFR-011 — Transport security**
All HTTP traffic SHALL be served over HTTPS (TLS 1.2 minimum, TLS 1.3 preferred). HTTP requests SHALL be redirected to HTTPS.

*Measurement:* Verified by Vercel default HTTPS; confirmed via `curl -I http://[domain]` showing 301 redirect.

---

**NFR-012 — Content Security Policy**
The Next.js application SHALL include a strict Content Security Policy (CSP) header preventing XSS and inline script execution.

*Measurement:* `next.config.ts` headers include CSP; verified via `curl -I` on the landing page; Mozilla Observatory score ≥ B.

---

**NFR-013 — Rate limiting**
API routes exposed to unauthenticated requests (signup, feedback, webhooks) SHALL be rate-limited to prevent abuse.

*Measurement:*
- `/api/auth/signup`: ≤ 5 requests/IP/minute; returns 429 on excess.
- `/api/feedback`: ≤ 20 requests/token/hour; returns 429 on excess.
- `/api/webhooks/*`: Twilio/Stripe signature validation required; unauthenticated requests return 401.
- Rate limiting implemented via Vercel Edge middleware or a lightweight in-memory counter (Redis deferred to launch+).

---

**NFR-014 — Secrets management**
All secrets (API keys, database URLs, Stripe keys, Twilio auth tokens, Anthropic API key, OpenAI API key) SHALL be stored in GCP Secret Manager and injected as environment variables via Vercel environment settings. No secrets in source code or git history.

*Measurement:* `.gitignore` includes `.env*`; CI checks for accidental secret commits (trufflehog or similar scan in Buildkite pipeline); all `process.env.*` references to secrets verified to have no hardcoded defaults.

---

**NFR-015 — Webhook authentication**
Stripe and Twilio webhook endpoints SHALL validate vendor-provided signatures on every request.

*Measurement:*
- Stripe: `stripe.webhooks.constructEvent(body, sig, secret)` — throws on invalid signature.
- Twilio: `twilio.validateRequest(authToken, sig, url, params)` — returns 401 on failure.
- Verified via unit tests with tampered signatures.

---

**NFR-016 — Feedback token security**
The HMAC-signed one-time tokens used in email feedback links (FR-023) SHALL be signed with a server-side secret, validated on receipt, and expire after 7 days.

*Measurement:* Unit test verifying token rejection after expiry and on tampered payload.

---

**NFR-017 — Session security**
Lucia session cookies SHALL use `httpOnly = true`, `SameSite = Lax`, `Secure = true` (HTTPS-only), with a session lifetime of 30 days.

*Measurement:* Playwright e2e test inspects Set-Cookie headers; verified attributes match spec.

---

**NFR-018 — Public data only**
The system SHALL not make HTTP requests to Cordell Connect, LeadManager, EstimateOne, or any commercial site under terms-of-service restriction.

*Measurement:* Code review; outbound HTTP calls audited in backend code; `fetch` / `axios` / `got` call sites enumerated and whitelisted.

---

### 4.4 Availability and Reliability

**NFR-019 — Sunday digest delivery SLA**
The Sunday 6 pm AEST email digest SHALL be delivered to ≥ 99% of active subscribers by 7:00 pm AEST in any given week.

*Measurement:* `digest_run_log` table tracks `sent_at` per user; weekly ops review. If any week's delivery rate falls below 99%, root cause analysis is triggered (no automated alert in V1 beyond the 55-minute pipeline alert from NFR-001).

---

**NFR-020 — Ingestion uptime**
The nightly DA ingestion pipeline SHALL complete successfully ≥ 95% of nights (i.e. ≤ 1.5 failed nights per month).

*Measurement:* `ingestion_log` table; ops review weekly; Sentry alert on ingestion failure (FR-001 / FR-002).

---

**NFR-021 — Cron endpoint uptime monitor**
A single uptime monitor SHALL check the Sunday digest cron endpoint is reachable (HTTP 200) every hour on Sundays between 15:00 and 20:00 AEST.

*Measurement:* Configured as a single uptime check per R-01 §observability.uptime; alert if endpoint is unreachable within the monitoring window.

---

**NFR-022 — Retry on transient error**
The nightly ingestion cron and the Sunday digest cron SHALL each retry once on transient error (5xx from upstream API or timeout) after a 15-minute wait. A second failure is reported to Sentry and the run is marked failed.

*Measurement:* Integration test simulating 5xx from mock API; verifies retry fires after 15 minutes and Sentry alert fires on second failure.

---

### 4.5 Maintainability

**NFR-023 — Structured logging**
All server-side log output SHALL use Pino for structured JSON logging with at minimum: `level`, `timestamp`, `message`, `user_id` (if authenticated), `request_id`, `phase`.

*Measurement:* Log output verified as valid JSON in staging; log levels consistently applied (`info` for normal operations, `warn` for recoverable anomalies, `error` for failures).

---

**NFR-024 — Test coverage**
The codebase SHALL maintain ≥ 80% unit test coverage (Vitest) on the relevance pipeline, feedback token generation/validation, and Stripe/Twilio webhook handlers.

*Measurement:* `vitest --coverage` in Buildkite CI; coverage report published as artifact; build fails if coverage drops below 80% on the specified modules.

---

**NFR-025 — Database migrations**
All database schema changes SHALL be managed via versioned Prisma migrations in `prisma/migrations/`. No direct schema mutations in production.

*Measurement:* `prisma migrate deploy` is the only mechanism for schema changes; verified by CI gate.

---

**NFR-026 — CI pipeline**
All code changes SHALL pass the Buildkite CI pipeline before merging. The pipeline SHALL include: TypeScript type check, ESLint, Vitest unit tests, eval harness (on relevance pipeline changes), Playwright e2e tests, Lighthouse CI, and Sentry source map upload.

*Measurement:* Buildkite pipeline definition at `.buildkite/pipeline.yml`; all jobs must pass (green) before merge.

---

### 4.6 Compliance

**NFR-027 — SPAM Act 2003 compliance**
All commercial electronic messages (email and SMS) SHALL comply with Spam Act 2003 (Cth):
- Must include the sender's identity.
- Must include a functional unsubscribe mechanism.
- Must not send to users who have opted out.

*Measurement:*
- Email footer contains PI-AU identity, ABN, and an unsubscribe link.
- SMS messages include "Reply STOP to unsubscribe" (within 480 chars limit or as a separate concatenation).
- Opt-out is honoured within 5 business days (system honours immediately).

---

**NFR-028 — Privacy Act 1988 / APPs compliance**
The system SHALL comply with the Australian Privacy Principles (APPs):
- Privacy policy accessible from homepage and footer.
- Personal information (email, mobile number, ABN, thumbs data) collected only as needed.
- Users can request deletion of their personal data (handled by ops via a deletion process in V1; automated deletion is `[Out-of-wedge → V2]`).
- Personal data not sold or shared with third parties (except processors: Stripe, Resend, Twilio, Anthropic, OpenAI, PostHog — covered in privacy policy).

*Measurement:* Privacy policy reviewed by legal before GA (legal-compliance skill phase). APPs checklist completed pre-launch.

---

**NFR-029 — GST compliance**
All AUD pricing displayed and charged via Stripe SHALL include GST (10%) as a separate line item.

*Measurement:* Stripe Checkout tested with a real AU card; Stripe invoice shows GST line item. Stripe Tax configured for AU GST.

---

**NFR-030 — Accessibility (WCAG 2.1 AA)**
The web portal and email templates SHALL meet WCAG 2.1 AA accessibility standards at minimum.

*Measurement:*
- Touch targets ≥ 44×44 px (per R-01 §5 and C-13).
- Colour contrast ratio ≥ 4.5:1 for normal text, ≥ 3:1 for large text.
- All interactive elements keyboard-navigable.
- Images (where present) have alt text.
- Lighthouse accessibility score ≥ 90 in Buildkite CI.

---

## 5. Use Cases

### UC-001 — Weekly Digest Receipt (Critical Flow)

**Actor:** Estimator Eli (subscribed Solo user)
**Precondition:** User account is active (trial or paid), email verified, LGA bundles selected, card on file.

**Main Flow:**
1. Sunday 11:00 pm Saturday to Saturday AEST: nightly ingestion cron fires and fetches DAs for all 15 LGAs (FR-001, FR-002).
2. Sunday 17:00 AEST: digest cron fires (FR-009).
3. System performs rule pass for the user's LGA bundle + roofing vocabulary (FR-004).
4. System embeds passing DAs and ranks via pgvector cosine similarity (FR-005).
5. System sends top-30 to claude-haiku-4-5 for rerank + one-line summaries (FR-006).
6. System assembles 5–15-item digest with precision recap stat header if applicable (FR-013).
7. Resend sends the mobile-first email digest at ≈ 18:00 AEST (FR-010).
8. Twilio sends SMS top-3 if user has sms_opt_in = true (FR-011).
9. Eli opens email, taps 👍/👎 on DA cards (FR-023).
10. Eli taps "View DA →" on a promising card and lands on the council portal (FR-012).

**Alternative flows:**
- 5a. No DAs score ≥ 4: system sends "quiet week" email with raw count checked (FR-010).
- 7a. Email delivery fails: Sentry alert fires; retry within 30 minutes (FR-010 acceptance criteria).
- 8a. SMS delivery fails: non-blocking; Sentry alert fires (FR-011).

**Postcondition:** User has received the digest; thumbs feedback written to `da_feedback`; AI cost logged to `ai_cost_log`.

---

### UC-002 — Self-Serve Signup and Trial Activation

**Actor:** Estimator Eli (new user)
**Precondition:** User is on the PI-AU homepage; no existing account.

**Main Flow:**
1. Eli clicks "Start free trial."
2. Eli fills signup form (email, password, mobile number) and submits (FR-014).
3. Account created; Resend sends email OTP; Eli is redirected to LGA setup screen.
4. Eli selects LGA bundle(s) (FR-015).
5. Eli is presented with pricing screen (Solo AUD 199/mo, Team AUD 499/mo).
6. Eli clicks "Start 14-day trial" → Stripe Checkout (FR-018).
7. Eli enters card details; Stripe saves card, no charge until day 15.
8. Stripe fires `subscription.created` webhook; PI-AU sets `subscription_status = 'trial'` (FR-030).
9. Eli receives Resend confirmation email: "Trial started."
10. Eli verifies email via OTP link (FR-016).
11. On day 12, reminder email fires (FR-028).
12. On day 15, Stripe charges card; if success, `subscription_status = 'active'`.

**Alternative flows:**
- 6a. Eli selects Team tier: 3 seats; Stripe charges AUD 499/mo + GST from day 15; Eli can invite 2 seat holders post-activation (FR-021).
- 12a. Day-15 charge fails: Resend payment failure email sent; access continues per Stripe dunning settings.

**Postcondition:** Account is active; first digest fires on the next Sunday.

---

### UC-003 — Subscription Cancellation

**Actor:** Estimator Eli (subscribed user)
**Precondition:** User is logged in; subscription is active.

**Main Flow:**
1. Eli navigates to "Account → Subscription."
2. Eli sees current plan, next billing date, next charge amount.
3. Eli clicks "Cancel subscription."
4. Eli sees single confirmation screen with final billing date (FR-019).
5. Eli confirms.
6. System calls Stripe to cancel; `access_until = period_end` stored in Postgres.
7. Resend sends cancellation confirmation email.
8. Eli retains read-only access to digest history until period end.

**Alternative flows:**
- 3a. Eli closes the confirmation screen: no change; no dark-pattern retention modal.

**Postcondition:** `subscription_status = 'cancelled'`; no further charges; access until period end.

---

### UC-004 — Thumbs Feedback Submission (In-Email)

**Actor:** Estimator Eli (subscribed user)
**Precondition:** Eli has received a digest email; email client is iOS Mail or Gmail Mobile.

**Main Flow:**
1. Eli opens digest email.
2. Eli taps 👍 on a DA card (FR-023).
3. Browser opens `/api/feedback?id=[da_id]&user=[token]&v=1`.
4. Server validates HMAC token; writes `(user_id, da_id, feedback: up, created_at)` to `da_feedback`.
5. Server returns plain HTML "Marked ✓ — thank you" page.

**Alternative flows:**
- 4a. Token expired (> 7 days): returns "feedback link expired" page with portal URL.
- 2a. Eli taps 👎: same flow with `v=0`.

**Postcondition:** Feedback recorded; used in next Sunday scoring run.

---

### UC-005 — SMS Opt-Out via STOP Reply

**Actor:** Estimator Eli (subscribed user who received an SMS)
**Precondition:** User has sms_opt_in = true; has received a Twilio SMS digest.

**Main Flow:**
1. Eli replies STOP to the digest SMS.
2. Twilio processes STOP and sends the opt-out confirmation reply automatically.
3. Twilio fires inbound webhook to `/api/webhooks/twilio` (FR-029).
4. Server validates Twilio signature; matches mobile number to user; sets `sms_opt_in = false`.
5. No further SMS sent to this number.

**Postcondition:** `sms_opt_in = false`; user still receives email digests.

---

### UC-006 — LGA Bundle Update

**Actor:** Estimator Eli (subscribed user)
**Precondition:** User is logged in.

**Main Flow:**
1. Eli navigates to "Account → My Area."
2. Current LGA selection is highlighted.
3. Eli adds "Southern Sydney" bundle; clicks Save.
4. Postgres updated immediately; confirmation message displayed (FR-020).
5. New selection applies from next Sunday digest.

---

### UC-007 — Eval Harness Validation (Pre-Launch Gate)

**Actor:** Ops / engineering team
**Precondition:** `eval/` directory contains promptfoo config and 500-pair labelled dataset; relevance pipeline code is complete.

**Main Flow:**
1. Engineer runs `promptfoo eval` in `eval/`.
2. Promptfoo runs all 500 pairs through the relevance pipeline.
3. Precision and recall metrics are computed.
4. If precision ≥ 0.70 at recall ≥ 0.60: gate passes; GA is approved.
5. Results are committed to `eval/results/` with timestamp.

**Alternative flows:**
- 4a. Gate fails: engineering iterates on prompt or pipeline; re-runs eval. Kill switch 5.4 applies if gate cannot be cleared after 4 weeks.

**Postcondition:** Eval gate status documented; launch decision recorded.

---

## 6. Data Requirements

### 6.1 Core Data Entities

| Entity | Table | Key Fields |
|---|---|---|
| User | `users` | `id`, `email`, `mobile`, `password_hash`, `email_verified`, `sms_opt_in`, `subscription_status`, `access_until`, `lga_bundle_ids`, `personalisation_notified_at`, `created_at` |
| Saved Query Embedding | `users` (embedded) | `query_text`, `query_embedding` (vector(1536)) |
| Development Application | `development_applications` | `id`, `da_id`, `council`, `address`, `description`, `estimated_value`, `lodgement_date`, `applicant_name`, `portal_url`, `raw_scope_text`, `source_api`, `rule_filtered_out`, `ingested_at` |
| DA Embedding | `da_embeddings` | `da_id` (FK), `embedding` (vector(1536)), `embedded_at` |
| Digest Run | `digest_runs` | `id`, `run_date`, `triggered_at`, `completed_at`, `user_count`, `status` |
| Digest | `digests` | `id`, `user_id`, `run_id`, `sent_at`, `da_count`, `email_status`, `sms_status` |
| Digest DA | `digest_das` | `id`, `digest_id`, `da_id`, `relevance_score`, `why_matched`, `rank` |
| Thumbs Feedback | `da_feedback` | `id`, `user_id`, `da_id`, `feedback` (enum: up/down), `source` (email/portal), `created_at` |
| AI Cost Log | `ai_cost_log` | `id`, `user_id`, `phase`, `model`, `input_tokens`, `output_tokens`, `cost_aud`, `week_start`, `created_at` |
| Ingestion Log | `ingestion_log` | `id`, `council`, `source_api`, `da_count`, `run_at`, `success`, `error_message` |
| DA Ground Truth | `da_ground_truth` | `id`, `da_id`, `council`, `is_relevant`, `labelled_by`, `labelled_at` |
| User Consent | `user_consent` | `id`, `user_id`, `posthog_consent`, `consented_at` |
| Session | managed by Lucia | Lucia default schema |
| Stripe Customer | Stripe + `users.stripe_customer_id` | Stripe-side; `stripe_customer_id` stored in users |

### 6.2 Data Retention

| Data | Retention | Rationale |
|---|---|---|
| DA records | Indefinite (V1) | Required for recall audit and thumbs history |
| DA embeddings | Indefinite (V1) | Required for reranking; regenerate only on model change |
| Digest history | Indefinite (V1) | User-facing history in web portal |
| Thumbs feedback | Indefinite (V1) | Personalisation and eval harness |
| `ai_cost_log` | 12 months rolling | Cost auditing; purge after 12 months |
| `ingestion_log` | 90 days rolling | Drift detection; older data not needed |
| Session tokens | 30 days (inactive) | Lucia default |
| User account | Until deletion request | APPs compliance; deletion by ops on request |

### 6.3 Data Sovereignty

All PI-AU data is stored in the GCP region provisioned for the project (`$PROJECT_ID`). No PI-AU data is transferred outside Australia except:
- OpenAI API calls (embeddings): DA descriptions sent to OpenAI servers. DA descriptions are public government data (no PII).
- Anthropic Claude API calls (LLM rerank): DA descriptions sent to Anthropic servers. Same public-data rationale.
- Stripe, Resend, Twilio, PostHog, Sentry: user email, mobile number, and anonymised event data processed by their servers per their DPAs.

Privacy policy must disclose all third-party processors.

---

## 7. External Interface Requirements

### 7.1 User Interfaces

**UI-001 — Mobile-first digest email**
- Full-width stacked DA cards on mobile (375px+ viewport); 2-column grid at md: (768px+).
- React Email template rendered server-side; Resend delivers rendered HTML.
- Inline CSS only (React Email handles this); no external stylesheet references.
- No JavaScript in email body (feedback via plain HTML links per FR-023).
- Touch targets ≥ 44×44 px for all interactive elements (👍, 👎, "View DA →").
- Dark mode aware (prefers-color-scheme media query in email CSS where supported).

**UI-002 — Web portal (Next.js App Router)**
- Tailwind CSS v4 with mobile-first breakpoints.
- shadcn/ui component library for consistent UI elements.
- React Hook Form for form handling; Zod for client-side validation.
- Viewport meta tag: `<meta name="viewport" content="width=device-width, initial-scale=1">`.
- Core pages: Landing page, Signup, LGA setup, Pricing/Checkout, My Digests, Account settings.

**UI-003 — SMS format**
- Plain text; no HTML.
- ≤ 3 concatenated parts (≤ 480 characters).
- Format per DA: `"[Address] | [Scope ≤ 20 words] | AUD [Value or 'N/A'] | [URL]"`.
- Australian sender ID if available via Twilio; otherwise short code.

### 7.2 API Interfaces

**API-001 — Feedback endpoint**
- `GET /api/feedback?id=[da_id]&user=[token]&v=[0|1]`
- Auth: HMAC token (no Lucia session required — supports email link clicks from unauthenticated browser tabs).
- Returns: 200 HTML "Marked ✓" page or 400 HTML "link expired" page.
- Rate limited: 20 requests/token/hour.

**API-002 — Twilio inbound webhook**
- `POST /api/webhooks/twilio`
- Auth: Twilio signature header validation.
- Body: `x-www-form-urlencoded` (Twilio standard).
- Returns: 200 TwiML `<Response/>` (empty response; Twilio handles STOP confirmation reply automatically).

**API-003 — Stripe webhook**
- `POST /api/webhooks/stripe`
- Auth: `Stripe-Signature` header validation.
- Body: JSON.
- Returns: 200 on success; 400 on invalid signature.

**API-004 — Next.js API routes (authenticated)**
All other API routes require a valid Lucia session cookie.
- `POST /api/auth/signup`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET/POST /api/account/lga`
- `GET/POST /api/account/notifications`
- `GET /api/digests`
- `GET /api/digests/[id]`
- `POST /api/feedback` (portal thumbs — authenticated, no token required)

### 7.3 Third-Party Integrations

| Integration | Purpose | Auth method | Failure handling |
|---|---|---|---|
| NSW Planning Portal Online DA Service API v2 | DA ingestion | API key (subscription-key header) | Retry once after 15min; Sentry alert on second failure |
| DA Leads API | DA ingestion (non-NSW-Portal LGAs) | API key | Same as above |
| Council DA API | DA ingestion (non-NSW-Portal LGAs) | API key | Same as above |
| OpenAI API (text-embedding-3-small) | DA and query embeddings | API key (env var) | Retry 3× with exponential backoff; Sentry alert on failure |
| Anthropic Claude API (haiku-4-5) | LLM rerank and one-line summaries | API key (env var) | Retry 3× with exponential backoff; Sentry alert on failure; fallback to embedding-only ranking if LLM unavailable |
| Resend | Transactional email | API key | Retry once; Sentry alert on second failure |
| Twilio | SMS top-3 delivery; inbound STOP webhook | Auth token | Non-blocking; Sentry alert on failure; no retry in V1 |
| Stripe AU | Payments, subscriptions, GST | Secret key + webhook secret | Webhook idempotency; payment failure triggers email |
| Lucia | Session management | Internal (no external API) | n/a |
| PostHog | Product analytics, feature flags | API key | Consent-gated; analytics failure is non-blocking |
| Sentry | Error tracking, alerting | DSN | Best-effort; must not block request flow |
| GCP Secret Manager | Secrets storage | GCP service account (`$PROJECT_ID`) | Cached at startup; restart if unavailable |
| Vercel | Hosting, Cron, CDN | Vercel token (CI deploy) | Provider-managed |
| Buildkite | CI | `$BK_API_TOKEN` | Pipeline failure blocks merge |
| Prisma Accelerate | Postgres connection pooler | Connection string | Falls back to direct Postgres if pooler unavailable (V1 acceptable) |

---

## 8. Assumptions and Dependencies

| ID | Type | Statement | Risk if wrong | Validation |
|---|---|---|---|---|
| A-01 | Assumption | NSW Planning Portal Online DA Service API v2 covers ≥ 10 of the 15 target LGAs with live data. | If < 10 LGAs are covered, additional council-direct scrapers must be built (timeline impact). | API key test against all 15 LGAs before dev week 2. |
| A-02 | Assumption | Re-roof projects in NSW require a formal DA lodgement (not CDC-only) for ≥ 80% of projects a Sydney roofer would quote. | If CDCs dominate, DA-stage data is insufficient and the wedge hypothesis fails. | Manual review of 50 recent council DA portals across the 4 LGA bundles; count genuine re-roof scope; resolve before code. |
| A-03 | Assumption | OpenAI text-embedding-3-small + claude-haiku-4-5 can achieve precision ≥ 0.70 at recall ≥ 0.60 on the 500-pair labelled roofing set. | Eval gate cannot be cleared; kill switch 5.2/5.4 applies. | Eval harness built in dev weeks 2–6; gate checked before GA. |
| A-04 | Assumption | Email + SMS is the correct delivery channel; target users open digests via email. | If open rate < 30% after 4 weeks, push notification channel must be explored (scope expansion). | Open rate tracked from digest #1 via Resend events; decision point at week 4 post-launch. |
| A-05 | Assumption | Sunday 6 pm AEST is the right delivery cadence for roofing owner-operators. | If quoting happens earlier in the week, digest cadence misses the decision window. | Survey 5 pilot users on quoting workflow before first digest. |
| A-06 | Assumption | NSW Planning Portal API, DA Leads API, and Council DA API have commercially permissible terms for building a paid SaaS product on top of their data. | If API ToS prohibit commercial use, data layer must be rebuilt; possible legal exposure. | Legal review of all API ToS before code (legal-compliance skill phase). |
| A-07 | Assumption | DA descriptions contain sufficient roofing-specific vocabulary for the rule pass filter to achieve ≥ 50% recall (before embedding/LLM stages). | If DA descriptions are too generic, rule pass filters out too many real re-roofs; recall collapses. | Manual review of 50 DA descriptions per LGA before building the relevance pipeline. |
| A-08 | Assumption | The 500-pair labelled eval dataset can be sourced from manually exported council DA portal data or from a DA Leads API sample before the ingestion pipeline is built. | If labelling source requires the ingestion pipeline to be built first, the eval harness launch gate cannot be reached independently. | Sourcing plan: (a) Penrith/Blacktown manual export, (b) DA Leads API sample, or (c) NSW Planning Portal API 30-day pull. Resolved before dev week 2. |
| A-09 | Dependency | Stripe AU supports AUD pricing with GST as a line item via Stripe Tax. | If Stripe Tax requires additional configuration or approval in AU, GST display may be delayed. | Stripe Tax tested with AU test card before dev week 4. |
| A-10 | Dependency | Vercel Cron supports Sunday 17:00 AEST scheduling with ≤ 5-minute accuracy. | If Vercel Cron drift is > 5 minutes, delivery SLA (NFR-019) may be breached. | Vercel Cron tested in staging for 2 consecutive Sundays before GA. |
| A-11 | Dependency | Twilio supports Australian sender IDs and inbound STOP webhook processing for AU mobile numbers. | If Twilio AU STOP webhook is not available, SPAM Act opt-out compliance relies on web portal only. | Twilio AU compliance requirements verified before dev week 3. |
| A-12 | Assumption | claude-haiku-4-5 API is available at the cost tier required to stay within AUD 0.13/user/week. | If model pricing changes or API throttling occurs, cost ceiling may be breached. | Cost ceiling monitored via `ai_cost_log` from day 1; Sentry alert on breach; haiku is the cheapest Anthropic production model in 2026-Q2. |

---

## Requirement Count Summary

| Category | Count |
|---|---|
| Functional Requirements — `[wedge-critical]` | 19 |
| Functional Requirements — `[wedge-supporting]` | 11 |
| Functional Requirements — `[Out-of-wedge → V2]` | 17 |
| Non-Functional Requirements | 17 |
| Use Cases | 7 |
| Open issues / assumptions | 12 |

---

*End of SRS v1.0.*

*Stack contract version: 2026-Q2 (R-01). Next SRS review: on tier upgrade from preview to launch, or when any kill switch (5.1–5.4) is triggered.*
