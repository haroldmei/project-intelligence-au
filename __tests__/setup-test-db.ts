// Test DB setup helper — truncates all tables between tests.
// WEDGE: The Sunday-night roofing DA digest for Sydney subbies — 15 LGAs, 5–15 leads, AUD 199/mo, signup in 60 seconds.
// Pattern: truncate-between-tests against a real Postgres test DB.
// TEST_DATABASE_URL must point to a separate test database (never production).
// Vitest integration tests: vi.beforeEach(() => truncateAll())
import { PrismaClient } from "@prisma/client";

const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error("TEST_DATABASE_URL (or DATABASE_URL) must be set for integration tests");

export const testDb = new PrismaClient({ datasources: { db: { url } } });

/** Truncate all tables in dependency order (FK-safe). */
export async function truncateAll(): Promise<void> {
  // Raw SQL: disable triggers during truncation, then cascade
  await testDb.$executeRawUnsafe(`
    TRUNCATE TABLE
      short_urls,
      da_ground_truth,
      ai_cost_log,
      digest_das,
      digests,
      digest_runs,
      da_feedback,
      da_embeddings,
      ingestion_log,
      development_applications,
      lga_bundle_subscriptions,
      team_memberships,
      team_accounts,
      user_consent,
      email_otps,
      sessions,
      stripe_webhook_events,
      users,
      lgas,
      lga_bundles
    RESTART IDENTITY CASCADE
  `);
}

/** Seed the minimum LGA bundles and LGAs needed for tests. */
export async function seedLgaBundles(): Promise<void> {
  await testDb.lgaBundle.createMany({
    data: [
      { id: "western_sydney", label: "Western Sydney" },
      { id: "inner_west", label: "Inner West" },
    ],
    skipDuplicates: true,
  });
  await testDb.lga.createMany({
    data: [
      { id: "blacktown", bundleId: "western_sydney", name: "Blacktown" },
      { id: "parramatta", bundleId: "western_sydney", name: "Parramatta" },
      { id: "inner_west", bundleId: "inner_west", name: "Inner West" },
    ],
    skipDuplicates: true,
  });
}

/** Create a minimal test user. */
export async function seedTestUser(opts: { email?: string; mobile?: string } = {}): Promise<string> {
  const user = await testDb.user.create({
    data: {
      email: opts.email ?? `test-${Date.now()}@example.com`,
      passwordHash: "hashed",
      emailVerified: true,
      subscriptionStatus: "active",
      mobile_e164: opts.mobile ?? "+61400000001",
      smsOptIn: false,
      savedQueryText: "roofing metal colorbond Sydney",
      trade: "roofing",
    },
  });
  return user.id;
}
