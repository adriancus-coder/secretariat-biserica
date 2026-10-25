import "server-only";
import { cache } from "react";
import type { ChurchInfo } from "@/domain/types";
import { resolveAttendanceRules, type AttendanceRule } from "@/lib/attendance";
import { resolveNomen, type Nomenclatures } from "@/lib/labels";
import { prisma } from "../db";
import type { Ctx } from "../session";

export interface ChurchSettings extends ChurchInfo {
  id: string;
  /** Public address of the application form: /cerere/<slug>. */
  slug: string;
  applicationsOpen: boolean;
  /** Nomenclatoarele efective (cele salvate sau cele implicite). */
  nomen: Nomenclatures;
  /** Nomenclatoarele salvate (liste goale = implicit). */
  savedNomen: Nomenclatures;
  /** Attendance rule of every meeting type in `nomen.tipuriSedinte`. */
  attendanceRules: Record<string, AttendanceRule>;
  /** Preselected recipients when the minutes are e-mailed ("" = none). */
  pastorEmail: string;
  secretarEmail: string;
  /** Every user must use a second factor at login. */
  require2fa: boolean;
  /** Saved privacy notice ("" = template). */
  privacyText: string;
  /** Reading scans with Claude accepted by an administrator. */
  extractEnabled: boolean;
}

/** Memorat pe durata cererii, după id-ul bisericii (luat întotdeauna din sesiunea verificată). */
const loadChurch = cache(async (churchId: string): Promise<ChurchSettings> => {
  const c = await prisma.church.findUniqueOrThrow({ where: { id: churchId } });
  const saved = {
    tipuriSedinte: c.tipuriSedinte,
    tipuriEvenimente: c.tipuriEvenimente,
    tipuriMentiuni: c.tipuriMentiuni,
    rudenie: c.gradeRudenie,
  };
  const nomen = resolveNomen(saved);
  return {
    id: c.id,
    slug: c.slug,
    applicationsOpen: c.applicationsOpen,
    nume: c.nume,
    adresa: c.adresa,
    orgNr: c.orgNr,
    telefon: c.telefon,
    email: c.email,
    pastor: c.pastor,
    secretar: c.secretar,
    pastorEmail: c.pastorEmail,
    secretarEmail: c.secretarEmail,
    require2fa: c.require2fa,
    privacyText: c.privacyText,
    extractEnabled: c.extractEnabled,
    nomen,
    savedNomen: saved,
    attendanceRules: resolveAttendanceRules(nomen.tipuriSedinte, c.regulaPrezenta),
  };
});

/** Datele bisericii utilizatorului curent. */
export function getChurch(ctx: Ctx): Promise<ChurchSettings> {
  return loadChurch(ctx.user.churchId);
}
