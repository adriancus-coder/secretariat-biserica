import type { Metadata } from "next";
import Link from "next/link";
import { BackLink, PageHead } from "@/components/ui/page-head";
import { fromDbDate, todayIso } from "@/lib/dates";
import { memberName } from "@/lib/format";
import { idSchema } from "@/lib/validation";
import { getApplication } from "@/server/queries/applications";
import { getChurch } from "@/server/queries/church";
import { familyNames } from "@/server/queries/persons";
import { roleChoices } from "@/server/queries/roles";
import { requireCtx } from "@/server/session";
import { PersonForm, type PersonFormValues } from "../person-form";

export const metadata: Metadata = { title: "Persoană nouă" };

export default async function NewPersonPage({ searchParams }: PageProps<"/persoane/nou">) {
  const ctx = await requireCtx("write");
  const sp = await searchParams;
  const [church, families, roles] = await Promise.all([getChurch(ctx), familyNames(ctx), roleChoices(ctx, null)]);
  const familie = typeof sp.familie === "string" ? sp.familie.slice(0, 100) : "";

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
  let initial: PersonFormValues = { statut: "MEMBRU", familie };
  if (app) {
    const member = app.kind !== "ALTUL";
    initial = {
      nume: app.nume,
      prenume: app.prenume,
      statut: member ? "MEMBRU" : "PRIETEN",
      gen: app.gen ?? "",
      familie: app.familie,
      rudenie: app.rudenie,
      dataNasterii: fromDbDate(app.dataNasterii) ?? "",
      telefon: app.telefon,
      email: app.email,
      adresa: app.adresa,
      modIntrare: app.kind,
      dataMembru: member ? todayIso() : "",
      bisericaProvenienta: app.bisericaProvenienta,
      dataBotez: fromDbDate(app.dataBotez) ?? "",
      locBotez: app.locBotez,
      note: app.mesaj ? `Din cererea de membru: ${app.mesaj}` : "",
    };
  }
  return (
    <>
      <BackLink href={app ? `/cereri/${app.id}` : "/persoane"}>{app ? "Cererea" : "Persoane"}</BackLink>
      <PageHead title={app ? `Acceptă cererea: ${memberName(app)}` : "Persoană nouă"} />
      {app ? <p className="hint mb-4">Verificați datele; la salvare persoana intră în registru și cererea devine acceptată.</p> : null}
      <PersonForm
        id={null}
        initial={initial}
        families={families}
        rudenie={church.nomen.rudenie}
        roles={roles}
        cancelHref={app ? `/cereri/${app.id}` : "/persoane"}
        applicationId={app?.id}
      />
    </>
  );
}
