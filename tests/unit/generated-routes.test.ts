import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { GENERATED, GENERATED_KINDS } from "@/lib/generated-kinds";

/**
 * GENERATED-EDIT (CLAUDE.md): every document the app generates goes through the blocks, the shared
 * editor and GeneratedDocument — its route is a `generatedRoute("<kind>")`, the kind has a loader, a
 * source page links to „Previzualizează și editează”. The other file routes are listed here with the
 * reason they are not edited.
 */

const ROOT = join(__dirname, "../..");
const rel = (p: string) => relative(ROOT, p).split("\\").join("/");
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");

/** Category (a): own editor; category (c): not edited, with the reason. */
const EXCEPTIONS: Record<string, string> = {
  "src/app/pdf/document/[id]/route.ts": "(a) registered documents: their own editor, layout and approval",
  "src/app/pdf/document/[id]/word/route.ts": "(a) registered documents (Word)",
  "src/app/pdf/document/previzualizare/route.ts": "(a) the documents' preview",
  "src/app/pdf/proces-verbal/[id]/route.ts": "(a) minutes: their own editor and layout",
  "src/app/pdf/proces-verbal/[id]/word/route.ts": "(a) minutes (Word)",
  "src/app/pdf/proces-verbal/previzualizare/route.ts": "(a) the minutes' preview",
  "src/app/pdf/editare-document/previzualizare/route.ts": "the shared editor's preview itself",
  "src/app/pdf/note-pastorale/route.ts": "(c) pastoral notes: encrypted, never stored in another form (Statut art. 39 alin. 3)",
  "src/app/api/persoane/[id]/copie/route.ts": "(c) the art. 15 copy: the person's data exactly as stored",
  "src/app/api/persoane/export/route.ts": "(c) the person export: raw data lists (Excel / CSV / PDF list)",
};

describe("GENERATED-EDIT: every generated document is editable", () => {
  const generatedFiles = new Set(GENERATED_KINDS.map((k) => GENERATED[k].file));
  const loaders = read("src/server/generated.ts");
  const pages = files(join(ROOT, "src/app/(app)"))
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => read(rel(f)))
    .join("\n");

  it.each(GENERATED_KINDS.map((k) => [k] as const))("%s: route, loader, preview and save, a link on its source page", (kind) => {
    const meta = GENERATED[kind];
    expect(existsSync(join(ROOT, meta.file)), meta.file).toBe(true);
    expect(read(meta.file)).toContain(`generatedRoute("${kind}"`);
    expect(loaders).toMatch(new RegExp(`(^|\\s)"?${kind}"?: async`, "m"));
    expect(pages, `a page links ${kind}`).toMatch(new RegExp(`kind="${kind}"`));
  });

  it("the editor page, its preview and its save exist", () => {
    for (const f of ["src/app/(app)/editare-document/page.tsx", "src/app/(app)/editare-document/generated-editor.tsx", "src/app/pdf/editare-document/previzualizare/route.ts", "src/server/actions/generated.ts"]) {
      expect(existsSync(join(ROOT, f)), f).toBe(true);
    }
    expect(read("src/server/actions/generated.ts")).toMatch(/export async function saveGeneratedAction/);
  });

  it("every other route that produces a PDF or Word file is a listed exception", () => {
    const routes = [...files(join(ROOT, "src/app/pdf")), ...files(join(ROOT, "src/app/api"))].map(rel).filter((f) => f.endsWith("route.ts"));
    for (const f of routes) {
      const code = read(f);
      const producesFile = /renderPdf\(|renderDocx\(|generatedRoute\(/.test(code);
      if (!producesFile) continue;
      expect(generatedFiles.has(f) || f in EXCEPTIONS, `${f}: a generated document must use generatedRoute (or be listed with its reason)`).toBe(true);
    }
    for (const f of Object.keys(EXCEPTIONS)) expect(existsSync(join(ROOT, f)), f).toBe(true);
  });
});
