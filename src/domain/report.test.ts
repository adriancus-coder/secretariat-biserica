import { describe, expect, it } from "vitest";
import { buildReportText } from "./report";
import { computeStats } from "./stats";
import { event, person } from "./test-helpers";

describe("darea de seamă anuală", () => {
  const persons = [
    person({ nume: "Popescu", prenume: "Ion", familie: "Popescu", dataNasterii: "1975-04-02", dataMembru: "2001-06-10", dataBotez: "2001-06-10" }),
    person({ nume: "Popescu", prenume: "Maria", familie: "Popescu", dataNasterii: "1978-11-20", dataMembru: "2003-05-01", dataBotez: "1996-07-07" }),
    person({ nume: "Popescu", prenume: "Andrei", statut: "COPIL", familie: "Popescu", dataNasterii: "2020-03-15", dataBinecuvantare: "2025-09-02" }),
    person({ nume: "Munteanu", prenume: "Daniel", familie: "Munteanu", dataNasterii: "2000-12-12", dataMembru: "2025-04-20", modIntrare: "BOTEZ", dataBotez: "2025-04-20" }),
    person({ nume: "Stan", prenume: "Ioana", dataNasterii: "1999-01-01", dataMembru: "2025-06-01", modIntrare: "TRANSFER", bisericaProvenienta: "Biserica Harul Cluj" }),
    person({ nume: "Barbu", prenume: "Petru", statut: "PRIETEN", dataNasterii: "1960-02-29", createdAt: "2021-03-01" }),
    person({ nume: "Ionescu", prenume: "Elena", statut: "APARTINATOR", familie: "Ionescu", dataNasterii: "1990-01-01", dataMembru: "2018-01-01", dataBotez: "2010-08-15" }),
    person({ nume: "Lungu", prenume: "Mihai", statut: "FOST_MEMBRU", dataNasterii: "1985-05-05", dataMembru: "2010-01-01", dataBotez: "2010-01-01", dataIesire: "2025-02-01", modIesire: "TRANSFER", bisericaDestinatie: "Biserica Betel Oslo" }),
  ];
  const events = [
    event({ tip: "Nuntă", data: "2025-07-11", titlu: "Munteanu–Stan" }),
    event({ tip: "Înmormântare", data: "2025-05-08", titlu: "Ana Avram" }),
    event({ tip: "Evanghelizare", data: "2025-03-01" }),
  ];

  it("reproduce formatul din prototip", () => {
    const s = computeStats(persons, events, { year: 2025, today: "2026-09-28" });
    const text = buildReportText(2025, s, { evenimente: 3, sedinte: 4, documente: 7 });
    expect(text).toBe(
      [
        "SITUAȚIA MEMBRALĂ LA 31.12.2025, prezentată de secretar",
        "",
        "Total membri: 4, din care:",
        "  ✓ 1 botezați în 2025 (Munteanu Daniel)",
        "  ✓ 1 veniți cu transfer (Stan Ioana)",
        "Copii ai membrilor sub 18 ani: 1",
        "",
        "Situația persoanelor în evidență:",
        "- 1 copii minori",
        "- 4 botezați, din care 1 aparținători",
        "- 1 prieteni ai casei Domnului, nebotezați",
        "- 3 familii",
        "Total persoane în evidență: 7",
        "",
        "În anul 2025 au avut loc: o binecuvântare de copil (Popescu Andrei); un botez nou-testamentar (Munteanu Daniel); o nuntă (Munteanu–Stan); o înmormântare (Ana Avram).",
        "Ieșiri din evidență în 2025: Lungu Mihai (Transfer, Biserica Betel Oslo).",
        "",
        "Activitate: 3 evenimente înregistrate în calendar, 4 ședințe consemnate în procese-verbale, 7 documente eliberate.",
      ].join("\n"),
    );
  });

  it("fără evenimente și ieșiri, rândurile respective lipsesc; pluralele sunt corecte", () => {
    const s = computeStats(persons, [], { year: 2019, today: "2026-09-28" });
    const text = buildReportText(2019, s, { evenimente: 0, sedinte: 0, documente: 0 });
    expect(text).not.toContain("au avut loc");
    expect(text).not.toContain("Ieșiri din evidență");
    expect(text).not.toContain("✓");

    const many = computeStats(
      [
        person({ nume: "A", dataBotez: "2024-01-01" }),
        person({ nume: "B", dataBotez: "2024-02-01", dataBinecuvantare: "2024-02-01" }),
        person({ nume: "C", dataBinecuvantare: "2024-03-01" }),
      ],
      [event({ tip: "Nuntă", data: "2024-05-05", titlu: "N1" }), event({ tip: "Nuntă", data: "2024-06-06", titlu: "N2" })],
      { year: 2024, today: "2026-09-28" },
    );
    const t2 = buildReportText(2024, many, { evenimente: 2, sedinte: 0, documente: 0 });
    expect(t2).toContain("2 binecuvântări de copii (B, C)");
    expect(t2).toContain("botezuri nou-testamentare (A, B)");
    expect(t2).toContain("2 nunți (N1, N2)");
    expect(t2).toContain("  ✓ 2 botezați în 2024 (A, B)");
  });

  it("ieșire fără mod precizat", () => {
    const s = computeStats([person({ nume: "X", dataIesire: "2024-01-01" })], [], { year: 2024, today: "2026-09-28" });
    expect(buildReportText(2024, s, { evenimente: 0, sedinte: 0, documente: 0 })).toContain(
      "Ieșiri din evidență în 2024: X (ieșire).",
    );
  });
});
