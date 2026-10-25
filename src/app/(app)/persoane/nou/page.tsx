import { fmtDot } from "@/domain/print";
import { consentNote, STATUTE, STATUTE_KINDS } from "@/lib/statutes";
import type { Metadata } from "next";
import Link from "next/link";
import { BackLink, PageHead } from "@/components/ui/page-head";
import { fromDbDate, todayIso } from "@/lib/dates";
import { memberName } from "@/lib/format";
import { idSchema } from "@/lib/validation";
import { getApplication } from "@/server/queries/applications";
import { getChurch } from "@/server/queries/church";
import { familyOptions } from "@/server/queries/families";
import { roleChoices } from "@/server/queries/roles";
import { requireCtx } from "@/server/session";
import { PersonForm, type PersonFormValues } from "../person-form";
import { meetingChoices } from "@/server/queries/meetings";

export const metadata: Metadata = { title: "Persoană nouă" };

export default async function NewPersonPage({ searchParams }: PageProps<"/persoane/nou">) {
  const ctx = await requireCtx("write");
  const sp = await searchParams;
  const [church, families, roles, meetings] = await Promise.all([getChurch(ctx), familyOptions(ctx), roleChoices(ctx, null), meetingChoices(ctx)]);
  // "+ Membru de familie" from a person's page: the new person joins that family.
  const familyId = typeof sp.familie === "string" && families.some((f) => f.id === sp.familie) ? sp.familie : "";

  // Accepting a membership application: the form starts from the applicant's data.
  const cerere = typeof sp.cerere === "string" && idSchema.safeParse(sp.cerere).success ? sp.cerere : null;
  const app = cerere ? await getApplication(ctx, cerere) : null;
  if (app && app.status !== "PENDING") {
    return (
      <>
        <BackLink href={`/cereri/${app.id}`}>Cererea</BackLink>
        <PageHead title="Cerere deja procesată" />
        <p className="hint">
          Cererea lui {memberName(app)} a fost deja procesată. <Link href={`/cereri/${app.id}`}>Vezi cererea</Link>.
        </p>
      </>
    );
  }
  let initial: PersonFormValues = { statut: "MEMBRU", familyId };
  if (app) {
    const member = app.kind !== "ALTUL";
    initial = {
      nume: app.nume,
      prenume: app.prenume,
      statut: member ? "MEMBRU" : "PRIETEN",
      gen: app.gen ?? "",
      rudenie: app.rudenie,
      dataNasterii: fromDbDate(app.dataNasterii) ?? "",
      telefon: app.telefon,
      email: app.email,
      adresa: app.adresa,
      modIntrare: app.kind,
      // Statut art. 22 alin. 3: a member from the baptism date, or from the approval of the transfer.
      dataMembru: !member ? "" : app.kind === "BOTEZ" && app.dataBotez ? fromDbDate(app.dataBotez)! : todayIso(),
      bisericaProvenienta: app.bisericaProvenienta,
      dataBotez: fromDbDate(app.dataBotez) ?? "",
      botezAn: app.dataBotez || app.botezAn === null ? "" : String(app.botezAn),
      botezBiserica: app.botezBiserica,
      botezLocalitate: app.botezLocalitate,
      botezOficiant: app.botezOficiant,
      note: [
        app.mesaj ? `Din cererea de membru: ${app.mesaj}` : "",
        consentNote(
          STATUTE_KINDS.filter((k) => app[STATUTE[k].consentField]),
          app.consentAt ? fmtDot(app.consentAt.toISOString().slice(0, 10)) : "",
        ),
      ]
        .filter(Boolean)
        .join("\n"),
    };
  }
  return (
    <>
      <BackLink href={app ? `/cereri/${app.id}` : "/persoane"}>{app ? "Cererea" : "Persoane"}</BackLink>
      <PageHead title={app ? `Acceptă cererea: ${memberName(app)}` : "Persoană nouă"} />
      {app ? (
        <p className="hint mb-4">
          Verificați datele; la salvare persoana intră în registru și cererea devine acceptată.
          {app.familie ? ` Familia trecută în cerere: „${app.familie}” — alegeți familia din listă sau „Familie nouă”.` : ""}
        </p>
      ) : null}
      <PersonForm
        id={null}
        initial={initial}
        families={families}
        rudenie={church.nomen.rudenie}
        roles={roles}
        meetings={meetings}
        cancelHref={app ? `/cereri/${app.id}` : "/persoane"}
        applicationId={app?.id}
      />
    </>
  );
}
