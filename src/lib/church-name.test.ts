import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { generateDocumentText } from "@/domain/documents";
import { documentPrint, eventPrint, groupPrint, meetingPrint, printApplicationPoster, printToText, reportPrint } from "@/domain/print";
import { churchTitle } from "./church-name";
import { consentFormPrint } from "./consent-form-print";
import { exclusionNoticePrint } from "./discipline-print";
import { DOCUMENT_TYPES } from "./labels";

const church = {
  nume: "Biserica Penticostală Maranata Stavanger",
  adresa: "Kongsgårdbakken 1",
  codPostal: "4005",
  localitate: "Stavanger",
  orgNr: "",
  telefon: "",
  email: "",
  pastor: "Dumitru Ciobanu",
  secretar: "Adrian Emanuel Cusniriuc",
};

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return f === "generated" ? [] : sourceFiles(p);
    return /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f) ? [p] : [];
  });
}

describe("MINUTES-SIGNATURES: the church's name once (churchTitle)", () => {
  it("adds „Biserica” only when the name does not start with it", () => {
    expect(churchTitle("Maranata Stavanger")).toBe("Biserica Maranata Stavanger");
    expect(churchTitle("Biserica Penticostală Maranata Stavanger")).toBe("Biserica Penticostală Maranata Stavanger");
    expect(churchTitle("  biserica Betel ")).toBe("biserica Betel");
    expect(churchTitle("")).toBe("Biserica");
    expect(churchTitle(null)).toBe("Biserica");
  });

  it("no generator writes the prefix by hand (src/ scan)", () => {
    const allowed = new Set(["src/lib/church-name.ts", "src/lib/privacy.ts"]);
    const offenders: string[] = [];
    for (const f of sourceFiles(join(process.cwd(), "src"))) {
      const rel = f.slice(process.cwd().length + 1);
      if (allowed.has(rel)) continue;
      readFileSync(f, "utf8")
        .split("\n")
        .forEach((line, i) => {
          // `Biserica ${…}` in a template, or „Biserica {…}” in JSX (the blank of an empty name aside).
          if (/Biserica \$\{|Biserica \{|"Biserica " \+/.test(line) && !line.includes("BLANK")) offenders.push(`${rel}:${i + 1}`);
        });
    }
    expect(offenders).toEqual([]);
  });

  it("no printed document says „Biserica Biserica”", () => {
    const person = {
      id: "p1",
      nume: "Pop",
      prenume: "Ana",
      gen: "F" as const,
      dataNasterii: "1990-01-01",
      familyId: null,
      rudenie: "",
      dataMembru: "2010-01-01",
      dataBotez: "2009-06-01",
      botezAn: 2009,
      locBotez: "Stavanger",
      botezBiserica: "Biserica Penticostală Maranata Stavanger",
      botezOficiant: "",
      dataBinecuvantare: null,
    };
    const specs = [
      meetingPrint({ nr: 1, tip: "Comitet", data: "2026-10-30", prezenti: [], absenti: [], invitati: "", ordine: "", puncte: ["Unu"], observatii: "", formulaIncheiere: "Gata." }, church),
      reportPrint(2026, "Text", church),
      groupPrint({ nume: "Corul", responsabil: "", membri: [] } as never, church),
      eventPrint({ titlu: "Botez", tip: "Botez", data: "2026-10-30", ora: "", loc: "", descriere: "" } as never, church),
      printApplicationPoster(church, "https://x.org/cerere/m", new Uint8Array([1])),
      consentFormPrint(church),
      exclusionNoticePrint({ person: { nume: "Pop", prenume: "Ana", gen: "F", dataNasterii: null }, data: "2026-10-01", procesVerbal: "", today: "2026-10-30", comunitate: "" } as never, church),
      ...DOCUMENT_TYPES.map((tip) =>
        documentPrint({ tip, nr: 1, data: "2026-10-30", text: generateDocumentText({ tip, person, family: [], church, catre: "", scop: "", reportText: "Raport" }) }, church),
      ),
    ];
    for (const spec of specs) {
      const text = printToText(spec);
      expect(text.split("\n")[0]).toBe("Biserica Penticostală Maranata Stavanger");
      expect(text).not.toMatch(/biserica\s+biserica/i);
    }
  });
});
