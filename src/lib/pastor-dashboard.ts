import { mandateState } from "./committee";
import { addDays } from "./dates";
import { fmtL } from "./format";

/**
 * The texts of the pastor's cards on Acasă (Statut art. 23, 27, 39, 45, 46). Each card has a big
 * value, a short line under it and the list it opens. Pure.
 */
export interface DashCard {
  title: string;
  value: string;
  detail: string;
  href: string;
  /** Needs attention (shown with the accent). */
  alert?: boolean;
}

/** Mandatul comitetului (art. 45): until when, "soon" from 6 months before, expired. */
export function mandateCard(today: string, alesLa: string | null, prelungit: boolean): Pick<DashCard, "value" | "detail" | "alert"> {
  if (!alesLa) return { value: "—", detail: "Data alegerii nu este completată (Setări).", alert: true };
  const s = mandateState(today, alesLa, prelungit);
  if (s.state === "expired") return { value: "Expirat", detail: `la ${fmtL(s.end)}${prelungit ? "" : "; poate fi prelungit o dată cu 5 ani"}`, alert: true };
  return { value: `până la ${fmtL(s.end)}`, detail: `ales la ${fmtL(alesLa)}${prelungit ? ", prelungit" : ""}`, alert: s.state === "soon" };
}

/** Adunarea Generală ordinară a anului (art. 46 alin. 3): held (with the date) or not yet. */
export function assemblyCard(today: string, held: readonly string[]): Pick<DashCard, "value" | "detail" | "alert"> {
  const year = today.slice(0, 4);
  const last = [...held].sort().at(-1);
  if (last) return { value: "Ținută", detail: `la ${fmtL(last)}` };
  return { value: "Nu încă", detail: `în ${year} nu există proces-verbal de Adunare Generală ordinară`, alert: Number(today.slice(5, 7)) >= 10 };
}

/** Aniversări this month (only those who agreed): the count and who is next in 7 days. */
export function birthdaysCard(today: string, people: readonly { name: string; dataNasterii: string }[]): Pick<DashCard, "value" | "detail"> {
  const end = addDays(today, 7);
  const next = people
    .map((p) => ({ name: p.name, day: `${today.slice(0, 4)}${p.dataNasterii.slice(4)}` }))
    .filter((p) => p.day >= today && p.day <= end)
    .sort((a, b) => a.day.localeCompare(b.day));
  return {
    value: String(people.length),
    detail: next.length ? `în 7 zile: ${next.slice(0, 3).map((p) => `${p.name} (${Number(p.day.slice(8))})`).join(", ")}${next.length > 3 ? "…" : ""}` : "niciuna în următoarele 7 zile",
  };
}

/**
 * "Acces la disciplină" (Statut art. 44 lit. d): who besides the pastors sees the disciplinary measures,
 * by a pastor's decision; opens the setting.
 */
export function disciplineAccessCard(names: readonly string[]): Pick<DashCard, "value" | "detail"> {
  return { value: String(names.length), detail: names.length ? names.join(", ") : "doar pastorii" };
}
