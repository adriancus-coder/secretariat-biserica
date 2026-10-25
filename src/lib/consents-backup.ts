/**
 * Data-update campaigns and consents in the JSON backup: `campaigns` (name, deadline, state, notice
 * version; never tokens) and `consents` (member, kind, answer, date, source, parent, withdrawal).
 * Personal links and submissions are not exported. Files without them import unchanged.
 */
import { isIsoDate } from "./dates";
import { CONSENT_KINDS, type ConsentKindKey } from "./labels";

export interface BCampaign {
  id: string;
  nume: string;
  deadline: string;
  stare: "ACTIVE" | "CLOSED";
  versiuneNota: string;
}

export interface BConsent {
  membru: string;
  tip: ConsentKindKey;
  acord: boolean;
  versiune: string;
  /** ISO timestamp. */
  data: string;
  sursa: "ONLINE" | "PAPER" | "STAFF";
  datDe: string | null;
  retrasLa: string | null;
}

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const ts = (v: unknown) => (typeof v === "string" && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null);
const list = (root: unknown, key: string) => {
  const v = typeof root === "object" && root !== null ? (root as Record<string, unknown>)[key] : undefined;
  return Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null) : null;
};

export function parseCampaignsJson(root: unknown): BCampaign[] | null {
  const l = list(root, "campaigns");
  if (!l) return null;
  return l
    .filter((c) => typeof c.id === "string" && ID.test(c.id) && typeof c.nume === "string" && typeof c.deadline === "string" && isIsoDate(c.deadline))
    .map((c) => ({
      id: c.id as string,
      nume: (c.nume as string).slice(0, 120),
      deadline: c.deadline as string,
      stare: c.stare === "ACTIVE" ? "ACTIVE" : "CLOSED",
      versiuneNota: typeof c.versiuneNota === "string" ? c.versiuneNota.slice(0, 64) : "",
    }));
}

export function parseConsentsJson(root: unknown): BConsent[] | null {
  const l = list(root, "consents");
  if (!l) return null;
  const out: BConsent[] = [];
  for (const c of l) {
    const data = ts(c.data);
    if (typeof c.membru !== "string" || !ID.test(c.membru) || !(CONSENT_KINDS as readonly unknown[]).includes(c.tip) || typeof c.acord !== "boolean" || !data) continue;
    out.push({
      membru: c.membru,
      tip: c.tip as ConsentKindKey,
      acord: c.acord,
      versiune: typeof c.versiune === "string" ? c.versiune.slice(0, 64) : "",
      data,
      sursa: c.sursa === "PAPER" || c.sursa === "STAFF" ? c.sursa : "ONLINE",
      datDe: typeof c.datDe === "string" && ID.test(c.datDe) ? c.datDe : null,
      retrasLa: ts(c.retrasLa),
    });
  }
  return out;
}
