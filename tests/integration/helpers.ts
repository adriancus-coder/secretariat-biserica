import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

export const TEST_DB_URL = process.env.TEST_DATABASE_URL;
export const hasTestDb = Boolean(TEST_DB_URL);

let client: PrismaClient | undefined;

export function testPrisma(): PrismaClient {
  if (!TEST_DB_URL) throw new Error("TEST_DATABASE_URL lipsește");
  client ??= new PrismaClient({ adapter: new PrismaPg({ connectionString: TEST_DB_URL }) });
  return client;
}

/** Golește toate tabelele (în afara migrațiilor). */
export async function resetDatabase(prisma: PrismaClient) {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE "audit_logs","notes","group_members","groups","documents","event_contributions","events",
     "meeting_attendees","meetings","persons","password_resets","invitations","users","churches" CASCADE`,
  );
}
