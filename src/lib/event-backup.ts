import type { EventPersonRole } from "./event-persons";

/**
 * EVENT-PERSONS in the JSON backup: on each event, `familie` (the file's family id) and `persoane`
 * (`{ membru, numeLiber, rol, aplicatLa }`, membru = the file's member id). Files without them import
 * unchanged; a person or family the target church does not have is dropped (a free name stays only
 * for the bride and groom).
 */

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const ROLES: readonly EventPersonRole[] = ["COPIL", "BOTEZAT", "MIRE", "MIREASA", "DECEDAT"];

export interface EventExtra {
  familie: string | null;
  persoane: { membru: string | null; numeLiber: string; rol: EventPersonRole; aplicatLa: string | null }[];
}

export function addEventExtras(events: Record<string, Record<string, unknown>>, extra: ReadonlyMap<string, EventExtra>) {
  for (const [id, x] of extra) {
    const e = events[id];
    if (!e) continue;
    if (x.familie) e.familie = x.familie;
    if (x.persoane.length) e.persoane = x.persoane;
  }
}

/** Event id → its family and persons, as in the file (malformed entries dropped). */
export function parseEventExtras(root: unknown): Map<string, EventExtra> {
  const out = new Map<string, EventExtra>();
  const c = typeof root === "object" && root !== null ? (root as Record<string, unknown>).events : undefined;
  if (!c || typeof c !== "object") return out;
  const entries: [string, unknown][] = Array.isArray(c) ? c.map((x, i) => [String((x as { id?: unknown })?.id ?? i), x]) : Object.entries(c);
  for (const [key, raw] of entries) {
    if (typeof raw !== "object" || raw === null) continue;
    const e = raw as Record<string, unknown>;
    const familie = typeof e.familie === "string" && ID_RE.test(e.familie) ? e.familie : null;
    const persoane: EventExtra["persoane"] = [];
    if (Array.isArray(e.persoane)) {
      for (const p of e.persoane.slice(0, 30)) {
        if (typeof p !== "object" || p === null) continue;
        const r = p as Record<string, unknown>;
        const rol = ROLES.find((x) => x === r.rol);
        if (!rol) continue;
        const membru = typeof r.membru === "string" && ID_RE.test(r.membru) ? r.membru : null;
        const numeLiber = !membru && (rol === "MIRE" || rol === "MIREASA") && typeof r.numeLiber === "string" ? r.numeLiber.trim().slice(0, 160) : "";
        if (!membru && !numeLiber) continue;
        const aplicatLa = typeof r.aplicatLa === "string" && !Number.isNaN(Date.parse(r.aplicatLa)) ? r.aplicatLa : null;
        persoane.push({ membru, numeLiber, rol, aplicatLa });
      }
    }
    if (familie || persoane.length) out.set(key, { familie, persoane });
  }
  return out;
}
