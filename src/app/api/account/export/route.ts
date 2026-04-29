// GET /api/account/export — Privacy Act data export
// Wedge-supporting (GDPR / Privacy Act 1988 AU)
import { NextResponse } from "next/server";
import { validateRequest } from "@/lib/auth/session";
import { exportAccountData } from "@/modules/account/service";

export async function GET(): Promise<NextResponse> {
  const auth = await validateRequest();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const data = await exportAccountData(auth.user.id);
  return NextResponse.json(data, {
    headers: {
      "Content-Disposition": `attachment; filename="pi-au-data-export-${auth.user.id}.json"`,
    },
  });
}
