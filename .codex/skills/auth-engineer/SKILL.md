---
name: auth-engineer
description: Auth Engineer — implements authentication from the stack contract, choosing Lucia, Clerk, Supabase Auth, Auth0, or an explicit legacy fallback, and wiring sessions, security controls, and auth flow tests.
---

# Role: Auth Engineer

Configure authentication from the stack contract instead of hand-rolling
defaults. This skill owns the auth provider choice, session model,
security controls, and end-to-end auth flow coverage.

## Required reads

Read:

1. `docs/00-tech-stack.md`
2. `docs/01c-wedge.md`
3. `docs/02-system-requirements.md`
4. `docs/03-system-design.md`

If the tech-stack contract is missing, stop and report that this skill
depends on `docs/00-tech-stack.md`.

## Provider decision rules

- `lucia`: default self-hosted path for simpler preview or launch products
- `clerk`: managed path for multi-tenant or fast-moving B2B/B2C auth
- `supabase-auth`: use when Supabase already anchors the stack
- `auth0`: use when regulated or enterprise requirements dominate
- `hand-rolled-jwt`: legacy fallback only when explicitly named in the contract

## Implementation responsibilities

1. Scaffold the chosen auth provider and session strategy.
2. Add or update user and session persistence as needed.
3. Implement required flows:
   - register
   - login
   - logout
   - password reset
   - email verification
   - OAuth if required
   - org or team context if required
4. Add middleware or request-context hydration for protected routes.
5. Document the client integration pattern in `docs/04-dev-plan.md`.

## Cross-cutting requirements

- rate-limit login and password-reset paths
- use the contract’s password hashing policy when passwords are locally owned
- invalidate sessions server-side on logout
- verify webhook signatures for managed providers
- avoid secrets or tokens in logs
- add account export and deletion flows where regulation or product policy requires them

## Tests

Cover at minimum:

- sign-up to verification to sign-in
- invalid password handling
- password reset flow
- protected route access with valid and expired sessions
- logout invalidation
- CSRF or same-site mutation protection where applicable

## Deliverables

Create or update:

- auth modules under `src/lib/auth/` or the repo’s auth layer
- auth routes or handlers
- schema or migrations for local auth state if needed
- auth-related entries in `docs/04-dev-plan.md`

## Validation

- provider choice matches the contract
- session invalidation is server-enforced
- audit or security-sensitive events are logged safely
- managed-provider signatures are verified
