<!-- WEDGE: The Sunday-night roofing DA digest for Sydney subbies — 15 LGAs, 5–15 leads, AUD 199/mo, signup in 60 seconds. -->

# Dogfood Iteration 0 — Summary

**Date:** 2026-04-28
**Scale tier:** preview
**Walk artifacts:** `dogfood/iter-0/step-*.md` + screenshots

---

## Verdict: **POLISH**

Health score 8.4 falls in the [7, 9) POLISH band per the build-product-v2 routing
rule. One capped frontend round to clear the polish backlog below, then re-ship
without re-running the wedge walk from scratch.

---

## Per-Step Score Table

| # | Step | Spec ref | Score | Weight class |
|---|---|---|---:|---|
| 1 | Landing page | §7.1 | 9 | signup (1.5×) |
| 2 | Signup step 1/4 | §7.2 | 8 | signup (1.5×) |
| 3 | OTP verify step 2/4 | §7.3 | 7 | signup (1.5×) |
| 4 | LGA bundle step 3/4 | §7.4 | 9 | signup (1.5×) |
| 5 | Pricing step 4/4 | §7.5 | 9 | signup (1.5×) |
| 6 | Digest (empty state) | §7.6 | 8 | digest/wedge (2.0×) |
| 7 | Digest history | §7.7 | 8 | digest/wedge (2.0×) |
| 8 | Thumb up/down | §7.8 | 8 | digest/wedge (2.0×) |
| 9 | SMS opt-in | §7.9 | 9 | settings (1.0×) |
| 10 | My service area | §7.10 | 9 | settings (1.0×) |
| 10b | Cancel-subscription confirm | §7.10b | 9 | settings (1.0×) |

---

## Weighted Health Score

```
Signup flow (steps 1–5, weight 1.5):
  (9 + 8 + 7 + 9 + 9) × 1.5 = 42 × 1.5 = 63.0

Digest / wedge core (steps 6–8, weight 2.0):
  (8 + 8 + 8) × 2.0       = 24 × 2.0 = 48.0

Settings (steps 9, 10, 10b, weight 1.0):
  (9 + 9 + 9) × 1.0       = 27 × 1.0 = 27.0

Weighted sum   = 63.0 + 48.0 + 27.0 = 138.0
Total weight   = 5×1.5 + 3×2.0 + 3×1.0 = 7.5 + 6.0 + 3.0 = 16.5

Health score   = 138.0 / 16.5 = 8.36 → 8.4 (one decimal)
```

**Verdict band:** 7 ≤ 8.4 < 9 → **POLISH**

---

## Top 5 Polish Items (priority-ranked)

1. **(P0) OTP cells: support paste / iOS auto-fill of 6-digit code.** Currently
   each cell takes 1 char and pasting "123456" into cell 1 does not distribute.
   Wrap the grid with a hidden `<input autocomplete="one-time-code">` or
   implement paste-distribute in the onChange handler. Blocks the wedge's
   "60-second signup" promise on iOS Mail → tap-to-fill flow. (step-03)

2. **(P0) Phone-input contract mismatch on signup.** Visible `+61` chip implies
   user types only the trailing digits, but the validator requires full E.164
   (`+61412345678`); plain `0412345678` and `412345678` both fail with a terse
   "Validation failed." Either accept and normalise national-format input, or
   show the prefix as text outside the input and document the expected format
   under the field. Friction-cost is meaningful against the 60-second budget.
   (step-02)

3. **(P1) Tab-bar icons are system emoji, not Lucide React.** Current bottom
   nav renders 📋 🕐 📍 👤 (platform-dependent glyphs) instead of the Lucide
   `digest / clock / map / user` icons §5c calls for. On-brand fix; affects
   every authenticated screen (steps 6, 7, 9, 10, 10b). (step-06)

4. **(P1) Verify-email button is `type="button"` not `type="submit"`.** Breaks
   Enter-to-submit and screen-reader form semantics; required Playwright JS
   workaround in dogfood. Inside `<form>` it should be `type="submit"`.
   (step-03)

5. **(P2) Onboarding tip missing on empty-digest state (Open Issue #2 in UX
   doc).** The §7.6 spec calls for "Your digest gets smarter as you use it —
   tap 👍 or 👎 on each card." in weeks 0–3 in lieu of the precision badge.
   Currently the empty state stops at "Your first digest arrives Sunday at 6
   pm AEST." Sets up the feedback-loop expectation early — directly serves
   the cold-start moat (wedge §1.5b). (step-06)

### Carried/secondary observations (not gating, fix opportunistically)

- Hero right-half on desktop is a placeholder text block, not the crane/skyline
  image §7.1 wireframe calls for. (step-01)
- OTP email body says "to your email address" instead of echoing the actual
  address, losing a trust cue. (step-03)
- Dev OTP delivery: log the OTP under `NODE_ENV=development` so future dogfood
  walks can complete the verify step without DB writes. (step-03)
- SMS opt-in screen does not echo the user's mobile under the toggle (§7.9
  shows "(mobile: +61 4XX XXX XXX)"). (step-09)
- DA-card thumb interaction was source-verified only — seed has zero DAs, so
  inline thumb-up green-border / thumb-down dim / sr-only aria-live could not
  be exercised. Recommend a `dev-seed-digest.ts` script for future dogfood
  iterations so step-08 becomes runnable end-to-end. (step-08)

---

## Wedge-Promise Verification

Wedge sentence: *"The Sunday-night roofing DA digest for Sydney subbies — 15
LGAs, 5–15 leads, AUD 199/mo, signup in 60 seconds."*

| Promise | Built? | Evidence |
|---|---|---|
| **Sunday-night digest** | YES | Empty-state copy "Your first digest arrives Sunday at 6 pm AEST" (step-06); pricing card trust line "First digest arrives Sunday 6 pm AEST" (step-05). |
| **15 LGAs (Sydney)** | YES | 4 bundles cover all 15 nominated LGAs: Western Sydney (5), Inner West & City (4), Northern Sydney (5), Southern Sydney (4) — matches §7.4 wireframe (step-04, step-10). |
| **5–15 leads** | DEFERRED-VERIFICATION | DA card component source confirms layout for 5–15 cards; could not exercise with live data because seed has zero DAs (step-06, step-08). Wedge-conformant by design; flagged for live verification post-first-digest. |
| **AUD 199/mo** | YES | Solo tier "AUD 199/mo + GST" pre-selected on /plan; landing page pricing block matches (step-01, step-05). |
| **Signup in 60 seconds** | AT-RISK | The five-step flow is structurally <60s (4 form pages + Stripe redirect). Two friction points threaten the budget: (a) OTP cells don't accept pasted codes (step-03), (b) phone validator rejects national-format input forcing retry (step-02). Both are in the P0 polish list above. |

**Wedge-promise overall:** the built product still keeps the wedge sentence's
promise structurally — Sunday digest cadence, 15 Sydney LGAs, AUD 199 Solo,
and an under-five-minute self-serve signup are all wired correctly. The "60
seconds" claim survives only if the OTP-paste and phone-format polish items
ship in this round; the digest-content claims (5–15 leads, ranked, with
"why-matched" rationale) are component-verified but await live-data exercise.

Recommend: ship POLISH round → seed a synthetic digest for future iterations
→ re-run dogfood iter-1 (only the 5 polish items + step-08 with seeded data)
before launch gate.
