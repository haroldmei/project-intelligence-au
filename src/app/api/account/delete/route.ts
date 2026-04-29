// DELETE /api/account — GDPR/Privacy Act erasure
// Wedge-supporting (right to erasure)
import { NextResponse } from "next/server";
import { validateRequest } from "@/lib/auth/session";
import { lucia } from "@/lib/auth/lucia";
import { deleteAccount } from "@/modules/account/service";
import { cookies } from "next/headers";

export async function DELETE(): Promise<NextResponse> {
  const auth = await validateRequest();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Invalidate session before deleting (cascade will delete sessions anyway)
  await lucia.invalidateSession(auth.session.id);

  await deleteAccount(auth.user.id);

  // Clear session cookie
  const cookieStore = await cookies();
  const blankCookie = lucia.createBlankSessionCookie();
  cookieStore.set(blankCookie.name, blankCookie.value, blankCookie.attributes);

  return NextResponse.json({ deleted: true });
}
