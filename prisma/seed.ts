// Reference data — must exist for the app to function.
// Bundles + LGAs are read by every signup, every digest cron, every
// `/area` render. Without them: FK failures + empty UI.
//
// This seed is production-safe and idempotent — run on every deploy.
//
//   prisma db seed
//
// Slugs match the existing dev DB exactly so this is a no-op in environments
// where rows were already manually inserted.

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const BUNDLES = [
  { id: "western_sydney", label: "Western Sydney" },
  { id: "inner_west_and_city", label: "Inner West & City" },
  { id: "northern_sydney", label: "Northern Sydney" },
  { id: "southern_sydney", label: "Southern Sydney" },
] as const;

const LGAS = [
  // western_sydney
  { id: "blacktown", name: "Blacktown", bundleId: "western_sydney" },
  { id: "cumberland", name: "Cumberland", bundleId: "western_sydney" },
  { id: "parramatta", name: "Parramatta", bundleId: "western_sydney" },
  { id: "penrith", name: "Penrith", bundleId: "western_sydney" },
  { id: "the_hills", name: "The Hills", bundleId: "western_sydney" },
  // inner_west_and_city
  { id: "burwood", name: "Burwood", bundleId: "inner_west_and_city" },
  { id: "canada_bay", name: "Canada Bay", bundleId: "inner_west_and_city" },
  { id: "city_of_sydney", name: "City of Sydney", bundleId: "inner_west_and_city" },
  { id: "inner_west", name: "Inner West", bundleId: "inner_west_and_city" },
  // northern_sydney
  { id: "hornsby", name: "Hornsby", bundleId: "northern_sydney" },
  { id: "ku_ring_gai", name: "Ku-ring-gai", bundleId: "northern_sydney" },
  { id: "northern_beaches", name: "Northern Beaches", bundleId: "northern_sydney" },
  // southern_sydney
  { id: "bayside", name: "Bayside", bundleId: "southern_sydney" },
  { id: "georges_river", name: "Georges River", bundleId: "southern_sydney" },
  { id: "sutherland", name: "Sutherland", bundleId: "southern_sydney" },
] as const;

async function main() {
  for (const b of BUNDLES) {
    await db.lgaBundle.upsert({
      where: { id: b.id },
      update: { label: b.label },
      create: { id: b.id, label: b.label },
    });
  }
  for (const l of LGAS) {
    await db.lga.upsert({
      where: { id: l.id },
      update: { name: l.name, bundleId: l.bundleId },
      create: { id: l.id, name: l.name, bundleId: l.bundleId },
    });
  }
  console.log(`[seed] reference data ok — ${BUNDLES.length} bundles, ${LGAS.length} LGAs.`);
}

main()
  .catch((e) => {
    console.error("[seed] failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
