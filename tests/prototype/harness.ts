/**
 * Încarcă funcțiile originale din prototip (prototip/secretariat-biserica.html) într-un context
 * izolat `vm`, pentru teste diferențiale: aceleași date → același rezultat în prototip și în aplicație.
 *
 * Se extrag doar declarațiile de care avem nevoie (cu acorn, după nume), iar `today`, `$` și `val`
 * sunt înlocuite cu variante controlate de test.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import * as acorn from "acorn";

const HTML_PATH = fileURLToPath(new URL("../../prototip/secretariat-biserica.html", import.meta.url));

const WANTED = new Set([
  "MONTHS",
  "MONTHS_L",
  "fmt",
  "fmtL",
  "STATUS",
  "INTRARE",
  "IESIRE",
  "NOMEN_DEF",
  "nomen",
  "DTYPES",
  "memberName",
  "inYear",
  "stats",
  "reportText",
  "genDocText",
]);

let cachedSource: string | undefined;

function extractSource(): string {
  if (cachedSource) return cachedSource;
  const html = readFileSync(HTML_PATH, "utf8");
  const m = /<script>([\s\S]*?)<\/script>/.exec(html);
  if (!m) throw new Error("Scriptul prototipului nu a fost găsit");
  const script = m[1];
  const ast = acorn.parse(script, { ecmaVersion: "latest", sourceType: "script" }) as unknown as {
    body: { type: string; start: number; end: number; id?: { name: string }; declarations?: { id: { name?: string } }[] }[];
  };
  const parts: string[] = [];
  const found = new Set<string>();
  for (const node of ast.body) {
    if (node.type === "FunctionDeclaration" && node.id && WANTED.has(node.id.name)) {
      parts.push(script.slice(node.start, node.end));
      found.add(node.id.name);
    } else if (node.type === "VariableDeclaration" && node.declarations) {
      const names = node.declarations.map((d) => d.id.name).filter((n): n is string => Boolean(n));
      if (names.some((n) => WANTED.has(n))) {
        parts.push(script.slice(node.start, node.end));
        names.forEach((n) => found.add(n));
      }
    }
  }
  const missing = [...WANTED].filter((n) => !found.has(n));
  if (missing.length) throw new Error(`Lipsesc din prototip: ${missing.join(", ")}`);
  cachedSource = parts.join("\n");
  return cachedSource;
}

export interface FakeElement {
  value: string;
  dataset: Record<string, string>;
  addEventListener: () => void;
}

export interface PrototypeApi {
  S: {
    members: Record<string, Record<string, unknown>>;
    meetings: Record<string, Record<string, unknown>>;
    events: Record<string, Record<string, unknown>>;
    documents: Record<string, Record<string, unknown>>;
    groups: Record<string, unknown>;
    notes: Record<string, unknown>;
    settings: Record<string, unknown>;
  };
  stats: (year?: number) => Record<string, unknown> & {
    ev: { id: string }[];
    membri: { id: string }[];
    copii: { id: string }[];
    copiiMembri: { id: string }[];
    apart: { id: string }[];
    prieteni: { id: string }[];
    botezati: { id: string }[];
    intrTransfer: { id: string }[];
    intrBotez: { id: string }[];
    reprimiri: { id: string }[];
    iesiri: { id: string }[];
    binecuv: { id: string }[];
    nunti: { id: string }[];
    inmorm: { id: string }[];
    gen: { M: number; F: number };
    bands: [string, number][];
    fams: number;
    y: number;
    endDate: string;
  };
  reportText: (year: number) => string;
  genDocText: (auto: boolean, force?: boolean) => void;
  /** Câmpurile formularului de document (d_tip, d_mb, d_catre, d_scop, d_data). */
  form: Record<string, string>;
  /** Elementele #d_text și #d_titlu. */
  elements: { text: FakeElement; titlu: FakeElement };
}

export function loadPrototype(today: string): PrototypeApi {
  const form: Record<string, string> = {};
  const fake = (): FakeElement => ({ value: "", dataset: {}, addEventListener: () => {} });
  const elements = { text: fake(), titlu: fake() };
  const context = vm.createContext({
    __form: form,
    __elements: elements,
  });
  const prelude = `
    const S={members:{},meetings:{},events:{},documents:{},groups:{},notes:{},settings:{}};
    const today=()=>${JSON.stringify(today)};
    const val=id=>String(__form[id]??'').trim();
    const $=s=>s==='#d_text'?__elements.text:s==='#d_titlu'?__elements.titlu:null;
  `;
  const epilogue = `;({S,stats,reportText,genDocText})`;
  const api = vm.runInContext(prelude + extractSource() + epilogue, context) as Omit<PrototypeApi, "form" | "elements">;
  return { ...api, form, elements };
}
