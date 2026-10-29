import { permissions, type Permission, type Who } from "./permissions";

/*
 * GENERATED-EDIT: every document the app generates from its data and lets the user preview, edit and
 * save (the registered documents and the minutes have their own editors). Each kind keeps the
 * permission of its PDF route; `discipline` kinds also need the step-up and are never shown to anyone
 * else; `official` acts can be registered as numbered documents (Documente + the correspondence register).
 * The route of each kind serves the saved version when there is one. Pure.
 */

export const GENERATED_KINDS = [
  "eveniment",
  "grup",
  "dare-de-seama",
  "statistici",
  "neamuri",
  "patrimoniu",
  "corespondenta",
  "formular-acorduri",
  "afis-cerere",
  "afis-actualizare",
  "disciplina-convocare",
  "disciplina-comunicare",
  "disciplina-informare",
  "disciplina-proces-verbal",
] as const;
export type GeneratedKind = (typeof GENERATED_KINDS)[number];

export interface GeneratedKindMeta {
  label: string;
  /** The permission of the source route (opening, preview, download). */
  permission: Permission;
  /** Disciplinary data (Statut art. 27): `disciplina` + step-up, audited as DISCIPLINE without content. */
  discipline?: boolean;
  /** An official act: „Înregistrează” gives it a number in Documente (pastor approval, register). */
  official?: boolean;
  /** The PDF route; `id` for the kinds of one record. */
  route: (id: string) => string;
  /** The query parameters the route reads (kept by the editor's links). */
  params: readonly string[];
  /** The route file (src/app/pdf/…/route.ts), checked by generated-routes.test.ts. */
  file: string;
}

const disc = (part: string, label: string, official: boolean): GeneratedKindMeta => ({
  label,
  permission: "disciplina",
  discipline: true,
  official,
  route: (id) => `/pdf/disciplina/${id}/${part}`,
  params: ["id"],
  file: `src/app/pdf/disciplina/[id]/${part}/route.ts`,
});

export const GENERATED: Record<GeneratedKind, GeneratedKindMeta> = {
  eveniment: { label: "Fișa evenimentului", permission: "read", route: (id) => `/pdf/eveniment/${id}`, params: ["id"], file: "src/app/pdf/eveniment/[id]/route.ts" },
  grup: { label: "Lista grupului", permission: "read", route: (id) => `/pdf/grup/${id}`, params: ["id"], file: "src/app/pdf/grup/[id]/route.ts" },
  "dare-de-seama": { label: "Dare de seamă", permission: "read", route: () => "/pdf/dare-de-seama", params: ["an"], file: "src/app/pdf/dare-de-seama/route.ts" },
  statistici: { label: "Statistici", permission: "read", route: () => "/pdf/statistici", params: ["an", "sort", "dir"], file: "src/app/pdf/statistici/route.ts" },
  neamuri: { label: "Neamuri", permission: "read", route: () => "/pdf/neamuri", params: ["sort", "dir"], file: "src/app/pdf/neamuri/route.ts" },
  patrimoniu: {
    label: "Inventarul bunurilor",
    permission: "read",
    route: () => "/pdf/patrimoniu",
    params: ["filtru", "categorie", "sub", "q", "sort", "dir", "poze"],
    file: "src/app/pdf/patrimoniu/route.ts",
  },
  corespondenta: { label: "Registru de intrare-ieșire", permission: "read", route: () => "/pdf/corespondenta", params: ["an", "filtru", "q", "sort", "dir"], file: "src/app/pdf/corespondenta/route.ts" },
  "formular-acorduri": { label: "Formular de acorduri", permission: "write", route: () => "/pdf/formular-acorduri", params: [], file: "src/app/pdf/formular-acorduri/route.ts" },
  "afis-cerere": { label: "Afișul cererii de membru", permission: "write", route: () => "/pdf/afis-cerere", params: [], file: "src/app/pdf/afis-cerere/route.ts" },
  "afis-actualizare": { label: "Afișul actualizării datelor", permission: "write", route: (id) => `/pdf/afis-actualizare/${id}`, params: ["id"], file: "src/app/pdf/afis-actualizare/[id]/route.ts" },
  "disciplina-convocare": disc("convocare", "Convocare la audiere", true),
  "disciplina-comunicare": disc("comunicare", "Comunicarea sancțiunii", true),
  "disciplina-informare": disc("informare", "Informare privind excluderea", true),
  "disciplina-proces-verbal": disc("proces-verbal", "PV disciplinar", false),
};

export function isGeneratedKind(v: unknown): v is GeneratedKind {
  return typeof v === "string" && (GENERATED_KINDS as readonly string[]).includes(v);
}

/** The kind's parameters out of a query (unknown ones dropped, values bounded). */
export function kindParams(kind: GeneratedKind, sp: URLSearchParams): URLSearchParams {
  const out = new URLSearchParams();
  for (const k of GENERATED[kind].params) {
    const v = sp.get(k);
    if (v) out.set(k, v.slice(0, 120));
  }
  return out;
}

/** The PDF route with its parameters (`extra`: format=word, date=1). */
export function generatedFileUrl(kind: GeneratedKind, params: URLSearchParams, extra: Record<string, string> = {}): string {
  const q = new URLSearchParams(params);
  const id = q.get("id") ?? "";
  q.delete("id");
  for (const [k, v] of Object.entries(extra)) q.set(k, v);
  const qs = q.toString();
  return `${GENERATED[kind].route(id)}${qs ? `?${qs}` : ""}`;
}

/** The editor's page for a source. */
export function generatedEditorUrl(kind: GeneratedKind, params: URLSearchParams): string {
  const q = new URLSearchParams(params);
  q.set("sursa", kind);
  return `/editare-document?${q.toString()}`;
}

/** Who may save, remake or register a version: the source's permission, plus a write role (a viewer previews only). */
export function canSaveGenerated(kind: GeneratedKind, who: Who): boolean {
  const meta = GENERATED[kind];
  return permissions[meta.permission](who) && (meta.discipline === true || permissions.write(who));
}

/** The parameters that tell two versions of a kind apart (the sort and the photos do not). */
const KEY_PARAMS: Record<GeneratedKind, readonly string[]> = {
  eveniment: ["id"],
  grup: ["id"],
  "dare-de-seama": ["an"],
  statistici: ["an"],
  neamuri: [],
  patrimoniu: ["filtru", "categorie", "sub", "q"],
  corespondenta: ["an", "filtru", "q"],
  "formular-acorduri": [],
  "afis-cerere": [],
  "afis-actualizare": ["id"],
  "disciplina-convocare": ["id"],
  "disciplina-comunicare": ["id"],
  "disciplina-informare": ["id"],
  "disciplina-proces-verbal": ["id"],
};

/** The saved version's key: "eveniment:<id>", "statistici:2026", "patrimoniu:in-uz:Mobilier::" … */
export function generatedKey(kind: GeneratedKind, p: Record<string, string | number | null | undefined>): string {
  return [kind, ...KEY_PARAMS[kind].map((k) => String(p[k] ?? ""))].join(":");
}
