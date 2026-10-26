import "server-only";
import type { ApplicationStatusKey } from "@/lib/labels";
import { normalizeSearch } from "@/lib/text";
import type { Ctx } from "../session";

export const APPLICATIONS_PAGE_SIZE = 30;

export async function listApplications(ctx: Ctx, status: ApplicationStatusKey, page: number) {
  const where = { status };
  const total = await ctx.db.application.count({ where });
  const pages = Math.max(1, Math.ceil(total / APPLICATIONS_PAGE_SIZE));
  const current = Math.min(page, pages);
  const items = await ctx.db.application.findMany({
    where,
    orderBy: status === "PENDING" || status === "PROPUSA" ? [{ createdAt: "asc" }] : [{ decidedAt: "desc" }, { createdAt: "desc" }],
    skip: (current - 1) * APPLICATIONS_PAGE_SIZE,
    take: APPLICATIONS_PAGE_SIZE,
    select: { id: true, kind: true, nume: true, prenume: true, telefon: true, createdAt: true, decidedAt: true },
  });
  return { items, total, page: current, pages };
}

/** Reabilitare / excludere proposals in a state (Statut art. 23 alin. 3), oldest first while waiting. */
export function listPersonProposals(ctx: Ctx, status: "PROPUSA" | "ACCEPTED" | "REJECTED") {
  return ctx.db.personProposal.findMany({
    where: { status },
    orderBy: status === "PROPUSA" ? [{ createdAt: "asc" }] : [{ decidedAt: "desc" }],
    take: 50,
    select: { id: true, kind: true, nume: true, personId: true, createdAt: true, decidedAt: true, motivRespingere: true },
  });
}

export function pendingApplicationsCount(ctx: Ctx): Promise<number> {
  return ctx.db.application.count({ where: { status: "PENDING" } });
}

export function getApplication(ctx: Ctx, id: string) {
  return ctx.db.application.findUnique({
    where: { id },
    include: {
      decidedBy: { select: { name: true } },
      person: { select: { id: true, nume: true, prenume: true } },
    },
  });
}

/**
 * A person already in the register with the same name (diacritics and case ignored) and the same
 * birth date (both empty counts as the same); used to warn before accepting an application.
 */
export async function findDuplicatePerson(
  db: Pick<Ctx["db"], "person">,
  p: { nume: string; prenume: string; dataNasterii: Date | null },
) {
  const nume = normalizeSearch(p.nume);
  const prenume = normalizeSearch(p.prenume);
  const candidates = await db.person.findMany({
    where: { dataNasterii: p.dataNasterii, searchText: { contains: nume } },
    select: { id: true, nume: true, prenume: true },
    take: 50,
  });
  return candidates.find((c) => normalizeSearch(c.nume) === nume && normalizeSearch(c.prenume) === prenume) ?? null;
}
