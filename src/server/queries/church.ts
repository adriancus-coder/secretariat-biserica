import "server-only";
import { cache } from "react";
import type { ChurchInfo } from "@/domain/types";
import { resolveAttendanceRules, type AttendanceRule } from "@/lib/attendance";
import { resolveNomen, type Nomenclatures } from "@/lib/labels";
import { storedExcerpts, type StatuteExcerpt } from "@/lib/statute-excerpts";
import { storedLayout, type PageLayout } from "@/lib/page-layout";
import { prisma } from "../db";
import type { Ctx } from "../session";

export interface ChurchSettings extends ChurchInfo {
  codPostal: string;
  localitate: string;
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
  /** Meeting types that are a General Assembly (empty = "Adunare generală") and those showing a quorum. */
  tipuriAG: string[];
  tipuriCvorum: string[];
  /** Committee mandate (Statut art. 45): election date (ISO), the election's minutes, extended once. */
  comitetAlesLa: string | null;
  comitetAlegereMeetingId: string | null;
  comitetPrelungit: boolean;
  /** The statute excerpts of the application form (the defaults when none are saved). */
  statutExtrase: StatuteExcerpt[];
  /** Preselected recipients when the minutes are e-mailed ("" = none). */
  pastorEmail: string;
  secretarEmail: string;
  /** Every user must use a second factor at login. */
  require2fa: boolean;
  /** Pastors and administrators sign in with password + passkey (codes only as audited recovery). */
  passkeyPolicy: boolean;
  /** "Semnătura se desenează de fiecare dată": "" off, "TOATE", "TIPURI" (with the types). */
  semnaturaUnica: string;
  semnaturaUnicaTipuri: string[];
  /** Saved privacy notice ("" = template). */
  privacyText: string;
  /** The model notice version adopted ("" = none yet) and when (ISO date). */
  privacyVersion: string;
  /** The weekly prayer message ("" = the default text). */
  prayerMessage: string;
  prayerMessagePerson: string;
  privacyAdoptedAt: string | null;
  /** The Comunitate the church belongs to. */
  comunitate: string;
  /** Default page layout of the printed minutes. */
  pvLayout: PageLayout;
  /** Default page layout of the registered documents. */
  docLayout: PageLayout;
}

/** Memorat pe durata cererii, după id-ul bisericii (luat întotdeauna din sesiunea verificată). */
const loadChurch = cache(async (churchId: string): Promise<ChurchSettings> => {
  const c = await prisma.church.findUniqueOrThrow({ where: { id: churchId } });
  const saved = {
    tipuriSedinte: c.tipuriSedinte,
    tipuriEvenimente: c.tipuriEvenimente,
    tipuriMentiuni: c.tipuriMentiuni,
    categoriiPatrimoniu: c.categoriiPatrimoniu,
    rudenie: c.gradeRudenie,
  };
  const nomen = resolveNomen(saved);
  // Organizația → Pastor empty: the names of the church's pastor users (Statut art. 38).
  const pastorUsers = c.pastor.trim()
    ? []
    : await prisma.user.findMany({ where: { churchId, isPastor: true, active: true }, orderBy: { name: "asc" }, select: { name: true } });
  return {
    id: c.id,
    slug: c.slug,
    applicationsOpen: c.applicationsOpen,
    nume: c.nume,
    adresa: c.adresa,
    codPostal: c.codPostal,
    localitate: c.localitate,
    orgNr: c.orgNr,
    telefon: c.telefon,
    email: c.email,
    pastor: c.pastor.trim() || pastorUsers.map((u) => u.name).join(", "),
    secretar: c.secretar,
    pastorEmail: c.pastorEmail,
    secretarEmail: c.secretarEmail,
    require2fa: c.require2fa,
    passkeyPolicy: c.passkeyPolicy,
    semnaturaUnica: c.semnaturaUnica,
    semnaturaUnicaTipuri: c.semnaturaUnicaTipuri,
    privacyText: c.privacyText,
    privacyVersion: c.privacyVersion,
    prayerMessage: c.prayerMessage,
    prayerMessagePerson: c.prayerMessagePerson,
    privacyAdoptedAt: c.privacyAdoptedAt ? c.privacyAdoptedAt.toISOString().slice(0, 10) : null,
    comunitate: c.comunitate,
    pvLayout: storedLayout(c.pvLayout),
    docLayout: storedLayout(c.docLayout),
    nomen,
    savedNomen: saved,
    attendanceRules: resolveAttendanceRules(nomen.tipuriSedinte, c.regulaPrezenta),
    tipuriAG: c.tipuriAG,
    tipuriCvorum: c.tipuriCvorum,
    comitetAlesLa: c.comitetAlesLa ? c.comitetAlesLa.toISOString().slice(0, 10) : null,
    comitetAlegereMeetingId: c.comitetAlegereMeetingId,
    comitetPrelungit: c.comitetPrelungit,
    statutExtrase: storedExcerpts(c.statutExtrase),
  };
});

/** Datele bisericii utilizatorului curent. */
export function getChurch(ctx: Ctx): Promise<ChurchSettings> {
  return loadChurch(ctx.user.churchId);
}
