import "server-only";
import { cache } from "react";
import type { ChurchInfo } from "@/domain/types";
import { resolveNomen, type Nomenclatures } from "@/lib/labels";
import { prisma } from "../db";
import type { Ctx } from "../session";

export interface ChurchSettings extends ChurchInfo {
  id: string;
  /** Nomenclatoarele efective (cele salvate sau cele implicite). */
  nomen: Nomenclatures;
  /** Nomenclatoarele salvate (liste goale = implicit). */
  savedNomen: Nomenclatures;
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
  return {
    id: c.id,
    nume: c.nume,
    adresa: c.adresa,
    orgNr: c.orgNr,
    telefon: c.telefon,
    email: c.email,
    pastor: c.pastor,
    secretar: c.secretar,
    nomen: resolveNomen(saved),
    savedNomen: saved,
  };
});

/** Datele bisericii utilizatorului curent. */
export function getChurch(ctx: Ctx): Promise<ChurchSettings> {
  return loadChurch(ctx.user.churchId);
}
