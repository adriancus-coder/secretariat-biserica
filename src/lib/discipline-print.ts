import { para, pastorSecretarySignatures, pre, type PrintSpec } from "@/domain/print";
import type { ChurchInfo } from "@/domain/types";
import { addDays } from "./dates";
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

/** The appeal to the Comunitate: 15 days from the communication (Statut art. 27 alin. 11). */
export const APPEAL_DAYS = 15;
export function appealDeadline(comunicatLa: string): string {
  return addDays(comunicatLa, APPEAL_DAYS);
}

const gendered = (p: { gen: "M" | "F" | null }) => ({ title: p.gen === "F" ? "Sora" : "Fratele" });

export interface HearingConvocation {
  person: { nume: string; prenume: string; gen: "M" | "F" | null };
  /** The hearing: date (ISO), time and place. */
  data: string;
  ora: string;
  loc: string;
  today: string;
  adresa: string;
}

/**
 * "Convocare la audiere" (Statut art. 272 lit. a, b): the person is called before the committee; not
 * attending does not stop the procedure. Administrators only. Pure.
 */
export function hearingConvocationPrint(x: HearingConvocation, church: ChurchInfo): PrintSpec {
  const g = gendered(x.person);
  return {
    title: "Convocare la audiere",
    church,
    blocks: [
      { type: "title", text: "Convocare la audiere" },
      para(`${g.title} ${memberName(x.person)},`),
      para(
        `Comitetul Bisericii ${church.nume} vă convoacă la audiere în data de ${fmtL(x.data)}${x.ora ? `, ora ${x.ora}` : ""}, la ${x.loc || `sediul bisericii${x.adresa ? `, ${x.adresa}` : ""}`}, în cadrul procedurii de cercetare prevăzute de Statutul Cultului Creștin Penticostal (art. 272 lit. a). Veți avea posibilitatea să vă prezentați punctul de vedere în fața comitetului.`,
      ),
      para(`Potrivit art. 272 lit. b, neprezentarea nu împiedică desfășurarea procedurii.`),
      para(`Data: ${fmtL(x.today)}`),
      pastorSecretarySignatures(church),
    ],
  };
}

export interface DisciplinaryMinutes {
  person: { nume: string; prenume: string; gen: "M" | "F" | null };
  /** "Proces verbal nr. 7/2026 din 12 martie 2026" of the committee meeting, or "". */
  sedinta: string;
  abatere: string;
  raspuns: string;
  nuSaPrezentat: boolean;
  /** The sanction, e.g. "Suspendare". */
  sanctiune: string;
  incadrare: string;
  temei: string;
  comunitate: string;
}

/**
 * The "PV disciplinar": the closed-session part of the committee minutes with the contents required by
 * Statut art. 272 lit. c. Printed only for administrators, never in the ordinary minutes. Pure.
 */
export function disciplinaryMinutesPrint(x: DisciplinaryMinutes, church: ChurchInfo): PrintSpec {
  const g = gendered(x.person);
  return {
    title: "Proces verbal disciplinar",
    church,
    blocks: [
      { type: "title", text: "Proces verbal disciplinar" },
      para(`${x.sedinta ? `Anexă la ${x.sedinta}, ` : ""}punct tratat în ședință închisă a comitetului (Statut art. 272 lit. c).`),
      para(`Persoana cercetată: ${g.title.toLowerCase()} ${memberName(x.person)}.`),
      para("Abaterea constatată:"),
      pre(x.abatere || "—"),
      para("Răspunsul persoanei:"),
      pre(x.nuSaPrezentat ? `Nu s-a prezentat la audiere (art. 272 lit. b).${x.raspuns ? `\n${x.raspuns}` : ""}` : x.raspuns || "—"),
      para(`Sancțiunea: ${x.sanctiune}.`),
      para(`Încadrarea statutară: ${x.incadrare || "—"}.`),
      para(`Temeiul statutar: ${x.temei || "—"}.`),
      para(
        `Persoana are dreptul de a contesta hotărârea la ${x.comunitate || COMMUNITY_PLACEHOLDER} în termen de ${APPEAL_DAYS} zile de la comunicare (Statut art. 27 alin. 11).`,
      ),
      pastorSecretarySignatures(church),
    ],
  };
}

export interface SanctionNotice {
  person: { nume: string; prenume: string; gen: "M" | "F" | null };
  sanctiune: string;
  /** The decision's minutes: "procesul-verbal nr. 7/2026 din 12 martie 2026", or "". */
  sedinta: string;
  temei: string;
  /** The communication date (ISO): the appeal deadline is 15 days later. */
  comunicatLa: string;
  comunitate: string;
}

/** "Comunicarea sancțiunii" to the person (Statut art. 27 alin. 10), with the appeal deadline (alin. 11). Pure. */
export function sanctionNoticePrint(x: SanctionNotice, church: ChurchInfo): PrintSpec {
  const g = gendered(x.person);
  return {
    title: "Comunicarea sancțiunii",
    church,
    blocks: [
      { type: "title", text: "Comunicarea sancțiunii" },
      para(`${g.title} ${memberName(x.person)},`),
      para(
        `Vă comunicăm că, prin hotărârea comitetului Bisericii ${church.nume}${x.sedinta ? `, consemnată în ${x.sedinta}` : ""}, vi s-a aplicat sancțiunea: ${x.sanctiune.toLocaleLowerCase("ro-RO")}${x.temei ? `, în temeiul ${x.temei}` : ""} (Statutul Cultului Creștin Penticostal, art. 27 alin. 10).`,
      ),
      para(
        `Aveți dreptul de a contesta hotărârea la ${x.comunitate || COMMUNITY_PLACEHOLDER} în termen de ${APPEAL_DAYS} zile de la comunicare, adică până la data de ${fmtL(appealDeadline(x.comunicatLa))} inclusiv (art. 27 alin. 11).`,
      ),
      para(`Data comunicării: ${fmtL(x.comunicatLa)}`),
      pastorSecretarySignatures(church),
    ],
  };
}
