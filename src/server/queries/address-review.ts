import "server-only";
import type { Prisma } from "@/generated/prisma/client";

export const ADDRESS_REVIEW_REASON = "Adresa nu are cod poștal";

/**
 * Persons in the register whose address is filled in but has no postal code (an old single-line
 * address that did not match "<street>, <4 digits> <locality>"). Persons who left are left out: their
 * contact data are restricted and deleted after 12 months.
 */
export const addressReviewWhere: Prisma.PersonWhereInput = {
  adresa: { not: "" },
  codPostal: "",
  dataIesire: null,
  statut: { not: "FOST_MEMBRU" },
};
