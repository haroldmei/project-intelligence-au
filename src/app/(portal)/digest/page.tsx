import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DigestView } from "@/components/digest-view";
import { validateRequest } from "@/lib/auth/session";
import {
  getCurrentDigest,
  getDigestHistory,
  getMyArea,
  type MyArea,
} from "@/modules/portal/loaders";

export const metadata: Metadata = {
  title: "Your Digest — ProjectIntelligence AU",
};
export const dynamic = "force-dynamic";

function buildAreaLabel(area: MyArea | null): string {
  if (!area || area.lgaBundles.length === 0) return "—";
  return area.lgaBundles.map((b) => b.label).join(" + ");
}

export default async function DigestPage() {
  const auth = await validateRequest();
  if (!auth) redirect("/login");

  const [digest, area, history] = await Promise.all([
    getCurrentDigest(auth.user.id),
    getMyArea(auth.user.id),
    getDigestHistory(auth.user.id, 100),
  ]);

  if (!digest) return <EmptyState />;

  return (
    <DigestView
      digest={digest}
      areaLabel={buildAreaLabel(area)}
      weeksOfHistory={history.filter((h) => h.sentAt).length}
    />
  );
}

function EmptyState() {
  return (
    <div className="px-4 py-8 space-y-4">
      <h1 className="text-2xl font-bold text-[#102A43]">Your Digest</h1>
      <div className="rounded-md bg-[#E0F2FE] text-[#0C4A6E] text-sm px-4 py-4">
        <p className="font-medium">Your first digest arrives Sunday at 6 pm AEST.</p>
        <p className="mt-1 text-xs">
          We send the week&apos;s DA leads every Sunday evening. Once it arrives,
          it will appear here.
        </p>
      </div>
      <div className="rounded-md bg-[#FEF3C7] text-[#78350F] text-sm px-4 py-4" role="note">
        Your digest gets smarter as you use it — tap 👍 or 👎 on each card.
      </div>
    </div>
  );
}
