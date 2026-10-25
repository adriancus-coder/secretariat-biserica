import { z } from "zod";
import { isIsoDate } from "./dates";
import { APPLICATION_KINDS, APPLICATION_STATUSES, GENDERS, type ApplicationKindKey, type ApplicationStatusKey, type GenderKey } from "./labels";

/**
 * The `applications` collection of the JSON backup. It sits next to the prototype's collections
 * (parsed by src/domain/backup.ts, which ignores keys it does not know), so files from older
 * versions, without `applications`, import unchanged.
 */
export interface BApplication {
  id: string;
  status: ApplicationStatusKey;
  kind: ApplicationKindKey;
  nume: string;
  prenume: string;
  gen: GenderKey | null;
  dataNasterii: string | null;
  telefon: string;
  email: string;
  adresa: string;
  familie: string;
  rudenie: string;
  bisericaProvenienta: string;
  dataBotez: string | null;
  botezBiserica: string;
  botezLocalitate: string;
  botezOficiant: string;
  mesaj: string;
  consent: boolean;
  /** ISO timestamps. */
  createdAt: string;
  decidedAt: string | null;
  /** Id of the person (in `members`) created when the application was accepted. */
  membruId: string | null;
  motiv: string;
}

export function applicationsToJson(list: BApplication[]): Record<string, BApplication> {
  return Object.fromEntries(list.map((a) => [a.id, a]));
}

const str = (max: number) =>
  z.unknown().optional().transform((v) => (v === null || v === undefined || typeof v === "object" ? "" : String(v).trim().slice(0, max)));
const day = z.unknown().optional().transform((v) => (typeof v === "string" && isIsoDate(v.slice(0, 10)) ? v.slice(0, 10) : null));
const instant = z.unknown().optional().transform((v) => (typeof v === "string" && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null));

const entry = z.object({
  status: z.enum(APPLICATION_STATUSES),
  kind: z.enum(APPLICATION_KINDS),
  nume: str(100).pipe(z.string().min(1)),
  prenume: str(100),
  gen: z.unknown().optional().transform((v) => (GENDERS as readonly unknown[]).includes(v) ? (v as GenderKey) : null),
  dataNasterii: day,
  telefon: str(50),
  email: str(200),
  adresa: str(200),
  familie: str(100),
  rudenie: str(60),
  bisericaProvenienta: str(160),
  dataBotez: day,
  botezBiserica: str(160),
  botezLocalitate: str(160),
  botezOficiant: str(160),
  /** Older files: the single baptism place, read as the locality. */
  locBotez: str(160),
  mesaj: str(2000),
  consent: z.unknown().optional().transform((v) => v === true),
  createdAt: instant,
  decidedAt: instant,
  membruId: z.unknown().optional().transform((v) => (typeof v === "string" && v ? v : null)),
  motiv: str(500),
});

export interface ParsedApplications {
  /** null when the file has no `applications` collection. */
  applications: BApplication[] | null;
  errors: string[];
  warnings: string[];
}

export function parseApplicationsJson(root: unknown, memberIds: ReadonlySet<string>): ParsedApplications {
  const raw = typeof root === "object" && root !== null ? (root as Record<string, unknown>).applications : undefined;
  if (raw === undefined || raw === null) return { applications: null, errors: [], warnings: [] };
  const entries: [string, unknown][] = Array.isArray(raw)
    ? raw.map((x, i) => [String((x as { id?: unknown })?.id ?? i), x])
    : typeof raw === "object"
      ? Object.entries(raw as Record<string, unknown>)
      : [];
  const errors: string[] = [];
  const warnings: string[] = [];
  const applications: BApplication[] = [];
  const linked = new Set<string>();
  for (const [key, value] of entries) {
    const id = typeof (value as { id?: unknown })?.id === "string" ? (value as { id: string }).id : key;
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) {
      errors.push(`Cererea „${key}”: identificator invalid.`);
      continue;
    }
    const r = entry.safeParse(value);
    if (!r.success) {
      errors.push(`Cererea ${id}: date invalide (${r.error.issues.map((i) => i.path.join(".") || "?").join(", ")}).`);
      continue;
    }
    let membruId = r.data.membruId;
    if (membruId && (!memberIds.has(membruId) || linked.has(membruId))) {
      warnings.push(`Cererea ${id}: persoana legată nu există în fișier sau este legată de altă cerere; legătura a fost scoasă.`);
      membruId = null;
    }
    if (membruId) linked.add(membruId);
    const { locBotez, ...data } = r.data;
    applications.push({
      ...data,
      botezLocalitate: data.botezLocalitate || locBotez,
      id,
      membruId,
      createdAt: data.createdAt ?? new Date(0).toISOString(),
    });
  }
  return { applications, errors, warnings };
}
