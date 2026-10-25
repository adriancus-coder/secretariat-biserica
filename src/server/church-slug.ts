import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { slugify, slugVariant } from "@/lib/slug";

/** A slug no other church uses, derived from `name`: base, base-2, base-3, … */
export async function uniqueChurchSlug(db: Pick<Prisma.TransactionClient, "church">, name: string): Promise<string> {
  const base = slugify(name);
  for (let n = 1; ; n++) {
    const candidate = n === 1 ? base : slugVariant(base, n);
    if (!(await db.church.findUnique({ where: { slug: candidate }, select: { id: true } }))) return candidate;
  }
}
