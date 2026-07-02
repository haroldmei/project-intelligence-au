#!/usr/bin/env bash
# ensure-test-db.sh — provision the dedicated test Postgres the backend vitest suite needs.
#
# SOURCED by quality-gates.sh (gate_unit). Exports TEST_DATABASE_URL on success.
# The backend suite (__tests__/setup-test-db.ts) TRUNCATEs every table between tests and
# falls back to DATABASE_URL when TEST_DATABASE_URL is unset — so the gate must NEVER let
# it run against a real database. This script gives it a safe target:
#
#   • TEST_DATABASE_URL already set  → trust it (CI / operator override), do nothing else.
#   • docker available               → start (or reuse) the `pi-test-pg` container
#                                      (pgvector/pgvector:pg16 — schema needs pgvector+citext),
#                                      wait for readiness, `prisma db push` the CURRENT
#                                      worktree's schema, export TEST_DATABASE_URL.
#   • docker unavailable             → leave TEST_DATABASE_URL unset; the caller skips the
#                                      backend suite (fail-safe, never destructive).
#
# A flock (held for the life of the sourcing process) serializes concurrent gate runs
# against the shared container — truncate-between-tests means runs must not interleave.
# All knobs are env-overridable for tests: PI_TEST_PG_CONTAINER / _PORT / _IMAGE.

PI_TEST_PG_CONTAINER="${PI_TEST_PG_CONTAINER:-pi-test-pg}"
PI_TEST_PG_PORT="${PI_TEST_PG_PORT:-55432}"
PI_TEST_PG_IMAGE="${PI_TEST_PG_IMAGE:-pgvector/pgvector:pg16}"
PI_TEST_PG_PASSWORD="${PI_TEST_PG_PASSWORD:-pi_test}"
PI_TEST_DB_LOCK="${PI_TEST_DB_LOCK:-/tmp/pi-test-db.lock}"

_etdb_log() { printf 'ensure-test-db: %s\n' "$*"; }

if [ -n "${TEST_DATABASE_URL:-}" ]; then
  _etdb_log "TEST_DATABASE_URL already set — using it as-is"
elif ! docker info >/dev/null 2>&1; then
  _etdb_log "docker unavailable — backend suite will be skipped (never falls back to DATABASE_URL)"
else
  # Serialize concurrent gate runs on the shared test DB (fd 8 held until the caller exits).
  if command -v flock >/dev/null 2>&1; then
    exec 8>"$PI_TEST_DB_LOCK"
    _etdb_log "acquiring test-db lock ($PI_TEST_DB_LOCK)…"
    flock -w 1800 8 || _etdb_log "WARN: lock wait timed out — proceeding anyway"
  fi

  if ! docker inspect -f '{{.State.Running}}' "$PI_TEST_PG_CONTAINER" 2>/dev/null | grep -q true; then
    docker start "$PI_TEST_PG_CONTAINER" >/dev/null 2>&1 \
      || docker run -d --name "$PI_TEST_PG_CONTAINER" \
           -e POSTGRES_PASSWORD="$PI_TEST_PG_PASSWORD" -e POSTGRES_DB=pi_test \
           -p "${PI_TEST_PG_PORT}:5432" "$PI_TEST_PG_IMAGE" >/dev/null 2>&1 \
      || { _etdb_log "could not start the ${PI_TEST_PG_CONTAINER} container"; }
  fi

  _etdb_ready=0
  for _ in $(seq 1 30); do
    if docker exec "$PI_TEST_PG_CONTAINER" pg_isready -U postgres >/dev/null 2>&1; then _etdb_ready=1; break; fi
    sleep 1
  done

  if [ "$_etdb_ready" = 1 ]; then
    _etdb_url="postgresql://postgres:${PI_TEST_PG_PASSWORD}@localhost:${PI_TEST_PG_PORT}/pi_test"
    # Push THIS checkout's schema (a PR that changes prisma/schema.prisma is tested against
    # its own schema). --accept-data-loss is fine: this database holds only test data.
    if DATABASE_URL="$_etdb_url" pnpm exec prisma db push --skip-generate --accept-data-loss >/dev/null 2>&1; then
      export TEST_DATABASE_URL="$_etdb_url"
      _etdb_log "ready — TEST_DATABASE_URL exported (container ${PI_TEST_PG_CONTAINER}, port ${PI_TEST_PG_PORT})"
    else
      _etdb_log "prisma db push failed — backend suite will be skipped"
    fi
  else
    _etdb_log "postgres did not become ready — backend suite will be skipped"
  fi
fi
