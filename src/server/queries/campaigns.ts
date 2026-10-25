import "server-only";
import { campaignOpen, linkStatus, type LinkStatus } from "@/lib/campaign";
import { fromDbDate, todayIso } from "@/lib/dates";
import { generalToken, linkToken } from "../campaign-tokens";
import { requestOrigin } from "../request-origin";
import type { Ctx } from "../session";
import { appUrl } from "../tokens";

export async function listCampaigns(ctx: Ctx) {
  const rows = await ctx.db.dataCampaign.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { links: true } }, links: { where: { submittedAt: { not: null } }, select: { id: true } } },
  });
  return rows.map((c) => ({ id: c.id, nume: c.nume, deadline: fromDbDate(c.deadline)!, status: c.status, total: c._count.links, answered: c.links.length }));
}

export interface CampaignLinkRow {
  id: string;
  personId: string;
  nume: string;
  prenume: string;
  telefon: string;
  status: LinkStatus;
  url: string;
  failedChecks: number;
}

/** A campaign with its personal links (write roles only: the page shows the links). */
export async function getCampaign(ctx: Ctx, id: string) {
  const c = await ctx.db.dataCampaign.findUnique({
    where: { id },
    include: { links: { include: { person: { select: { nume: true, prenume: true, telefon: true, sortKey: true } } } } },
  });
  if (!c) return null;
  const origin = await requestOrigin();
  const approved = new Set<string>();
  const links: CampaignLinkRow[] = c.links
    .sort((a, b) => a.person.sortKey.localeCompare(b.person.sortKey))
    .map((l) => ({
      id: l.id,
      personId: l.personId,
      nume: l.person.nume,
      prenume: l.person.prenume,
      telefon: l.person.telefon,
      status: linkStatus({ ...l, approved: approved.has(l.personId) }),
      url: appUrl(`/actualizare/${linkToken(l.id, l.nonce)}`, origin),
      failedChecks: l.failedChecks,
    }));
  const deadline = fromDbDate(c.deadline)!;
  return {
    id: c.id,
    nume: c.nume,
    deadline,
    status: c.status,
    open: campaignOpen({ status: c.status, deadline }, todayIso()),
    generalUrl: c.generalLinkEnabled && c.generalNonce ? appUrl(`/actualizare/g/${generalToken(c.id, c.generalNonce)}`, origin) : null,
    links,
  };
}
