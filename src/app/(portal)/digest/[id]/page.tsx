import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { DigestView } from "@/components/digest-view";
import { validateRequest } from "@/lib/auth/session";
import {
  getDigestById,
  getDigestHistory,
  getMyArea,
  type MyArea,
} from "@/modules/portal/loaders";

export const metadata: Metadata = {
  title: "Digest — ProjectIntelligence AU",
};
export const dynamic = "force-dynamic";

function buildAreaLabel(area: MyArea | null): string {
  if (!area || area.lgaBundles.length === 0) return "—";
  return area.lgaBundles.map((b) => b.label).join(" + ");
}

export default async function DigestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const auth = await validateRequest();
  if (!auth) redirect("/login");

  const { id } = await params;
  const [digest, area, history] = await Promise.all([
    getDigestById(auth.user.id, id),
    getMyArea(auth.user.id),
    getDigestHistory(auth.user.id, 100),
  ]);

  if (!digest) notFound();

  return (
    <div>
      <div className="px-4 pt-4">
        <Link
          href="/history"
          className="text-sm text-[#627D98] hover:text-[#1E3A5F] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D97706] rounded"
        >
          ← History
        </Link>
      </div>
      <DigestView
        digest={digest}
        // Prefer this digest's send-time area snapshot; fall back to the live
        // area only for legacy digests that predate it (issue #138).
        areaLabel={digest.areaLabel ?? buildAreaLabel(area)}
        weeksOfHistory={history.filter((h) => h.sentAt).length}
      />
    </div>
  );
}
