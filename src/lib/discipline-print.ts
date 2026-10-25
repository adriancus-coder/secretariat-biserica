import { para, pastorSecretarySignatures, type PrintSpec } from "@/domain/print";
import type { ChurchInfo } from "@/domain/types";
import { fmtL, memberName } from "./format";

/** The default addressee when the church has not set its Comunitate (Setări → Organizația). */
export const COMMUNITY_PLACEHOLDER = "Comunitatea de care aparține biserica";

export interface ExclusionNotice {
  person: { nume: string; prenume: string; gen: "M" | "F" | null; dataNasterii: string | null };
  /** The date of the measure. */
  data: string;
  /** "PV nr. 3/2026 din 12 martie 2026", or "" when the minutes are not linked. */
  procesVerbal: string;
  today: string;
  comunitate: string;
}

/**
 * "Informare privind excluderea" to the Comunitate (Statut art. 27 alin. 5: an exclusion takes effect
 * on written notice). Administrators only. Pure.
 */
export function exclusionNoticePrint(x: ExclusionNotice, church: ChurchInfo): PrintSpec {
  const f = x.person.gen === "F";
  const born = x.person.dataNasterii ? `, născut${f ? "ă" : ""} la data de ${fmtL(x.person.dataNasterii)}` : "";
  const pv = x.procesVerbal ? `, consemnată în ${x.procesVerbal}` : "";
  return {
    title: "Informare privind excluderea",
    church,
    blocks: [
      { type: "title", text: "Informare privind excluderea" },
      para(`Către ${x.comunitate || COMMUNITY_PLACEHOLDER},`),
      para(
        `Biserica ${church.nume} vă informează că, prin hotărârea din ${fmtL(x.data)}${pv}, ${f ? "sora" : "fratele"} ${memberName(x.person)}${born}, a fost exclus${f ? "ă" : ""} din calitatea de membru al bisericii, conform Statutului Cultului Creștin Penticostal (art. 27 alin. 3 lit. e și alin. 13).`,
      ),
      para(
        `Potrivit art. 27 alin. 5, excluderea produce efecte de la data prezentei informări. Persoana a fost înștiințată de dreptul de a contesta hotărârea la Comunitate în termen de 15 zile de la comunicare (art. 27 alin. 11).`,
      ),
      para(`Data: ${fmtL(x.today)}`),
      pastorSecretarySignatures(church),
    ],
  };
}
