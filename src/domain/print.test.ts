import { describe, expect, it } from "vitest";
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
  it("procesul-verbal are formularea oficială din prototip", () => {
    const spec = meetingPrint(
      {
        titlu: "Planificare toamnă",
        tip: "Comitet",
        data: "2026-09-18",
        ora: "18:30",
        loc: "Sala mică",
        presedinte: "",
        invitati: "Lucia Avram",
        ordine: "1. Ziua Recoltei\n2. Evanghelizare",
        discutii: "",
        hotarari: "Se hotărăște agapă comună.",
        prezenti: ["Ionescu Mihai", "Popescu Ion"],
      },
      church,
    );
    expect(printToText(spec)).toBe(
      [
        "Biserica Maranata Stavanger",
        "Proces-verbal",
        "Încheiat astăzi, 18 septembrie 2026, ora 18:30, la Sala mică, cu ocazia ședinței de tip „Comitet” — Planificare toamnă.",
        "Prezenți (2): Ionescu Mihai, Popescu Ion. Invitați: Lucia Avram.",
        "Ordinea de zi:",
        "1. Ziua Recoltei\n2. Evanghelizare",
        "Hotărâri:",
        "Se hotărăște agapă comună.",
        "Drept care s-a încheiat prezentul proces-verbal.",
        // fără președinte de ședință, semnează pastorul
        "Președinte de ședință: Daniel Mureșan | Secretar: Ioana Pop",
      ].join("\n"),
    );
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
  });
});
