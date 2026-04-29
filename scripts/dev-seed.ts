// Demo data — for local dev and Vercel preview environments.
// Refuses to run when VERCEL_ENV === "production" (also gated on NODE_ENV
// as a belt-and-braces guard). Runs after `prisma db seed` in vercel-build,
// so reference bundles/LGAs are guaranteed to exist when this starts.
//
// What it does:
//   - Upsert eli@example.com / demo123! (argon2id, pre-verified, 14d trial)
//   - Replace eli's bundle subscriptions with Western Sydney + Inner West & City
//     (both bundles have LGAs we'll seed sample DAs for)
//   - Upsert ~14 sample DAs across eli's subscribed LGAs
//   - Upsert one DigestRun for last Sunday + one Digest for eli + 12 DigestDa rows
//
// Idempotent: re-running stabilises on the same final state.
//
// Local:    pnpm dev:seed
// Vercel:   runs automatically via vercel-build on dev/preview deploys

import argon2 from "argon2";
import { PrismaClient } from "@prisma/client";

const isProduction =
  process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production";
const force = process.env.FORCE_DEV_SEED === "1";
if (isProduction && !force) {
  console.log(
    "[dev-seed] skipping — VERCEL_ENV/NODE_ENV is production. Set FORCE_DEV_SEED=1 to override.",
  );
  process.exit(0);
}

const db = new PrismaClient();

const DEMO_USER = {
  email: "eli@example.com",
  password: "demo123!",
  mobile: "+61400000000",
  savedQuery: "Roof replacement, Colorbond or tile, residential, $80k+",
  bundleSubscriptions: ["western_sydney", "inner_west_and_city"],
};

const SAMPLE_DAS: Array<{
  lgaId: string;
  daId: string;
  address: string;
  description: string;
  estimatedValue: number;
  applicantName: string;
}> = [
  // western_sydney
  { lgaId: "penrith", daId: "DA-2026/0011", address: "12 Acacia Ave, Penrith NSW 2750", description: "Demolition of existing tiled roof and installation of Colorbond metal deck roofing system, including new guttering and downpipes.", estimatedValue: 180000, applicantName: "Smith & Partners Architects" },
  { lgaId: "penrith", daId: "DA-2026/0024", address: "47 Mulgoa Rd, Penrith NSW 2750", description: "Re-roofing of strata building, replacement of concrete tiles with Colorbond Trimdek over new sarking.", estimatedValue: 320000, applicantName: "Westside Strata Mgmt" },
  { lgaId: "blacktown", daId: "DA-2026/0089", address: "8 Sunnyholt Rd, Blacktown NSW 2148", description: "Replacement of existing terracotta tile roof with Colorbond Surfmist, two-storey dwelling.", estimatedValue: 95000, applicantName: "Lin Family Trust" },
  { lgaId: "blacktown", daId: "DA-2026/0103", address: "22 Garfield Rd, Riverstone NSW 2765", description: "Light commercial re-roof, asbestos removal and Colorbond replacement, including box-gutter renewal.", estimatedValue: 240000, applicantName: "Riverstone Industrial P/L" },
  { lgaId: "parramatta", daId: "DA-2026/0147", address: "5 George St, Parramatta NSW 2150", description: "Membrane re-roofing of mixed-use building, including new gutters, downpipes and skylights.", estimatedValue: 410000, applicantName: "GS Holdings Pty Ltd" },
  { lgaId: "parramatta", daId: "DA-2026/0152", address: "16 Marsden St, Parramatta NSW 2150", description: "Existing dwelling — replace tile roof with Colorbond, retain existing battens.", estimatedValue: 110000, applicantName: "M Patel" },
  { lgaId: "the_hills", daId: "DA-2026/0078", address: "3 Showground Rd, Castle Hill NSW 2154", description: "Strata re-roof, 14 units, Colorbond Trimdek replacement plus solar prep penetrations.", estimatedValue: 380000, applicantName: "Castle Hill Owners Corp" },
  { lgaId: "the_hills", daId: "DA-2026/0080", address: "9 Old Northern Rd, Baulkham Hills NSW 2153", description: "Re-roof and gutter replacement, two-storey dwelling, like-for-like tile.", estimatedValue: 130000, applicantName: "B Ng" },
  { lgaId: "cumberland", daId: "DA-2026/0117", address: "62 Merrylands Rd, Merrylands NSW 2160", description: "Heritage tile re-roofing, like-for-like terracotta replacement, two-storey heritage residence.", estimatedValue: 165000, applicantName: "Merrylands Heritage Trust" },
  // inner_west_and_city
  { lgaId: "inner_west", daId: "DA-2026/0211", address: "33 Marrickville Rd, Marrickville NSW 2204", description: "Industrial re-roof, asbestos removal, replacement with insulated Colorbond panels.", estimatedValue: 460000, applicantName: "Marrickville Foods P/L" },
  { lgaId: "inner_west", daId: "DA-2026/0214", address: "8 Enmore Rd, Enmore NSW 2042", description: "Two-storey terrace re-roof, replacement of slate with Colorbond Surfmist.", estimatedValue: 115000, applicantName: "P Tran" },
  { lgaId: "canada_bay", daId: "DA-2026/0064", address: "12 Concord Rd, Concord NSW 2137", description: "Heritage residence re-roof, terracotta-tile like-for-like replacement.", estimatedValue: 195000, applicantName: "H Papadopoulos" },
  { lgaId: "burwood", daId: "DA-2026/0301", address: "21 Burwood Rd, Burwood NSW 2134", description: "Strata block re-roof, replacement of cement tiles with Colorbond.", estimatedValue: 215000, applicantName: "Burwood Strata Plan 8821" },
  { lgaId: "city_of_sydney", daId: "DA-2026/0455", address: "44 Cleveland St, Redfern NSW 2016", description: "Membrane re-roof of mixed-use commercial building.", estimatedValue: 285000, applicantName: "Redfern Holdings" },
];

function whyMatched(desc: string): string {
  if (/colorbond/i.test(desc)) return "Colorbond re-roof";
  if (/membrane/i.test(desc)) return "Membrane re-roof";
  if (/heritage|terracotta/i.test(desc)) return "Heritage tile renewal";
  if (/strata/i.test(desc)) return "Strata re-roof";
  return "Re-roof scope match";
}

async function ensureDemoUser() {
  const passwordHash = await argon2.hash(DEMO_USER.password, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
  const accessUntil = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

  const user = await db.user.upsert({
    where: { email: DEMO_USER.email },
    update: {
      passwordHash,
      emailVerified: true,
      subscriptionStatus: "trial",
      accessUntil,
      savedQueryText: DEMO_USER.savedQuery,
      mobile_e164: DEMO_USER.mobile,
      smsOptIn: false,
      trade: "roofing",
    },
    create: {
      email: DEMO_USER.email,
      passwordHash,
      emailVerified: true,
      subscriptionStatus: "trial",
      accessUntil,
      savedQueryText: DEMO_USER.savedQuery,
      mobile_e164: DEMO_USER.mobile,
      smsOptIn: false,
      trade: "roofing",
    },
  });

  // Replace subscriptions deterministically — guarantees demo digest hits real LGAs.
  await db.lgaBundleSubscription.deleteMany({ where: { userId: user.id } });
  for (const bundleId of DEMO_USER.bundleSubscriptions) {
    await db.lgaBundleSubscription.create({ data: { userId: user.id, bundleId } });
  }

  await db.userConsent.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id, posthogConsent: false },
  });

  return user;
}

async function ensureSampleDAs() {
  const validLgaIds = new Set(
    (await db.lga.findMany({ select: { id: true } })).map((l) => l.id),
  );
  const now = Date.now();
  let inserted = 0;
  for (const [i, da] of SAMPLE_DAS.entries()) {
    if (!validLgaIds.has(da.lgaId)) {
      console.warn(`[dev-seed] skipping DA ${da.daId} — lga '${da.lgaId}' not in DB`);
      continue;
    }
    const lodgementDate = new Date(now - (i % 7) * 24 * 60 * 60 * 1000);
    await db.developmentApplication.upsert({
      where: { daId_council: { daId: da.daId, council: da.lgaId } },
      update: {
        address: da.address,
        description: da.description,
        estimatedValue: da.estimatedValue,
        applicantName: da.applicantName,
      },
      create: {
        daId: da.daId,
        council: da.lgaId,
        lgaId: da.lgaId,
        address: da.address,
        description: da.description,
        estimatedValue: da.estimatedValue,
        lodgementDate,
        applicantName: da.applicantName,
        portalUrl: `https://da.example.gov.au/${da.lgaId}/${encodeURIComponent(da.daId)}`,
        rawScopeText: da.description,
        sourceApi: "council_da",
        ruleFilteredOut: false,
      },
    });
    inserted++;
  }
  return inserted;
}

async function ensureSampleDigest(userId: string) {
  const today = new Date();
  const lastSunday = new Date(today);
  lastSunday.setUTCDate(today.getUTCDate() - today.getUTCDay());
  lastSunday.setUTCHours(0, 0, 0, 0);

  let run = await db.digestRun.findFirst({ where: { runDate: lastSunday } });
  if (!run) {
    run = await db.digestRun.create({
      data: {
        runDate: lastSunday,
        completedAt: lastSunday,
        userCount: 1,
        status: "done",
        fallbackUsed: false,
      },
    });
  }

  const existing = await db.digest.findFirst({ where: { userId, runId: run.id } });
  if (existing) {
    return; // idempotent — leave the existing demo digest in place
  }

  const subscriptions = await db.lgaBundleSubscription.findMany({
    where: { userId },
    select: { bundleId: true },
  });
  const subscribedLgas = await db.lga.findMany({
    where: { bundleId: { in: subscriptions.map((s) => s.bundleId) } },
    select: { id: true },
  });
  const das = await db.developmentApplication.findMany({
    where: { lgaId: { in: subscribedLgas.map((l) => l.id) } },
    take: 12,
    orderBy: { lodgementDate: "desc" },
  });
  if (das.length === 0) return;

  const digest = await db.digest.create({
    data: {
      userId,
      runId: run.id,
      sentAt: lastSunday,
      daCount: das.length,
      emailStatus: "sent",
    },
  });
  for (const [idx, da] of das.entries()) {
    await db.digestDa.create({
      data: {
        digestId: digest.id,
        daId: da.id,
        relevanceScore: 9 - (idx % 4),
        whyMatched: whyMatched(da.description),
        rank: idx + 1,
      },
    });
  }
}

async function main() {
  const bundleCount = await db.lgaBundle.count();
  if (bundleCount === 0) {
    console.error(
      "[dev-seed] aborting: lga_bundles is empty. Run `prisma db seed` first.",
    );
    process.exit(1);
  }

  console.log(`[dev-seed] demo user ${DEMO_USER.email} (password: ${DEMO_USER.password}) ...`);
  const user = await ensureDemoUser();

  console.log("[dev-seed] sample DAs ...");
  const inserted = await ensureSampleDAs();
  console.log(`[dev-seed]   ${inserted}/${SAMPLE_DAS.length} sample DAs upserted.`);

  console.log("[dev-seed] sample digest ...");
  await ensureSampleDigest(user.id);

  console.log("[dev-seed] done.");
}

main()
  .catch((e) => {
    console.error("[dev-seed] failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
