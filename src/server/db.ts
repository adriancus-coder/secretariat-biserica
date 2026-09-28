import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  // Conexiunea se deschide abia la prima interogare (build-ul nu are nevoie de baza de date).
  if (!connectionString && process.env.NEXT_PHASE !== "phase-production-build") {
    console.warn("[db] Variabila de mediu DATABASE_URL nu este setată — vezi .env.example.");
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Clientul Prisma „brut”, fără filtrare pe biserică. Se folosește doar pentru operațiuni care
 * nu țin de o singură biserică (autentificare, înregistrare) — restul codului folosește `tenantDb()`.
 */
export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
