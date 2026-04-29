// Prisma client singleton — Accelerate-aware
// Stack: prisma 5 | postgres 16 | contract.database.pooler = prisma-accelerate
import { PrismaClient } from "@prisma/client";
import { env } from "@/lib/env";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      env.NODE_ENV === "development"
        ? ["query", "warn", "error"]
        : ["warn", "error"],
  });

if (env.NODE_ENV !== "production") globalForPrisma.prisma = db;
