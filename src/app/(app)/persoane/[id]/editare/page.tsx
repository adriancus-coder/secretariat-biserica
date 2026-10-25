import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BackLink, PageHead } from "@/components/ui/page-head";
import { fromDbDate } from "@/lib/dates";
import { memberName } from "@/lib/format";
import { PERSON_FIELDS } from "@/lib/schemas/person";
import { getChurch } from "@/server/queries/church";
import { familyOptions } from "@/server/queries/families";
import { getPerson } from "@/server/queries/persons";
import { personRoles, roleChoices, rolesFieldValue } from "@/server/queries/roles";
import { requireCtx } from "@/server/session";
import { PersonForm } from "../../person-form";

export const metadata: Metadata = { title: "Editează persoana" };

export default async function EditPersonPage({ params }: PageProps<"/persoane/[id]/editare">) {
  const { id } = await params;
  const ctx = await requireCtx("write");
  const [person, church, families, roles, held] = await Promise.all([
    getPerson(ctx, id),
    getChurch(ctx),
    familyOptions(ctx),
    roleChoices(ctx, id),
    personRoles(ctx, id),
  ]);
  if (!person) notFound();

  const initial: Record<string, string> = {};
  for (const f of PERSON_FIELDS) {
    const v = person[f];
    initial[f] = v instanceof Date ? fromDbDate(v)! : v == null ? "" : String(v);
  }
  initial.functii = rolesFieldValue(held);
  initial.familyId = person.familyId ?? "";
  // The head of a family with other members changes family only after a new head is chosen.
  const headOf = await ctx.db.family.findUnique({ where: { headId: id }, select: { id: true, nume: true, _count: { select: { members: true } } } });
  const lockedFamily = headOf && headOf._count.members > 1 ? { id: headOf.id, nume: headOf.nume } : undefined;
  return (
    <>
      <BackLink href={`/persoane/${id}`}>{memberName(person)}</BackLink>
      <PageHead title="Editează persoana" />
      <PersonForm id={id} initial={initial} families={families} lockedFamily={lockedFamily} rudenie={church.nomen.rudenie} roles={roles} cancelHref={`/persoane/${id}`} />
    </>
  );
}
