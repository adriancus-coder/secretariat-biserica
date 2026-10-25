import { officiantOptions } from "@/server/queries/officiants";
import { committeeEligibility } from "@/server/queries/committee";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BackLink, PageHead } from "@/components/ui/page-head";
import { fromDbDate } from "@/lib/dates";
import { memberName } from "@/lib/format";
import { PERSON_FIELDS } from "@/lib/schemas/person";
import { getChurch } from "@/server/queries/church";
import { familyOptions } from "@/server/queries/families";
import { getPerson, parseListSpec, personNeighbors } from "@/server/queries/persons";
import { withDin } from "@/lib/person-nav";
import { personRoles, roleChoices, rolesFieldValue } from "@/server/queries/roles";
import { requireCtx } from "@/server/session";
import { meetingChoices } from "@/server/queries/meetings";
import { contactRestricted } from "@/lib/contact-access";
import { PersonForm } from "../../person-form";

export const metadata: Metadata = { title: "Editează persoana" };

export default async function EditPersonPage({ params, searchParams }: PageProps<"/persoane/[id]/editare">) {
  const { id } = await params;
  const sp = await searchParams;
  const din = typeof sp.din === "string" ? sp.din : undefined;
  const ctx = await requireCtx("write");
  const [person, church, families, roles, held, meetings] = await Promise.all([
    getPerson(ctx, id),
    getChurch(ctx),
    familyOptions(ctx),
    roleChoices(ctx, id),
    personRoles(ctx, id),
    meetingChoices(ctx),
  ]);
  if (!person) notFound();
  const nav = await personNeighbors(ctx, id, parseListSpec(din), church.nomen.rudenie);

  const initial: Record<string, string> = {};
  for (const f of PERSON_FIELDS) {
    const v = person[f];
    initial[f] = v instanceof Date ? fromDbDate(v)! : v == null ? "" : String(v);
  }
  // Contact data of a person who left are restricted to administrators: not sent, kept on save.
  const restricted = contactRestricted(person, ctx.user.role);
  if (restricted) for (const f of ["telefon", "email", "adresa"] as const) initial[f] = "";
  initial.functii = rolesFieldValue(held);
  initial.inComitet = person.inComitet ? "on" : "";
  initial.familyId = person.familyId ?? "";
  initial.intrareMeetingId = person.intrareMeetingId ?? "";
  initial.iesireMeetingId = person.iesireMeetingId ?? "";
  // The head of a family with other members changes family only after a new head is chosen.
  const headOf = await ctx.db.family.findUnique({ where: { headId: id }, select: { id: true, nume: true, _count: { select: { members: true } } } });
  const lockedFamily = headOf && headOf._count.members > 1 ? { id: headOf.id, nume: headOf.nume } : undefined;
  return (
    <>
      <BackLink href={withDin(`/persoane/${id}`, din)}>{memberName(person)}</BackLink>
      <PageHead title="Editează persoana" />
      <PersonForm
        officiants={await officiantOptions(ctx)}
        committeeWarnings={await committeeEligibility(ctx, id)}
        id={id}
        initial={initial}
        families={families}
        lockedFamily={lockedFamily}
        rudenie={church.nomen.rudenie}
        roles={roles}
        meetings={meetings}
        contactRestricted={restricted}
        cancelHref={withDin(`/persoane/${id}`, din)}
        din={din}
        nav={{
          prevHref: nav.prev ? withDin(`/persoane/${nav.prev}/editare`, din) : null,
          nextHref: nav.next ? withDin(`/persoane/${nav.next}/editare`, din) : null,
          position: nav.position,
          total: nav.total,
        }}
      />
    </>
  );
}
