import { fromDbDate } from "@/lib/dates";
import { privacyTemplate, publicPrivacyText } from "@/lib/privacy";
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
    select: { nume: true, email: true, adresa: true, orgNr: true, telefon: true, comunitate: true, privacyAdoptedAt: true, privacyText: true, extractEnabled: true },
  });
  const notice = publicPrivacyText(c.privacyText.trim() || privacyTemplate({ ...c, privacyAdoptedAt: fromDbDate(c.privacyAdoptedAt) }), c.extractEnabled);
  return { nume: c.nume, notice };
}
