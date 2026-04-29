import argon2 from "argon2";
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
async function main() {
  const user = await db.user.findUnique({ where: { email: "newuser2@example.com" } });
  if (!user) { console.log("user not found"); process.exit(1); }
  const code = "123456";
  const hash = await argon2.hash(code, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
  // invalidate existing
  await db.emailOtp.updateMany({ where: { userId: user.id, purpose: "verify", consumedAt: null }, data: { consumedAt: new Date() } });
  await db.emailOtp.create({
    data: {
      userId: user.id,
      codeHash: hash,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      purpose: "verify",
    },
  });
  console.log("OTP set to", code, "for user", user.email);
}
main().catch(e => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
