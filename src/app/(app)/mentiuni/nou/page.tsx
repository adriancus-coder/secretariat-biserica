import type { Metadata } from "next";
import { BackLink, PageHead } from "@/components/ui/page-head";
import { todayIso } from "@/lib/dates";
import { getChurch } from "@/server/queries/church";
import { familyNames, personOptions } from "@/server/queries/persons";
import { requireCtx } from "@/server/session";
import { NoteForm } from "../note-form";

export const metadata: Metadata = { title: "Mențiune nouă" };

export default async function NewNotePage({ searchParams }: PageProps<"/mentiuni/nou">) {
  const ctx = await requireCtx("write");
  const sp = await searchParams;
  const [church, people, families] = await Promise.all([getChurch(ctx), personOptions(ctx), familyNames(ctx)]);
  const personId = typeof sp.persoana === "string" && people.some((p) => p.id === sp.persoana) ? sp.persoana : "";
  return (
    <>
      <BackLink href={personId ? `/persoane/${personId}` : "/mentiuni"}>{personId ? "Fișa persoanei" : "Mențiuni"}</BackLink>
      <PageHead title="Mențiune nouă" />
      <NoteForm
        id={null}
        initial={{ data: todayIso(), tip: church.nomen.tipuriMentiuni[0] ?? "", personId, familie: "", text: "" }}
        people={people}
        families={families}
        tipuri={church.nomen.tipuriMentiuni}
        backToPerson={Boolean(personId)}
        cancelHref={personId ? `/persoane/${personId}` : "/mentiuni"}
      />
    </>
  );
}
