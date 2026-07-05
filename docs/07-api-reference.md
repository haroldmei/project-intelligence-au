# API Reference — ProjectIntelligence AU (PI-AU)

**Document ID:** PI-AU-API-REF-001  
**Version:** 1.1  
**Date:** 2026-07-03  
**Status:** DRAFT

---

## Overview

The ProjectIntelligence AU API is a REST API built with Next.js 15 API routes and Zod schema validation. All endpoints return JSON unless otherwise noted.

- **Base URL:** `https://pi-au.example.com/api` (production), `http://localhost:3000/api` (dev)
- **Content-Type:** `application/json` (except webhooks)
- **Authentication:** Lucia session cookie or Bearer cron secret
- **Rate Limits:** Per-endpoint (e.g., 5/min for signup, 100/hr for portal feedback)
- **Tech Stack:** Next.js 15 (App Router), Prisma 5, Zod 3, TypeScript 5

---

## Authentication

All user-facing endpoints require an active **Lucia session cookie**. The session is created automatically on signup or login and is stored as an `HttpOnly` cookie named `auth_session` (Lucia's default cookie name).

| Method | Endpoint | Purpose | Auth Required | Wedge FR |
|--------|----------|---------|---------------|----------|
| `POST` | `/auth/signup` | Register new account | No | FR-001 |
| `POST` | `/auth/login` | Authenticate with email + password | No | FR-002 |
| `POST` | `/auth/logout` | Invalidate session and clear cookie | No | FR-003 |
| `GET` | `/auth/me` | Get current user (requires session) | **Yes** | FR-002 |
| `POST` | `/auth/verify-email` | Verify email with OTP code | **Yes** | FR-004 |
| `POST` | `/auth/verify-email/resend` | Resend email OTP | **Yes** | FR-004 |
| `POST` | `/auth/verify-email/change-email` | Correct a mistyped signup email (pre-verify) and re-send OTP | **Yes** | FR-004 |
| `POST` | `/auth/password-reset/request` | Request password reset email | No | FR-005 |
| `POST` | `/auth/password-reset/confirm` | Confirm password reset with token | No | FR-005 |

### Session Cookie

After signup or login, the response includes a `Set-Cookie` header:

```
Set-Cookie: auth_session=<session_id>; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000
```

**Attributes:**
- `HttpOnly` — cannot be accessed via JavaScript (CSRF/XSS protection)
- `SameSite=Lax` — CSRF protection (same-origin POST required)
- `Max-Age=2592000` — 30-day inactivity window; refreshed on active use (see [Session Expiration](#session-expiration))

The frontend automatically includes the cookie in all requests (browsers do this by default).

### Session Expiration

Sessions use a rolling 30-day inactivity window (Lucia `sessionExpiresIn`). Each authenticated request made past the halfway point of the window extends the session for another 30 days (Lucia issues a fresh `Set-Cookie`), so active users are never forced to re-login. A session expires only after 30 days with no activity; after that the user must re-login.

---

## Module: Authentication

All auth endpoints validate input with Zod schemas and enforce rate limiting per IP or per user.

### POST /auth/signup

**Register a new user account.**

Creates a user with email, password, and mobile number. Automatically logs the user in (sets session cookie) and dispatches an email OTP for verification.

**Wedge FR-001:** Enable 60-second account creation.

#### Request

```json
{
  "email": "eli@roofing-co.com.au",
  "password": "MySecurePassword123!",
  "mobile_e164": "+61412345678",
  "acceptTerms": true
}
```

| Field | Type | Required | Validation | Notes |
|-------|------|----------|------------|-------|
| `email` | string | Yes | Valid email format | Normalized to lowercase + trim |
| `password` | string | Yes | 12–128 chars | Hashed with argon2id before storage |
| `mobile_e164` | string | Yes | E.164 format (e.g., +61412345678) | Stored for SMS delivery |
| `acceptTerms` | boolean | Yes | Must be `true` | Legal requirement |

#### Response

**201 Created** (with `Set-Cookie` header):

```json
{
  "userId": "123e4567-e89b-12d3-a456-426614174000",
  "otpDispatched": true
}
```

#### Errors

| Status | Code | Description |
|--------|------|-------------|
| `400` | — | Invalid JSON body |
| `409` | — | Email already in use (generic message to prevent enumeration) |
| `422` | — | Validation error (email format, password policy, E.164 mobile) |
| `429` | — | Rate limit: 5/min per IP (header: `Retry-After: <seconds>`) |

#### Rate Limiting

- **Limit:** 5 requests per minute per IP
- **Header:** `Retry-After` (seconds until reset)

#### Curl Example

```bash
curl -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "eli@roofing-co.com.au",
    "password": "MySecurePassword123!",
    "mobile_e164": "+61412345678",
    "acceptTerms": true
  }'
```

---

### POST /auth/login

**Authenticate with email and password.**

Validates email + password credentials and creates a new Lucia session. Session fixation mitigation: a new session is created on every login (Lucia default).

**Wedge FR-002:** Enable user authentication.

#### Request

```json
{
  "email": "eli@roofing-co.com.au",
  "password": "MySecurePassword123!"
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `email` | string | Yes | Normalized to lowercase + trim |
| `password` | string | Yes | No minimum (checked against stored hash) |

#### Response

**200 OK** (with `Set-Cookie` header):

```json
{
  "session_set": true
}
```

#### Errors

| Status | Code | Description |
|--------|------|-------------|
| `400` | — | Invalid JSON body |
| `401` | — | Invalid email or password (generic to prevent enumeration) |
| `422` | — | Validation error (email format) |
| `429` | — | Rate limit: 5/min per IP |

#### Rate Limiting

- **Limit:** 5 requests per minute per IP

#### Curl Example

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{
    "email": "eli@roofing-co.com.au",
    "password": "MySecurePassword123!"
  }'
```

---

### POST /auth/logout

**Invalidate current session and clear cookie.**

Logs out the user by invalidating their Lucia session server-side and clearing the session cookie.

**Wedge FR-003:** Enable user logout.

#### Request

No request body required.

#### Response

**200 OK** (with `Set-Cookie: auth_session=; Max-Age=0` header):

```json
{
  "ok": true
}
```

#### Curl Example

```bash
curl -X POST http://localhost:3000/api/auth/logout \
  -b cookies.txt
```

---

### GET /auth/me

**Get current authenticated user.**

Returns the authenticated user's profile for portal hydration (RSC/SWR client state).

**Requires active Lucia session.**

#### Request

No request body.

#### Response

**200 OK:**

```json
{
  "userId": "123e4567-e89b-12d3-a456-426614174000",
  "email": "eli@roofing-co.com.au",
  "emailVerified": false,
  "subscriptionStatus": "trial",
  "trade": "roofing",
  "sessionExpiresAt": "2026-05-28T10:30:00.000Z"
}
```

| Field | Type | Notes |
|-------|------|-------|
| `userId` | uuid | User ID |
| `email` | string | User's email |
| `emailVerified` | boolean | Email OTP verified? |
| `subscriptionStatus` | string | One of: `trial`, `active`, `cancelled`, `past_due` |
| `trade` | string | Always `roofing` in V1 |
| `sessionExpiresAt` | ISO 8601 | Session expiry timestamp |

#### Errors

| Status | Code | Description |
|--------|------|-------------|
| `401` | — | Unauthorized (no active session) |

#### Curl Example

```bash
curl -X GET http://localhost:3000/api/auth/me \
  -b cookies.txt
```

---

### POST /auth/verify-email

**Verify email with OTP code.**

Validates the 6-digit OTP code emailed at signup and marks `user.emailVerified = true`.

**Requires active Lucia session.**

**Wedge FR-004:** Enable email OTP verification.

#### Request

```json
{
  "code": "123456"
}
```

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `code` | string | Yes | Exactly 6 digits, numeric only |

#### Response

**200 OK:**

```json
{
  "verified": true
}
```

#### Errors

| Status | Code | Description |
|--------|------|-------------|
| `400` | — | Invalid JSON body or invalid/expired OTP code |
| `401` | — | Unauthorized (no active session) |
| `422` | — | Validation error (OTP format) |
| `429` | — | Rate limit: 10/hour per user |

#### Rate Limiting

- **Limit:** 10 requests per hour per user

#### Curl Example

```bash
curl -X POST http://localhost:3000/api/auth/verify-email \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"code": "123456"}'
```

---

### POST /auth/verify-email/resend

**Resend email verification OTP.**

Resend the email OTP to the user's registered email. Rate limited to 1/min per account.

**Requires active Lucia session.**

#### Request

No request body required.

#### Response

**200 OK:**

```json
{
  "sent": true
}
```

#### Errors

| Status | Code | Description |
|--------|------|-------------|
| `400` | — | Email already verified |
| `401` | — | Unauthorized (no active session) |
| `429` | — | Rate limit: 1/min per account |

#### Rate Limiting

- **Limit:** 1 request per minute per account

#### Curl Example

```bash
curl -X POST http://localhost:3000/api/auth/verify-email/resend \
  -b cookies.txt
```

---

### POST /auth/verify-email/change-email

**Correct a mistyped signup email before verification (issue #92).**

A signed-in but unverified user updates the pending account's email address and a
fresh OTP is dispatched to the corrected address. Only permitted while the email
is unverified. Rate limited to 5/hr per account.

**Requires active Lucia session.**

#### Request

```json
{
  "email": "eli@example.com"
}
```

#### Response

**200 OK:**

```json
{
  "email": "eli@example.com",
  "sent": true
}
```

#### Errors

| Status | Code | Description |
|--------|------|-------------|
| `400` | — | Email already verified, or invalid JSON body |
| `401` | — | Unauthorized (no active session) |
| `409` | — | Email already in use by another account |
| `422` | — | Validation failed (invalid email) |
| `429` | — | Rate limit: 5/hr per account |

#### Rate Limiting

- **Limit:** 5 requests per hour per account

#### Curl Example

```bash
curl -X POST http://localhost:3000/api/auth/verify-email/change-email \
  -H "Content-Type: application/json" \
  -d '{"email":"eli@example.com"}' \
  -b cookies.txt
```

---

### POST /auth/password-reset/request

**Request password reset (send email).**

Request a password reset for an email address. Always returns 200 (to prevent email enumeration).

**Wedge FR-005:** Enable password reset flow.

#### Request

```json
{
  "email": "eli@roofing-co.com.au"
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `email` | string | Yes | Normalized to lowercase + trim |

#### Response

**200 OK:**

```json
{
  "ok": true
}
```

(User is notified via email if account exists; no error returned if account doesn't exist.)

#### Errors

| Status | Code | Description |
|--------|------|-------------|
| `400` | — | Invalid JSON body |
| `422` | — | Validation error (email format) |
| `429` | — | Rate limit: 5/min per IP |

#### Rate Limiting

- **Limit:** 5 requests per minute per IP

#### Curl Example

```bash
curl -X POST http://localhost:3000/api/auth/password-reset/request \
  -H "Content-Type: application/json" \
  -d '{"email": "eli@roofing-co.com.au"}'
```

---

### POST /auth/password-reset/confirm

**Confirm password reset with token.**

Validate the reset OTP token and set a new password. Invalidates all existing Lucia sessions (force re-login).

**Wedge FR-005:** Enable password reset confirmation.

#### Request

```json
{
  "email": "eli@roofing-co.com.au",
  "token": "123456",
  "password": "NewSecurePassword456!"
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `email` | string | Yes | Required to identify account (token alone is insufficient in V1) |
| `token` | string | Yes | 6-digit OTP code from email |
| `password` | string | Yes | 12–128 chars; hashed with argon2id |

#### Response

**200 OK:**

```json
{
  "ok": true
}
```

#### Errors

| Status | Code | Description |
|--------|------|-------------|
| `400` | — | Invalid JSON body or invalid/expired reset token |
| `422` | — | Validation error (missing email, password policy, token format) |

#### Curl Example

```bash
curl -X POST http://localhost:3000/api/auth/password-reset/confirm \
  -H "Content-Type: application/json" \
  -d '{
    "email": "eli@roofing-co.com.au",
    "token": "123456",
    "password": "NewSecurePassword456!"
  }'
```

---

## Module: Account

All account endpoints require an active Lucia session.

| Method | Endpoint | Purpose | Wedge FR |
|--------|----------|---------|----------|
| `GET` | `/account/me` | Get account profile | FR-017 |
| `PUT` | `/account/me` | Update account profile | FR-017 |
| `GET` | `/account/lga-bundles` | Get selected LGA bundles | FR-020 |
| `PUT` | `/account/lga-bundles` | Update selected LGA bundles | FR-020 |
| `GET` | `/account/saved-query` | Get saved search query | FR-025 |
| `PUT` | `/account/saved-query` | Update saved search query | FR-025 |
| `POST` | `/account/sms-opt-in` | Opt in to SMS digests | FR-022 |
| `POST` | `/account/sms-opt-out` | Opt out of SMS digests | FR-022 |
| `POST` | `/account/storm-brief` | Opt in/out of mid-week storm briefs | FR-020 |
| `GET` | `/account/export` | Export account data (Privacy Act) | FR-031 |
| `DELETE` | `/account/delete` | Delete account (GDPR/Privacy Act erasure) | FR-032 |

### GET /account/me

**Get current account profile.**

Retrieve the authenticated user's account profile.

**Requires active Lucia session.**

#### Request

No request body.

#### Response

**200 OK:**

```json
{
  "id": "acc_123e4567",
  "userId": "123e4567-e89b-12d3-a456-426614174000",
  "lgaBundles": ["sydney-inner-west", "sydney-northern-beaches"],
  "savedQueryText": "Residential roof repairs and reroof work in Sydney",
  "smsOptIn": true
}
```

#### Errors

| Status | Code | Description |
|--------|------|-------------|
| `401` | — | Unauthorized (no active session) |
| `404` | — | Account not found (shouldn't happen if user exists) |

#### Curl Example

```bash
curl -X GET http://localhost:3000/api/account/me \
  -b cookies.txt
```

---

### PUT /account/me

**Update account profile.**

Update account profile fields (currently only mobile number).

#### Request

```json
{
  "mobile_e164": "+61412345678"
}
```

| Field | Type | Optional | Validation |
|-------|------|----------|------------|
| `mobile_e164` | string | Yes | E.164 format |

#### Response

**200 OK:** (returns updated account, same schema as GET)

#### Errors

| Status | Code | Description |
|--------|------|-------------|
| `400` | — | Invalid JSON body |
| `401` | — | Unauthorized (no active session) |
| `422` | — | Validation error (E.164 format) |

#### Curl Example

```bash
curl -X PUT http://localhost:3000/api/account/me \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"mobile_e164": "+61412345678"}'
```

---

### GET /account/lga-bundles

**Get user's selected LGA bundles.**

Retrieve the authenticated user's selected LGA bundle IDs.

**Wedge FR-020:** Enable self-serve LGA bundle customization.

#### Request

No request body.

#### Response

**200 OK:**

```json
{
  "bundle_ids": [
    "sydney-inner-west",
    "sydney-northern-beaches",
    "sydney-western-suburbs"
  ]
}
```

#### Errors

| Status | Code | Description |
|--------|------|-------------|
| `401` | — | Unauthorized (no active session) |
| `404` | — | Account not found |

#### Curl Example

```bash
curl -X GET http://localhost:3000/api/account/lga-bundles \
  -b cookies.txt
```

---

### PUT /account/lga-bundles

**Update user's selected LGA bundles.**

Update the authenticated user's selected LGA bundles. The digest will be filtered to only include DAs from selected LGAs.

#### Request

```json
{
  "bundle_ids": ["sydney-inner-west", "sydney-northern-beaches"]
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `bundle_ids` | array of strings | Yes | At least one bundle ID |

#### Response

**200 OK:** (returns updated account)

#### Errors

| Status | Code | Description |
|--------|------|-------------|
| `400` | — | Invalid JSON body |
| `401` | — | Unauthorized (no active session) |
| `422` | — | Validation error (empty array, invalid format) |

#### Curl Example

```bash
curl -X PUT http://localhost:3000/api/account/lga-bundles \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "bundle_ids": ["sydney-inner-west", "sydney-northern-beaches"]
  }'
```

---

### GET /account/saved-query

**Get user's saved search query.**

Retrieve the authenticated user's saved search query text. The embedding is stored server-side.

**Wedge FR-025:** Enable personalised relevance scoring via saved query.

#### Request

No request body.

#### Response

**200 OK:**

```json
{
  "saved_query_text": "Residential roof repairs and reroof work in Sydney"
}
```

#### Errors

| Status | Code | Description |
|--------|------|-------------|
| `401` | — | Unauthorized (no active session) |

#### Curl Example

```bash
curl -X GET http://localhost:3000/api/account/saved-query \
  -b cookies.txt
```

---

### PUT /account/saved-query

**Update user's saved search query.**

Update the authenticated user's saved search query. The query is re-embedded server-side using OpenAI text-embedding-3-small.

#### Request

```json
{
  "saved_query_text": "Residential roof repairs and reroof work in Sydney"
}
```

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `saved_query_text` | string | Yes | 1–500 chars |

#### Response

**200 OK:**

```json
{
  "saved_query_text": "Residential roof repairs and reroof work in Sydney"
}
```

#### Errors

| Status | Code | Description |
|--------|------|-------------|
| `400` | — | Invalid JSON body |
| `401` | — | Unauthorized (no active session) |
| `422` | — | Validation error (empty, > 500 chars) |

#### Curl Example

```bash
curl -X PUT http://localhost:3000/api/account/saved-query \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"saved_query_text": "Residential roof repairs and reroof work in Sydney"}'
```

---

### POST /account/sms-opt-in

**Opt in to SMS digests.**

Opt the authenticated user in to SMS digest delivery.

**Wedge FR-022:** Enable user SMS preferences.

#### Request

No request body required.

#### Response

**200 OK:** (returns updated account)

#### Errors

| Status | Code | Description |
|--------|------|-------------|
| `401` | — | Unauthorized (no active session) |
| `422` | — | Validation error |

#### Curl Example

```bash
curl -X POST http://localhost:3000/api/account/sms-opt-in \
  -b cookies.txt
```

---

### POST /account/sms-opt-out

**Opt out of SMS digests.**

Opt the authenticated user out of SMS digest delivery.

#### Request

No request body required.

#### Response

**200 OK:** (returns updated account)

#### Errors

| Status | Code | Description |
|--------|------|-------------|
| `401` | — | Unauthorized (no active session) |

#### Curl Example

```bash
curl -X POST http://localhost:3000/api/account/sms-opt-out \
  -b cookies.txt
```

---

### POST /account/storm-brief

**Opt in / out of mid-week storm briefs.**

Set the authenticated user's storm-brief preference. When opted in and
`STORM_BRIEF_ENABLED` is on, the user receives a mid-week brief derived from
BOM severe-weather warnings (see `POST /api/cron/storm-brief`).

**Wedge FR-020:** Enable self-serve delivery preferences.

#### Request

```json
{
  "optIn": true
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `optIn` | boolean | Yes | `true` = receive storm briefs; `false` = opt out |

#### Response

**200 OK:** (returns updated account, same schema as `GET /account/me`)

#### Errors

| Status | Code | Description |
|--------|------|-------------|
| `400` | — | Invalid JSON body |
| `401` | — | Unauthorized (no active session) |
| `422` | — | Validation error (`optIn` not a boolean) |

#### Curl Example

```bash
curl -X POST http://localhost:3000/api/account/storm-brief \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"optIn": true}'
```

---

### GET /account/export

**Export account data (Privacy Act).**

Export all authenticated user's account data as JSON. Supports Privacy Act 1988 (Cth) data subject access requests.

**Wedge FR-031:** Enable Privacy Act data export.

#### Request

No request body.

#### Response

**200 OK** (file download):

```json
{
  "user": { ... },
  "digests": [ ... ],
  "feedback": [ ... ],
  "ai_cost_log": [ ... ]
}
```

The response includes a `Content-Disposition` header for file download:
```
Content-Disposition: attachment; filename="pi-au-data-export-<user_id>.json"
```

#### Errors

| Status | Code | Description |
|--------|------|-------------|
| `401` | — | Unauthorized (no active session) |

#### Curl Example

```bash
curl -X GET http://localhost:3000/api/account/export \
  -b cookies.txt \
  -o pi-au-data-export.json
```

---

### DELETE /account/delete

**Delete account (GDPR/Privacy Act erasure).**

Permanently delete the authenticated user's account and all associated data. Invalidates the current session and clears the session cookie.

**Wedge FR-032:** Enable Privacy Act right to erasure.

#### Request

No request body.

#### Response

**200 OK:**

```json
{
  "deleted": true
}
```

#### Errors

| Status | Code | Description |
|--------|------|-------------|
| `401` | — | Unauthorized (no active session) |

#### Curl Example

```bash
curl -X DELETE http://localhost:3000/api/account/delete \
  -b cookies.txt
```

---

## Module: Feedback

Feedback endpoints capture 👍/👎 on individual DAs. Feedback is used for personalised reranking after ≥200 labelled pairs.

| Method | Endpoint | Purpose | Wedge FR |
|--------|----------|---------|----------|
| `POST` | `/feedback` | Record portal feedback | FR-024 |
| `GET` | `/feedback/{token}` | Record email feedback (HMAC token) | FR-023 |

### POST /feedback

**Record thumbs feedback (authenticated portal).**

Record 👍/👎 feedback on a DA from the web portal. Requires active Lucia session.

**Wedge FR-024:** Enable in-portal single-tap feedback.

#### Request

```json
{
  "da_id": "2025/123456",
  "feedback": "up"
}
```

| Field | Type | Required | Values | Notes |
|-------|------|----------|--------|-------|
| `da_id` | string | Yes | Any | DA identifier (council + lodgement number) |
| `feedback` | string | Yes | `up`, `down`, `remove` | `remove` deletes existing feedback |

#### Response

**200 OK:**

```json
{
  "ok": true
}
```

#### Errors

| Status | Code | Description |
|--------|------|-------------|
| `400` | — | Invalid JSON body |
| `401` | — | Unauthorized (no active session) |
| `422` | — | Validation error (da_id or feedback format) |

#### Rate Limiting

- **Limit:** 100 requests per hour per user

#### Curl Example

```bash
curl -X POST http://localhost:3000/api/feedback \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "da_id": "2025/123456",
    "feedback": "up"
  }'
```

---

### GET /feedback/{token}

**Record thumbs feedback from email link (HMAC token).**

Record 👍/👎 feedback from email link tap. Token is HMAC-signed and valid for 7 days.

**On success:** records feedback and redirects to portal with toast.  
**On failure:** returns plain HTML "link expired — view in portal".

**Wedge FR-023:** Enable email link feedback capture.

#### Request

No request body. Token is in the URL path.

**Example URL:**
```
https://pi-au.example.com/api/feedback/eyJkYXJkLWlkIjoi...
```

#### Response

**302 Found** (redirect on success):

```
Location: https://pi-au.example.com/portal?feedback=recorded&daId=2025%2F123456&vote=up
```

**400 Bad Request** (malformed token):

```html
<!DOCTYPE html>
<html>
<body>
  <p>Invalid feedback link. <a href="https://pi-au.example.com/portal">View your digests in the portal</a>.</p>
</body>
</html>
```

**410 Gone** (expired token, > 7 days):

```html
<!DOCTYPE html>
<html>
<body>
  <p>This feedback link has expired. <a href="https://pi-au.example.com/portal">View your digests in the portal</a>.</p>
</body>
</html>
```

#### Token Format

HMAC-signed token containing:
- `userId` (UUID)
- `daId` (string)
- `vote` (1 for up, 0 for down)
- `createdAt` (7-day expiry)

Signature verified using a secret key (not exposed to clients).

#### Curl Example

```bash
# User taps link in email (automatic redirect)
curl -X GET "https://pi-au.example.com/api/feedback/eyJkYXJkLWlkIjoi..." \
  -L -o /dev/null
```

---

## Module: Billing

Billing endpoints integrate with Stripe AU. All endpoints require active Lucia session.

**Stripe Contract:**
- **Provider:** Stripe AU
- **Region:** Australia (AUD)
- **Plans:** Solo (AUD 199/mo), Team (AUD 499/mo, 3 seats)
- **Trial:** 14 days full access, no free tier
- **Tax:** GST handled by Stripe (no app-side logic)

| Method | Endpoint | Purpose | Wedge FR |
|--------|----------|---------|----------|
| `POST` | `/billing/checkout` | Create Stripe checkout session | FR-018 |
| `POST` | `/billing/portal` | Redirect to Stripe Billing Portal | FR-019 |
| `DELETE` | `/billing/subscription` | Cancel subscription at period end | FR-021 |

### POST /billing/checkout

**Create Stripe checkout session.**

Create a Stripe Checkout session for a billing plan. Returns a Stripe Checkout URL.

**Wedge FR-018:** Enable Stripe AU billing with GST.

#### Request

```json
{
  "plan": "solo"
}
```

| Field | Type | Required | Values | Notes |
|-------|------|----------|--------|-------|
| `plan` | string | Yes | `solo`, `team` | Solo = AUD 199/mo; Team = AUD 499/mo (3 seats) |

#### Response

**200 OK:**

```json
{
  "checkout_url": "https://checkout.stripe.com/pay/cs_test_abc123..."
}
```

#### Errors

| Status | Code | Description |
|--------|------|-------------|
| `400` | — | Invalid JSON body |
| `401` | — | Unauthorized (no active session) |
| `422` | — | Validation error (invalid plan) |

#### Curl Example

```bash
curl -X POST http://localhost:3000/api/billing/checkout \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"plan": "solo"}'
```

---

### POST /billing/portal

**Redirect to Stripe Billing Portal.**

Create a Stripe Billing Portal session URL. Allows users to manage subscriptions, cancel, upgrade/downgrade.

**Wedge FR-019:** Enable Stripe Billing Portal access.

#### Request

No request body required.

#### Response

**200 OK:**

```json
{
  "portal_url": "https://billing.stripe.com/a/abc123..."
}
```

#### Errors

| Status | Code | Description |
|--------|------|-------------|
| `401` | — | Unauthorized (no active session) |
| `404` | — | No billing account found for this user |

#### Curl Example

```bash
curl -X POST http://localhost:3000/api/billing/portal \
  -b cookies.txt
```

---

### DELETE /billing/subscription

**Cancel subscription at period end.**

Sets `cancel_at_period_end = true` on the user's active Stripe subscription. Access continues until
the current period ends; no immediate revocation.

**Wedge FR-021:** Enable in-app subscription cancellation.

#### Request

Optional JSON body:

```json
{
  "reason": "Too expensive"
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `reason` | string | No | Max 500 chars. V1: logged only, not persisted. |

#### Response

**200 OK:**

```json
{
  "ok": true,
  "accessUntil": "2026-05-28T23:59:59.000Z"
}
```

| Field | Type | Notes |
|-------|------|-------|
| `ok` | boolean | Always `true` on success |
| `accessUntil` | string | ISO 8601 — the `current_period_end` from Stripe |

#### Errors

| Status | Code | Description |
|--------|------|-------------|
| `401` | — | Unauthorized (no active session) |
| `404` | — | No active subscription found |
| `500` | — | Stripe API error |

#### Curl Example

```bash
curl -X DELETE http://localhost:3000/api/billing/subscription \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"reason": "Too expensive"}'
```

---

## Module: Digests

Digest endpoints provide per-digest CSV export.

| Method | Endpoint | Purpose | Wedge FR |
|--------|----------|---------|----------|
| `GET` | `/export/digest/{id}.csv` | Download a digest's leads as CSV | FR-026 |

Digest **history** is not exposed as a JSON API. The web portal reads it
server-side via RSC loaders (`getDigestHistory` in
`src/modules/portal/loaders.ts`), so there is no `GET /digests` endpoint — the
route was removed as dead code (issue #96 A4). The only client-facing digest
endpoint is the CSV export below.

---

### GET /export/digest/{id}.csv

**Download a digest's leads as a CSV file (issue #22).**

Export the leads of a single digest owned by the authenticated user as a CSV
download. Buyer-expectation parity with competing DA lead products. The `.csv`
suffix is a cosmetic part of the dynamic path segment; it is stripped server-side
to resolve the digest id.

**Ownership:** a digest belonging to another user is simply not found (`404`) — no
existence leak.

**Requires active Lucia session.**

#### Request

No request body. The digest id is in the URL path.

**Example URL:**
```
https://pi-au.example.com/api/export/digest/digest_123.csv
```

#### Response

**200 OK** (file download):

```
Content-Type: text/csv; charset=utf-8
Content-Disposition: attachment; filename="pi-au-digest-2026-04-28.csv"
Cache-Control: private, no-store
```

The body is a CSV of the digest's ranked leads.

#### Errors

| Status | Code | Description |
|--------|------|-------------|
| `401` | — | Unauthorized (no active session) |
| `404` | — | Digest not found or not owned by this user |
| `429` | — | Rate limit: 30/hour per user (header: `Retry-After: <seconds>`) |

#### Rate Limiting

- **Limit:** 30 requests per hour per user (shared mutating-action limiter)

#### Curl Example

```bash
curl -X GET "http://localhost:3000/api/export/digest/digest_123.csv" \
  -b cookies.txt \
  -o digest.csv
```

---

## Module: Compliance

Unauthenticated, token-based compliance endpoints. No login and no fee are
required to honour them.

| Method | Endpoint | Purpose | Wedge FR |
|--------|----------|---------|----------|
| `GET` | `/unsubscribe/{token}` | One-click email opt-out (Spam Act) | FR-023 |

### GET /unsubscribe/{token}

**One-click email unsubscribe (Spam Act 2003).**

Honour a functional, no-login, no-fee unsubscribe from a link in any email
(digest, trial reminder, etc.). Uses the same HMAC token pattern as the email
feedback links — the token carries the `userId`, so **no session is required**.
On success it sets `User.emailOptIn = false`, which the digest and trial-reminder
send paths gate on. Idempotent: an already-deleted or already-opted-out user
still receives a friendly confirmation page.

**Wedge FR-023 / Spam Act 2003 (Cth):** Provide a working, unauthenticated opt-out.

#### Request

No request body. The HMAC token is in the URL path.

**Example URL:**
```
https://pi-au.example.com/api/unsubscribe/eyJ1c2VySWQiOiI...
```

#### Response

**200 OK** (HTML confirmation page):

```html
<!DOCTYPE html>
<html>
<body>
  <h1>You've been unsubscribed</h1>
  <p>You will no longer receive emails from ProjectIntelligence.
     <a href="https://pi-au.example.com/account">Manage preferences</a>.</p>
</body>
</html>
```

**400 Bad Request** (invalid or tampered token) returns an HTML page pointing the
user to their account settings. The endpoint never returns JSON.

#### Token Format

HMAC-signed token containing the `userId`. Signature verified with a secret key
(`UNSUBSCRIBE_SECRET`, not exposed to clients).

#### Curl Example

```bash
curl -X GET "https://pi-au.example.com/api/unsubscribe/eyJ1c2VySWQiOiI..."
```

---

## Module: Waitlist

Unauthenticated out-of-scope demand capture.

| Method | Endpoint | Purpose | Wedge FR |
|--------|----------|---------|----------|
| `POST` | `/waitlist` | Register interest for an out-of-scope trade/region | FR-033 |

### POST /waitlist

**Register out-of-scope demand (issue #25).**

Capture demand for trades or regions not yet covered. Unauthenticated: the
endpoint only ever writes to `waitlist_entries`. Honeypot-guarded (a filled hidden
field returns a success-shaped response but never touches the DB) and idempotent
on `(email, trade, region)`. No confirmation email is sent (Spam Act 2003 — v1
stores intent only).

**Wedge FR-033:** Measure demand outside the current wedge.

#### Request

```json
{
  "email": "eli@roofing-co.com.au",
  "trade": "plumbing",
  "region": "brisbane"
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `email` | string | Yes | Normalized to lowercase + trim |
| `trade` | string | Yes | Requested trade |
| `region` | string | Yes | Requested region |

(An additional hidden honeypot field may be present in the form payload; if filled, the submission is silently discarded.)

#### Response

**201 Created** (new entry) or **200 OK** (duplicate — idempotent):

```json
{
  "ok": true
}
```

#### Errors

| Status | Code | Description |
|--------|------|-------------|
| `400` | — | Invalid JSON body |
| `422` | — | Validation error (missing/invalid fields) |
| `429` | — | Rate limit: 5/min per IP (header: `Retry-After: <seconds>`) |

#### Rate Limiting

- **Limit:** 5 requests per minute per IP (same limiter as signup)

#### Curl Example

```bash
curl -X POST http://localhost:3000/api/waitlist \
  -H "Content-Type: application/json" \
  -d '{"email": "eli@roofing-co.com.au", "trade": "plumbing", "region": "brisbane"}'
```

---

## Module: Webhooks

**Internal — not for client consumption.** These endpoints are called by Stripe and Twilio.

### POST /api/webhooks/stripe

**Stripe webhook receiver.**

Idempotent handler for Stripe events (subscription created/updated/deleted, invoice payment succeeded/failed).

**Stripe calls this endpoint** via `POST /api/webhooks/stripe` with a `Stripe-Signature` header.

**Wedge FR-030:** Handle Stripe subscription state changes.

#### Security

- **Signature validation:** HMAC-SHA256 using `STRIPE_WEBHOOK_SECRET`
- **Idempotency:** Events are keyed on `event.id` (in-memory cache at preview tier; DB table at launch)

#### Supported Events

| Event Type | Action |
|------------|--------|
| `customer.subscription.created` | Update `user.subscriptionStatus = "active"` |
| `customer.subscription.updated` | Update subscription status and access period |
| `customer.subscription.deleted` | Update `user.subscriptionStatus = "cancelled"` |
| `invoice.payment_failed` | Update `user.subscriptionStatus = "past_due"` |
| `invoice.payment_succeeded` | Update `user.subscriptionStatus = "active"` if was `past_due` |

#### Response

**200 OK:**

```json
{
  "received": true
}
```

#### Errors

| Status | Code | Description |
|--------|------|-------------|
| `400` | — | Missing `Stripe-Signature` header or invalid signature |
| `500` | — | Handler error (Stripe will retry) |

---

### POST /api/webhooks/twilio

**Twilio SMS webhook receiver.**

Idempotent handler for Twilio SMS replies. Processes STOP keyword → sets `user.smsOptIn = false`.

**Twilio calls this endpoint** via `POST /api/webhooks/twilio` with an `X-Twilio-Signature` header.

**Wedge FR-029:** Handle Twilio SMS opt-out via STOP keyword.

#### Security

- **Signature validation:** HMAC-SHA1 using `TWILIO_AUTH_TOKEN`
- **Compliance:** Twilio handles STOP regulatory messaging (carrier-level opt-out)

#### Request Body

URL-encoded form data:

```
Body=STOP&From=%2B61412345678
```

| Field | Type | Notes |
|-------|------|-------|
| `Body` | string | SMS message text (case-insensitive) |
| `From` | string | Sender phone number (E.164 format) |

#### Recognized Stop Keywords

- `STOP`
- `STOPALL`
- `UNSUBSCRIBE`
- `CANCEL`
- `END`
- `QUIT`

#### Response

**200 OK** (returns empty TwiML):

```xml
<Response/>
```

#### Errors

| Status | Code | Description |
|--------|------|-------------|
| `403` | — | Invalid Twilio signature |

---

## Module: Cron

**Internal — not for client consumption.** These endpoints are called by Vercel Cron.

### GET /api/cron/digest

**Sunday digest generation (Vercel Cron).**

Vercel Cron handler — fired by **two** Sunday ticks (`vercel.json`):

- **07:00 UTC (17:00 AEST)** — primary tick.
- **10:00 UTC (20:00 AEST)** — idempotent-resume retry tick (issue #12). Same
  handler, same auth. `runDigestCron()` resumes the same week's run and only
  re-processes users the primary left unserved; it is a no-op after a fully
  successful primary run (see `resumed`/`unserved` below).

Generates and dispatches weekly digests for all active users:
1. Iterate active subscribers
2. Run relevance pipeline (rule → embedding → LLM rerank)
3. Assemble 5–15-card digest with "why this matched" summaries
4. Dispatch email (Resend) and SMS (Twilio top-3)
5. Log cost and compute precision recap stat

**Not for client consumption.** Vercel Cron calls this endpoint.

**Wedge FR-009:** Generate and send Sunday digests.

#### Security

- **Authentication:** Bearer token in `Authorization` header (value: `Bearer ${CRON_SECRET}`)
- **Source:** Vercel Cron, time-based trigger

#### Request

No request body (Vercel Cron issues a GET with the auth header only).

#### Response

**200 OK:**

```json
{
  "resumed": false,
  "users_processed": 42,
  "sent": 40,
  "failed": 2,
  "unserved": 0,
  "run_id": "cron_123e4567-e89b-12d3-a456-426614174000",
  "duration_ms": 45000
}
```

| Field | Type | Notes |
|-------|------|-------|
| `resumed` | boolean | `true` when this invocation resumed an existing week's run (the 10:00 UTC retry tick); `false` on the primary tick |
| `users_processed` | integer | Users this invocation processed (pending users only — excludes those an earlier tick already completed) |
| `sent` | integer | Successful email+SMS sends |
| `failed` | integer | Email/SMS delivery failures |
| `unserved` | integer | Active users still not served after this invocation; `> 0` on the primary tick means the retry tick has work to do |
| `run_id` | uuid | Unique cron run identifier (for logs) |
| `duration_ms` | integer | Total cron execution time |

#### Errors

| Status | Code | Description |
|--------|------|-------------|
| `401` | — | Invalid or missing `CRON_SECRET` |
| `500` | — | Cron execution error |

---

### GET /api/cron/ingest

**Nightly DA ingestion (Vercel Cron).**

Vercel Cron handler — **daily 13:00 UTC (23:00 AEST)**.

Nightly ETL of newly lodged DAs from NSW Planning Portal API and council aggregator feeds (15 LGAs):
1. Fetch new DAs from each LGA feed
2. Normalise and validate
3. Upsert into `development_applications` table
4. Log ingestion results and drift detection
5. Link the day's Construction Certificates (PCCs) to their DAs (issue #13). Runs after the DA upsert so the referenced DAs already exist. No-op (returns `skipped: true`, all counts `0`) unless **both** `PCC_INGEST_ENABLED` and `NSW_PLANNING_API_KEY` are set — inert until the feed is switched on. A CC with no matching DA is counted as `unmatched` and skipped, not created as a new DA.

**Not for client consumption.** Vercel Cron calls this endpoint.

#### Security

- **Authentication:** Bearer token in `Authorization` header
- **Source:** Vercel Cron, time-based trigger

#### Request

No request body.

#### Response

**200 OK:**

```json
{
  "ingested": 142,
  "failed": 3,
  "perCouncil": {
    "sydney": { "ingested": 50, "failed": 1 },
    "randwick": { "ingested": 45, "failed": 1 },
    "manly": { "ingested": 47, "failed": 1 }
  },
  "pcc": { "linked": 0, "unmatched": 0, "skipped": true }
}
```

| Field | Type | Notes |
|-------|------|-------|
| `ingested` | integer | Total new DAs ingested across all LGAs |
| `failed` | integer | Total DAs that failed to ingest |
| `perCouncil` | object | Results keyed by council (LGA) |
| `pcc` | object | CC→DA linking result (issue #13): `{ linked, unmatched, skipped }` |
| `pcc.linked` | integer | CCs successfully linked to an existing DA |
| `pcc.unmatched` | integer | CCs with no matching DA in our store (skipped, not created) |
| `pcc.skipped` | boolean | `true` when the PCC step no-oped (`PCC_INGEST_ENABLED` / `NSW_PLANNING_API_KEY` unset) |

#### Errors

| Status | Code | Description |
|--------|------|-------------|
| `401` | — | Invalid or missing `CRON_SECRET` |
| `500` | — | Cron execution error |

---

### GET /api/cron/trial-reminder

**Trial-ending reminder (Vercel Cron).**

Vercel Cron handler — **daily 06:00 UTC (16:00 AEST)**.

Emails users on day 26 of the 28-day trial (2 days before the card is charged).
`trialReminderSentAt` dedupes so each user is reminded at most once. Skips users
who have unsubscribed (`emailOptIn = false`, Spam Act 2003). Each reminder email
carries a per-user unsubscribe link (`GET /api/unsubscribe/{token}`).

**Not for client consumption.** Vercel Cron calls this endpoint.

**Wedge FR-028:** Remind trialists before conversion.

#### Security

- **Authentication:** Bearer token in `Authorization` header (value: `Bearer ${CRON_SECRET}`)
- **Source:** Vercel Cron, time-based trigger

#### Request

No request body.

#### Response

**200 OK:**

```json
{
  "reminded": 12
}
```

| Field | Type | Notes |
|-------|------|-------|
| `reminded` | integer | Number of reminder emails successfully sent this run |

#### Errors

| Status | Code | Description |
|--------|------|-------------|
| `401` | — | Invalid or missing `CRON_SECRET` |

---

### GET /api/cron/storm-brief

**Mid-week storm brief (Vercel Cron).**

Vercel Cron handler — **every 3 hours (`0 */3 * * *` UTC)**.

Polls BOM severe-weather warnings and dispatches a mid-week storm brief to
opted-in users (`POST /account/storm-brief`). A `StormBrief` unique constraint
dedupes across the 3-hourly ticks. No-op unless `STORM_BRIEF_ENABLED` is on
(default off until dogfooded).

**Not for client consumption.** Vercel Cron calls this endpoint.

**Wedge FR-020:** Deliver time-sensitive storm-driven leads.

#### Security

- **Authentication:** Bearer token in `Authorization` header (value: `Bearer ${CRON_SECRET}`)
- **Source:** Vercel Cron, time-based trigger

#### Request

No request body.

#### Response

**200 OK:** (shape returned by the storm-brief cron runner; empty/no-op when the feature flag is off)

#### Errors

| Status | Code | Description |
|--------|------|-------------|
| `401` | — | Invalid or missing `CRON_SECRET` |
| `500` | — | Cron execution error |

---

## Module: Short URLs

### GET /s/{slug}

**URL shortener redirect.**

Self-hosted URL shortener for SMS links. No third-party shortener; slugs are stored in Postgres.

**Wedge FR-011:** Enable self-hosted URL shortening.

#### Request

No request body. Slug is in the URL path.

**Example:**
```
https://pi-au.example.com/api/s/abc123def456
```

#### Response

**302 Found:**

```
Location: https://portal.pi-au.example.com/feedback?daId=2025%2F123456&token=...
```

#### Errors

| Status | Code | Description |
|--------|------|-------------|
| `404` | — | Short URL not found |

#### Curl Example

```bash
curl -X GET http://localhost:3000/api/s/abc123def456 \
  -L
```

---

## Wedge Coverage Matrix

| FR ID | Wedge Requirement | Implementing Endpoint(s) | Status |
|-------|-------------------|--------------------------|--------|
| FR-001 | Self-serve signup | `POST /auth/signup` | ✅ Implemented |
| FR-002 | User authentication | `POST /auth/login`, `GET /auth/me` | ✅ Implemented |
| FR-003 | User logout | `POST /auth/logout` | ✅ Implemented |
| FR-004 | Email verification | `POST /auth/verify-email`, `POST /auth/verify-email/resend`, `POST /auth/verify-email/change-email` | ✅ Implemented |
| FR-005 | Password reset | `POST /auth/password-reset/request`, `POST /auth/password-reset/confirm` | ✅ Implemented |
| FR-009 | Weekly digest | `GET /cron/digest` | ✅ Implemented |
| FR-011 | SMS link shortening | `GET /s/{slug}` | ✅ Implemented |
| FR-017 | Account management | `GET/PUT /account/me` | ✅ Implemented |
| FR-018 | Subscription checkout | `POST /billing/checkout` | ✅ Implemented |
| FR-019 | Billing portal | `POST /billing/portal` | ✅ Implemented |
| FR-020 | LGA selection & storm briefs | `GET/PUT /account/lga-bundles`, `POST /account/storm-brief`, `GET /cron/storm-brief` | ✅ Implemented |
| FR-022 | SMS preferences | `POST /account/sms-opt-in`, `POST /account/sms-opt-out` | ✅ Implemented |
| FR-023 | Email feedback & unsubscribe | `GET /feedback/{token}`, `GET /unsubscribe/{token}` | ✅ Implemented |
| FR-024 | Portal feedback | `POST /feedback` | ✅ Implemented |
| FR-025 | Saved query | `GET/PUT /account/saved-query` | ✅ Implemented |
| FR-026 | Digest history & export | `GET /digests`, `GET /export/digest/{id}.csv` | ✅ Implemented |
| FR-028 | Trial reminder | `GET /cron/trial-reminder` | ✅ Implemented |
| FR-029 | SMS STOP handling | `POST /api/webhooks/twilio` | ✅ Implemented |
| FR-030 | Stripe webhooks | `POST /api/webhooks/stripe` | ✅ Implemented |
| FR-031 | Data export | `GET /account/export` | ✅ Implemented |
| FR-032 | Account deletion | `DELETE /account/delete` | ✅ Implemented |
| FR-033 | Out-of-scope demand capture | `POST /waitlist` | ✅ Implemented |

---

## Security Policy Summary

| Endpoint Category | Auth Method | Notes |
|-------------------|-------------|-------|
| Auth routes (signup, login, logout, verify, reset) | Lucia session (cookie) or None | Session cookie set on signup/login; session required for verify-email |
| Account routes | Lucia session (cookie) | Session cookie required for all |
| Feedback routes | Lucia session (cookie) OR HMAC token | Portal: session cookie; Email: HMAC-signed token (7-day expiry) |
| Compliance routes (unsubscribe) | HMAC token | Unauthenticated; HMAC-signed token carries `userId` (Spam Act one-click opt-out) |
| Billing routes | Lucia session (cookie) | Session cookie required for checkout and billing portal |
| Digest routes (incl. CSV export) | Lucia session (cookie) | Session cookie required; export enforces per-user ownership (404 on non-owned id) |
| Waitlist routes | None | Public write; honeypot + per-IP rate limit; writes only to `waitlist_entries` |
| Webhook routes | Signature validation | Stripe: `Stripe-Signature` header (HMAC-SHA256); Twilio: `X-Twilio-Signature` header (HMAC-SHA1) |
| Cron routes | Bearer token | `Authorization: Bearer ${CRON_SECRET}` from GCP Secret Manager |
| Short URL routes | None | Public redirect; no authentication |

---

## Rate Limiting

| Endpoint | Limit | Window | Notes |
|----------|-------|--------|-------|
| `POST /auth/signup` | 5 | per minute per IP | Prevents brute-force registration |
| `POST /auth/login` | 5 | per minute per IP | Prevents brute-force login |
| `POST /auth/verify-email` | 10 | per hour per user | Prevents OTP brute-force |
| `POST /auth/verify-email/resend` | 1 | per minute per user | Prevents OTP spam |
| `POST /auth/verify-email/change-email` | 5 | per hour per account | Prevents email-bombing arbitrary addresses |
| `POST /auth/password-reset/request` | 5 | per minute per IP | Prevents enumeration attacks |
| `POST /feedback` | 100 | per hour per user | Portal feedback rate limit |
| `GET /export/digest/{id}.csv` | 30 | per hour per user | Caps scripted bulk history pulls |
| `POST /waitlist` | 5 | per minute per IP | Same limiter as signup |

---

## Error Response Format

All error responses follow this schema:

```json
{
  "error": "Human-readable error message"
}
```

**Validation errors** include field-level details:

```json
{
  "error": "Validation failed.",
  "issues": {
    "email": ["Invalid email address."],
    "password": ["Password must be at least 12 characters."]
  }
}
```

---

## Tech Stack Reference

- **Framework:** Next.js 15 (App Router)
- **API Validator:** Zod 3 (TypeScript-first, runtime validation)
- **Authentication:** Lucia (session-based, argon2id hashing)
- **Database:** PostgreSQL 16 + pgvector 0.7 (Prisma 5 ORM, Prisma Accelerate pooler)
- **Email:** Resend + React Email
- **SMS:** Twilio
- **Payments:** Stripe AU (AUD currency, GST)
- **Logging:** Pino
- **Error Tracking:** Sentry
- **Deployment:** Vercel (Next.js native)
- **Cron:** Vercel Cron (HTTP handlers with Bearer auth)

---

## API Specification Files

- **OpenAPI 3.1 Spec:** `openapi.yaml` (project root)
- **API Reference (this file):** `docs/07-api-reference.md`

