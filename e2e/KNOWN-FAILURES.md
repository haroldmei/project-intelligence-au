# E2E Known Failures

None currently open.

The six failures the e2e-tester phase originally logged here (BUG-001…006) have
all been fixed in the product. This file is now a resolved-log; add new entries
only when a genuinely open failure is observed, and delete them once fixed.

---

## Resolved

| ID | Title | Resolution |
|----|-------|------------|
| BUG-001 | Duplicate route `/area` (`/(auth)/area` vs `/(portal)/area`) | Onboarding picker moved to `/onboarding/area`; portal settings at `/account/area`. No route collision. |
| BUG-002 | Portal pages 500/redirect without a DB | Expected behaviour, not a bug: the portal layout's RSC `validateRequest()` needs a DB. Portal e2e now gate on `PLAYWRIGHT_DB=1`. |
| BUG-003 | `DELETE /api/billing/subscription` not implemented | Implemented (cancel-at-period-end + reactivate); covered by `__tests__/billing/lifecycle.test.ts`. |
| BUG-004 | OTP verify called `/api/auth/otp` | Verify page POSTs `/api/auth/verify-email`; the `/api/auth/otp` fossil route no longer exists. |
| BUG-005 | Area page called `/api/account/lga` | Area page calls `/api/account/lga-bundles`. |
| BUG-006 | DA card called `/api/portal/feedback` | Feedback goes through `/api/feedback` (portal) and `/api/feedback/[token]` (email links). |
