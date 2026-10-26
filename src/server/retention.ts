import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { CONTACT_RETENTION_MONTHS } from "@/lib/contact-access";
import { monthsBefore, todayIso, toDbDate } from "@/lib/dates";

/** Persons who left more than 12 months ago and still have contact data (privacy notice, point 6). */
export function expiredContactWhere(): Prisma.PersonWhereInput {
  return {
    dataIesire: { lte: toDbDate(monthsBefore(todayIso(), CONTACT_RETENTION_MONTHS))! },
    OR: [{ telefon: { not: "" } }, { email: { not: "" } }, { adresa: { not: "" } }, { codPostal: { not: "" } }, { localitate: { not: "" } }],
  };
}
