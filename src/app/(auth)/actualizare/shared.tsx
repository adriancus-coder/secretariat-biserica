import { storedExcerpts } from "@/lib/statute-excerpts";
import { STATUTE } from "@/lib/statutes";
import { listStatutes } from "@/server/statutes";
import { fromDbDate } from "@/lib/dates";
import { privacyTemplate } from "@/lib/privacy";
import { prisma } from "@/server/db";

/** The same neutral page for an unknown, revoked, expired or closed link. */
export function InvalidLink() {
  return (
    <>
      <h2 className="text-2xl mb-2">Linkul nu este valabil</h2>
      <p className="hint">Verificați linkul primit sau cereți unul nou de la secretariatul bisericii.</p>
    </>
  );
}

/** The person's answer was already approved: the link is closed (DATA-UPDATE-ACCEPTED). */
export function AcceptedLink() {
  return (
    <>
      <h2 className="text-2xl mb-2">Datele au fost deja acceptate</h2>
      <p className="hint">Secretariatul a verificat și a acceptat datele dumneavoastră, așa că linkul nu mai poate fi folosit. Dacă doriți să mai modificați ceva, adresați-vă secretariatului bisericii.</p>
    </>
  );
}

export function LockedLink() {
  return (
    <>
      <h2 className="text-2xl mb-2">Linkul a fost blocat</h2>
      <p className="hint">Linkul a fost blocat. Cereți un link nou de la secretariat.</p>
    </>
  );
}

/** The church's name and its privacy notice as published (global client: the church id comes from the link). */
export async function churchForCampaign(churchId: string) {
  const c = await prisma.church.findUniqueOrThrow({
    where: { id: churchId },
    select: {
      nume: true,
      slug: true,
      email: true,
      adresa: true,
      codPostal: true,
      localitate: true,
      orgNr: true,
      telefon: true,
      comunitate: true,
      privacyAdoptedAt: true,
      privacyText: true,
      statutExtrase: true,
    },
  });
  const notice = c.privacyText.trim() || privacyTemplate({ ...c, privacyAdoptedAt: fromDbDate(c.privacyAdoptedAt) });
  // The statute excerpts, with the Cult's statute link when the church published it.
  const cult = (await listStatutes(churchId)).some((s) => s.kind === "STATUT_CULT");
  return { nume: c.nume, notice, excerpts: storedExcerpts(c.statutExtrase), statuteUrl: cult ? `/cerere/${c.slug}/statut/${STATUTE.STATUT_CULT.slug}` : null };
}
