import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NAV_ITEMS } from "@/components/shell/nav-items";
import { canOpen, SEARCH_INDEX, searchPages } from "./search-index";

const ADMIN = { role: "ADMIN" as const, isPastor: false };
const VIEWER = { role: "VIZUALIZARE" as const };
const PRAYER = { role: "RUGACIUNE" as const };

/** The section anchors of a page's own files (dialog titles `…-title` are not sections). */
function anchors(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".tsx"))
    .flatMap((f) => [...readFileSync(join(dir, f), "utf8").matchAll(/<h[23] id="([a-z0-9-]+)"/g)].map((m) => m[1]))
    .filter((id) => !id.endsWith("-title"));
}

describe("GLOBAL-SEARCH: the pages and settings index", () => {
  it("every route of the navigation has an entry", () => {
    for (const n of NAV_ITEMS) expect(SEARCH_INDEX.some((x) => x.href === n.href), n.href).toBe(true);
  });

  it("every section of Setări and Contul meu has an entry with its anchor", () => {
    for (const [dir, base] of [["src/app/(app)/setari", "/setari"], ["src/app/(app)/cont", "/cont"]] as const) {
      const ids = anchors(dir);
      expect(ids.length).toBeGreaterThan(3);
      for (const id of ids) expect(SEARCH_INDEX.some((x) => x.href === `${base}#${id}`), `${base}#${id}`).toBe(true);
    }
  });

  it("every entry leads to a page of the app", () => {
    for (const x of SEARCH_INDEX) {
      const path = x.href.split(/[?#]/)[0];
      const file = join("src/app/(app)", path === "/" ? "" : path, "page.tsx");
      expect(existsSync(file), x.href).toBe(true);
    }
  });

  it("the owner's synonyms find their place (without diacritics)", () => {
    const first = (q: string, who = ADMIN) => searchPages(q, who)[0]?.href;
    expect(first("marime text")).toBe("/cont#aspect");
    expect(first("litere mari")).toBe("/cont#aspect");
    expect(first("backup")).toBe("/setari/date");
    expect(first("restaurare")).toBe("/setari/date");
    expect(searchPages("2fa", ADMIN).map((x) => x.href)).toContain("/cont#securitate");
    expect(searchPages("cheie de acces", ADMIN).map((x) => x.href)).toContain("/cont#securitate");
    expect(first("notificari")).toBe("/cont#notificari");
    expect(first("sedinte")).toBe("/procese-verbale");
    expect(first("gdpr")).toBe("/setari#confidentialitate");
    expect(searchPages("subcategorii", ADMIN).map((x) => x.href)).toContain("/setari/patrimoniu");
    expect(searchPages("acces disciplina", ADMIN).map((x) => x.href)).toEqual(["/setari/utilizatori"]);
    expect(searchPages("neam", ADMIN).map((x) => x.href)).toEqual(expect.arrayContaining(["/de-verificat#rudenie", "/statistici/neamuri"]));
    expect(searchPages("whatsapp", ADMIN).map((x) => x.href)).toEqual(expect.arrayContaining(["/setari/actualizare-date", "/rugaciune"]));
    expect(first("raport anual")).toBe("/documente/nou?tip=raport");
    expect(first("registru intrare iesire")).toBe("/corespondenta");
    expect(searchPages("x", ADMIN).length).toBeGreaterThanOrEqual(0);
  });

  it("only what the role may open: Rugăciune gets its page and its account, Vizualizare no admin pages, discipline only with access", () => {
    const prayer = SEARCH_INDEX.filter((x) => canOpen(x, PRAYER)).map((x) => x.href.split("#")[0]);
    expect([...new Set(prayer)].sort()).toEqual(["/cont", "/rugaciune"]);
    expect(searchPages("backup", VIEWER)).toEqual([]);
    expect(searchPages("utilizatori", VIEWER)).toEqual([]);
    expect(searchPages("disciplina", ADMIN).map((x) => x.href)).not.toContain("/disciplina");
    expect(searchPages("disciplina", { role: "ADMIN", accesDisciplina: true }).map((x) => x.href)).toContain("/disciplina");
    expect(searchPages("marime text", PRAYER).map((x) => x.href)).toEqual(["/cont#aspect"]);
  });
});
