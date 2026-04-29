# E2E Known Failures

Entries documented by the e2e-tester phase. Do NOT route back via route-failure.sh —
the orchestrator does that in Phase 8 (adversarial-tester).

---

## BUG-001: Duplicate route `/area` — `/(auth)/area` and `/(portal)/area` conflict

| Field | Value |
|---|---|
| **File** | `src/app/(auth)/area/page.tsx` |
| **Route** | `GET /area` |
| **Expected** | `/area` resolves to the auth-flow LGA bundle selection page during onboarding |
| **Actual** | Next.js 500 error: "You cannot have two parallel pages that resolve to the same path. Please check `/(auth)/area/page` and `/(portal)/area/page`." |
| **Likely owner** | frontend (route structure) |
| **Severity** | High — blocks the LGA bundle selection step in the wedge critical flow |
| **Notes** | The auth-flow area picker at `/(auth)/area/page.tsx` and the portal area settings at `/(portal)/area/page.tsx` both resolve to `/area`. One must be renamed, e.g. `/(auth)/onboarding/area` or `/(portal)/account/area`. The portal already has `/portal/area` referenced in the UX spec as `/portal/account/area`. |

---

## BUG-002: Login page DB connection error (500 on /login)

| Field | Value |
|---|---|
| **File** | `src/app/(auth)/login/page.tsx` (or underlying auth middleware) |
| **Route** | `GET /login` |
| **Expected** | `/login` renders the login form |
| **Actual** | Next.js 500 error — likely Prisma/PostgreSQL connection failure (`DATABASE_URL` not set in local dev without running `pnpm db:up`) |
| **Likely owner** | backend / auth-engineer |
| **Severity** | Medium — only occurs when DB is not running. Tests stub the API so UI still renders. With STUB_DB=1 or when DB is running, this resolves. |
| **Notes** | Portal layout at `/(portal)/layout.tsx` calls `validateRequest()` which hits the DB. Without a live DB, any portal page 500s. Tests use `page.route()` stubs to bypass this for UI rendering assertions, but the auth redirect itself (from portal layout) cannot be stubbed at the RSC level. |

---

## BUG-003: `DELETE /api/billing/subscription` endpoint not implemented

| Field | Value |
|---|---|
| **File** | `src/app/api/billing/` |
| **Route** | `DELETE /api/billing/subscription` |
| **Expected** | `CancelSubscriptionDialog` calls `DELETE /api/billing/subscription` and receives `{ ok: true }` |
| **Actual** | Only `POST /api/billing/checkout` and `POST /api/billing/portal` exist. The `DELETE /api/billing/subscription` route is not present in the codebase. The `cancel-subscription-dialog.tsx` hardcodes this endpoint. |
| **Likely owner** | backend |
| **Severity** | High — cancellation flow is a wedge-critical user story (SF-3.5). Will 404 in production. |
| **Notes** | The API reference (`docs/07-api-reference.md`) does not document this endpoint either. backend-developer must add it. Tests stub the response so the UI cancel flow still passes. |

---

## BUG-004: OTP verify page calls `/api/auth/otp` instead of `/api/auth/verify-email`

| Field | Value |
|---|---|
| **File** | `src/app/(auth)/verify/page.tsx:71` |
| **Route** | `POST /api/auth/otp` (called), `POST /api/auth/verify-email` (documented) |
| **Expected** | OTP submission calls `POST /api/auth/verify-email` per `docs/07-api-reference.md` |
| **Actual** | `verify/page.tsx` calls `/api/auth/otp` (line 71) and `/api/auth/otp/resend` (line 93). These routes do not exist — only `/api/auth/verify-email` and `/api/auth/verify-email/resend` are implemented. |
| **Likely owner** | frontend / auth-engineer |
| **Severity** | High — OTP verification always 404s in production. Wedge critical path broken at step 3. |
| **Notes** | Tests stub both `/api/auth/otp` and `/api/auth/verify-email` so the wedge critical flow passes in test. Fix: update `verify/page.tsx` to POST to `/api/auth/verify-email` and `/api/auth/verify-email/resend`. |

---

## BUG-005: Area selection page calls `/api/account/lga` instead of `/api/account/lga-bundles`

| Field | Value |
|---|---|
| **File** | `src/app/(auth)/area/page.tsx:51` |
| **Route** | `POST /api/account/lga` (called), `PUT /api/account/lga-bundles` (documented) |
| **Expected** | Area submission calls `PUT /api/account/lga-bundles` per `docs/07-api-reference.md` |
| **Actual** | `area/page.tsx` calls `POST /api/account/lga`. This endpoint does not exist. |
| **Likely owner** | frontend / auth-engineer |
| **Severity** | Medium — blocks LGA selection save in onboarding. However, BUG-001 (duplicate route) is the more immediate blocker for `/area`. |

---

## BUG-006: Feedback endpoint mismatch — DA card calls `/api/portal/feedback` instead of `/api/feedback`

| Field | Value |
|---|---|
| **File** | `src/components/da-card.tsx:66` |
| **Route** | `POST /api/portal/feedback` (called), `POST /api/feedback` (documented) |
| **Expected** | Thumb up/down calls `POST /api/feedback` per `docs/07-api-reference.md` |
| **Actual** | `da-card.tsx` calls `/api/portal/feedback` (lines 66, 89). This path doesn't exist; only `/api/feedback` is implemented. |
| **Likely owner** | frontend |
| **Severity** | High — thumb feedback never persists in production. Core wedge interaction broken. |
| **Notes** | Tests stub both paths. Fix: update `da-card.tsx` to POST to `/api/feedback`. |

---

## KNOWN-GAP-001: Auth redirect for portal pages not testable via page.route stubs

| Field | Value |
|---|---|
| **Spec** | `e2e/auth.spec.ts` — "accessing /digest without session redirects to login" |
| **Issue** | `/(portal)/layout.tsx` calls `validateRequest()` server-side (RSC). `page.route()` stubs work for client-initiated fetch calls but cannot intercept RSC server calls to Prisma. Without a live DB, the portal layout throws a 500 (not a clean 401 redirect). |
| **Workaround** | Test documented with annotation. Run with a live DB and real session to validate the redirect. |
| **Owner** | backend / auth-engineer — needs a DB-less fallback or env-check in validateRequest() |

---

## KNOWN-GAP-002: Logout UI element not present

| Field | Value |
|---|---|
| **Spec** | `e2e/auth.spec.ts` — "logout clears session and redirects to login or home" |
| **Issue** | `/account` page does not have a visible logout button or link. The page shows profile info, subscription status, and cancel subscription — but no logout action. |
| **Owner** | frontend — add a logout button to the account page per UX design. |

---

*Total: 6 bugs, 2 known gaps. All bugs are in application code, not in tests.*
*Phase 8 (adversarial-tester) will route failures via route-failure.sh.*
