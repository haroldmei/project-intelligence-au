// Lucia v3 — auth.default: lucia | session: jwt-with-refresh
// contract: auth.password_hashing = argon2id, auth.session = jwt-with-refresh
// Cookies: httpOnly, SameSite=Lax, Secure (Vercel HTTPS-by-default)
import { Lucia, TimeSpan } from "lucia";
import { PrismaAdapter } from "@lucia-auth/adapter-prisma";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

const adapter = new PrismaAdapter(db.session, db.user);

export const lucia = new Lucia(adapter, {
  sessionCookie: {
    attributes: {
      // SameSite=Lax: CSRF protection for all mutating routes
      // Secure: enforced on Vercel (HTTPS); dev: next.js dev = http, ok
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
    },
  },
  // 30-day session inactivity expiry (NFR-017)
  sessionExpiresIn: new TimeSpan(30, "d"),
  getUserAttributes(attributes) {
    return {
      email: attributes.email,
      emailVerified: attributes.emailVerified,
      subscriptionStatus: attributes.subscriptionStatus,
      trade: attributes.trade,
    };
  },
});

declare module "lucia" {
  interface Register {
    Lucia: typeof lucia;
    DatabaseUserAttributes: {
      email: string;
      emailVerified: boolean;
      subscriptionStatus: string;
      trade: string;
    };
  }
}
