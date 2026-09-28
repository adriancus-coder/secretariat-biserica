import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BackLink, PageHead } from "@/components/ui/page-head";
import { fromDbDate } from "@/lib/dates";
import { memberName } from "@/lib/format";
import { PERSON_FIELDS } from "@/lib/schemas/person";
import { getChurch } from "@/server/queries/church";
import { familyNames, getPerson } from "@/server/queries/persons";
import { requireCtx } from "@/server/session";
import { PersonForm } from "../../person-form";

export const metadata: Metadata = { title: "Editează persoana" };

export default async function EditPersonPage({ params }: PageProps<"/persoane/[id]/editare">) {
  const { id } = await params;
  const ctx = await requireCtx("write");
  const [person, church, families] = await Promise.all([getPerson(ctx, id), getChurch(ctx), familyNames(ctx)]);
  if (!person) notFound();

  const initial: Record<string, string> = {};
  for (const f of PERSON_FIELDS) {
    const v = person[f];
    initial[f] = v instanceof Date ? fromDbDate(v)! : v == null ? "" : String(v);
  }
  return (
    <>
      <BackLink href={`/persoane/${id}`}>{memberName(person)}</BackLink>
      <PageHead title="Editează persoana" />
      <PersonForm id={id} initial={initial} families={families} rudenie={church.nomen.rudenie} cancelHref={`/persoane/${id}`} />
    </>
  );
}
