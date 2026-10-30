import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { memberName } from "@/lib/format";
import { tableSigners } from "@/lib/minutes-signatures";
import { documentPrint, eventPrint, groupPrint, meetingPrint, printToText, reportPrint } from "./print";

const church = {
  nume: "Maranata Stavanger",
  adresa: "Kongsgårdbakken 1",
  orgNr: "912 345 678",
  telefon: "+47 51 00 00 00",
  email: "secretariat@example.org",
  pastor: "Daniel Mureșan",
  secretar: "Ioana Pop",
};

describe("documente tipărite", () => {
  it("procesul-verbal urmează formatul bisericii (docs/samples/proces-verbal-model.md)", () => {
    const sample = readFileSync(join(process.cwd(), "docs/samples/proces-verbal-model.md"), "utf8");
    const expected = [...sample.matchAll(/```text\n([\s\S]*?)```/g)].at(-1)![1].trimEnd();
    const p = (prenume: string, nume: string) => ({ prenume, nume });
    const present = [p("Mihai", "Ionescu"), p("Daniel", "Mureșan"), p("Ioana", "Pop"), p("Ion", "Popescu"), p("Petru", "Ștefănescu")];
    const spec = meetingPrint(
      {
        nr: 16,
        tip: "Comitet",
        data: "2026-09-11",
        prezenti: present,
        absenti: [p("Emanuel", "Ciobanu")],
        // The secretary and the pastor sign at the bottom, not in the table (MINUTES-SIGNATURES).
        semnaturi: tableSigners(present, church).map((x) => ({
          name: memberName(x),
          image: x.prenume === "Mihai" ? new Uint8Array([1]) : null,
          signedAt: x.prenume === "Mihai" ? "11.09.2026 19:42" : null,
          ...(x.prenume === "Ion" ? { paper: true } : {}),
        })),
        semnatari: {
          SECRETAR: { name: "Ioana Pop", image: new Uint8Array([1]), note: "semnat 11.09.2026 19:50" },
          PASTOR: { name: "Daniel Mureșan", image: null, note: "semnat pe hârtie" },
        },
        invitati: "Lucia Avram",
        ordine: "",
        puncte: [
          "Ziua Recoltei va avea loc pe 4 octombrie, cu agapă comună.",
          "Seara de evanghelizare: invitat pastor Ioan Bunaciu.",
          "Conferința tinerilor se amână pentru primăvară.",
        ],
        observatii: "",
        formulaIncheiere: "Toate punctele au fost votate în unanimitate de membrii prezenți.",
      },
      church,
    );
    expect(printToText(spec).split("\n")).toEqual(expected.split("\n"));
  });

  it("Adunarea Generală: linia membrilor și a convocării, voturile sub fiecare punct, fără formula „în unanimitate”", () => {
    const lines = printToText(
      meetingPrint(
        {
          nr: 3,
          tip: "Adunare generală",
          data: "2026-03-15",
          prezenti: [{ prenume: "Ana", nume: "Pop" }],
          absenti: [],
          invitati: "",
          ordine: "",
          puncte: ["Darea de seamă", "Bugetul"],
          observatii: "",
          formulaIncheiere: "Toate punctele au fost votate în unanimitate de membrii prezenți.",
          adunare: "Membri cu drepturi depline: 40 · prezenți: 23 · convocată la 1 martie 2026 (14 zile înainte)",
          voturi: ["Votat: pentru 20, contra 2, abțineri 1 — adoptat", null],
        },
        church,
      ),
    ).split("\n");
    expect(lines.slice(1)).toEqual([
      "Proces verbal nr. 3",
      "Încheiat azi, 15.03.2026, cu ocazia ședinței de adunare generală.",
      "La ședință au fost prezenți: 1 membru.",
      "Pop Ana",
      "Membri cu drepturi depline: 40 · prezenți: 23 · convocată la 1 martie 2026 (14 zile înainte)",
      "În cadrul ședinței s-au discutat și aprobat următoarele:",
      "1. Darea de seamă",
      "Votat: pentru 20, contra 2, abțineri 1 — adoptat",
      "2. Bugetul",
      "Întocmit,",
      "Secretar | Pastor",
      "Ioana Pop | Daniel Mureșan",
      "Semnătura | Semnătura",
    ]);
  });

  it("procesul-verbal fără număr, cu cvorum, ordine de zi și observații", () => {
    const lines = printToText(
      meetingPrint(
        {
          nr: null,
          tip: "Adunare generală",
          data: "2026-01-26",
          prezenti: [{ prenume: "Ana", nume: "Pop" }],
          absenti: [],
          invitati: "",
          ordine: "1. Darea de seamă",
          puncte: [],
          observatii: "Discuții:\nS-a citit darea de seamă.",
          formulaIncheiere: "Încheiat și semnat.",
          cvorum: "Prezenți 1 din 2 (50 %)",
          inchisLa: "26.01.2026 20:15",
        },
        church,
      ),
    ).split("\n");
    expect(lines.slice(1)).toEqual([
      "Proces verbal",
      "Încheiat azi, 26.01.2026, cu ocazia ședinței de adunare generală.",
      "La ședință au fost prezenți: 1 membru.",
      "Pop Ana",
      "Cvorum: prezenți 1 din 2 (50 %)",
      "Ordinea de zi:",
      "1. Darea de seamă",
      "În cadrul ședinței s-au discutat și aprobat următoarele:",
      "Observații:",
      "Discuții:",
      "S-a citit darea de seamă.",
      "Încheiat și semnat.",
      "Întocmit,",
      "Secretar | Pastor",
      "Ioana Pop | Daniel Mureșan",
      "Semnătura | Semnătura",
      "Proces-verbal închis la 26.01.2026 20:15",
    ]);
  });

  it("documentul din registru: număr, titlu, text, semnături (inversate la darea de seamă)", () => {
    const adev = printToText(documentPrint({ tip: "adeverinta", nr: 7, data: "2026-04-10", text: "Text." }, church));
    expect(adev).toBe(
      ["Biserica Maranata Stavanger", "Nr. 7 din 10 aprilie 2026", "Adeverință", "Text.", "Pastor: Daniel Mureșan | Secretar: Ioana Pop"].join("\n"),
    );
    const scris = printToText(documentPrint({ tip: "scrisoare", nr: 8, data: "2026-04-11", text: "Către X," }, church));
    expect(scris).not.toContain("Adeverință");
    const rap = printToText(documentPrint({ tip: "raport", nr: 1, data: "2026-01-20", text: "R" }, church));
    expect(rap.endsWith("Secretar: Ioana Pop | Pastor: Daniel Mureșan")).toBe(true);
    expect(printToText(reportPrint(2025, "R", church))).toContain("Dare de seamă 2025");
  });

  it("lista grupului și fișa evenimentului", () => {
    const g = printToText(
      groupPrint(
        {
          nume: "Cor",
          responsabil: "Vasile Pop",
          membri: [
            { nume: "Pop", prenume: "Ioana", telefon: "+47 1" },
            { nume: "Popescu", prenume: "Maria", telefon: "" },
          ],
        },
        church,
      ),
    );
    expect(g).toContain("Responsabil: Vasile Pop\n1. Pop Ioana — +47 1\n2. Popescu Maria");
    const e = printToText(
      eventPrint(
        {
          titlu: "Ziua Recoltei",
          data: "2026-10-04",
          ora: "10:00",
          loc: "Sala bisericii",
          invitat: "",
          responsabil: "Daniel Mureșan",
          descriere: "",
          agapaActiva: true,
          agapaResponsabil: "Lucia Avram",
          agapaPersoane: 120,
          contributii: [{ cine: "Familia Pop", ce: "cozonac" }],
        },
        church,
      ),
    );
    expect(e).toContain("Data: 4 octombrie 2026, ora 10:00 · Loc: Sala bisericii");
    expect(e).toContain("Agapă — responsabil: Lucia Avram — aprox. 120 persoane\n• Familia Pop: cozonac");

    // EVENT-FIELDS-BY-TYPE: an empty place is the church, with its address; empty fields are left out.
    const atChurch = printToText(
      eventPrint(
        { titlu: "Botez", data: "2026-10-04", ora: "", loc: "", invitat: "", responsabil: "", oficiant: "Daniel Mureșan", descriere: "", agapaActiva: false, agapaResponsabil: "", agapaPersoane: null, contributii: [] },
        { ...church, codPostal: "4005", localitate: "Stavanger" },
      ),
    );
    expect(atChurch).toContain("Data: 4 octombrie 2026 · Loc: la biserică, Kongsgårdbakken 1, 4005 Stavanger");
    expect(atChurch).not.toContain("Invitat");
    expect(atChurch).not.toContain("Responsabil");
  });
});
