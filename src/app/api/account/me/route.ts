// GET /api/account/me + PUT /api/account/me
// FR: account management | system-design §4 API
import { NextResponse } from "next/server";
import { validateRequest } from "@/lib/auth/session";
import { UpdateProfileInput } from "@/modules/account/schemas";
import { getAccount, updateProfile } from "@/modules/account/service";

export async function GET(): Promise<NextResponse> {
  const auth = await validateRequest();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const account = await getAccount(auth.user.id);
  if (!account) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(account);
}

export async function PUT(request: Request): Promise<NextResponse> {
  const auth = await validateRequest();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = UpdateProfileInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const account = await updateProfile(auth.user.id, parsed.data);
  return NextResponse.json(account);
}
