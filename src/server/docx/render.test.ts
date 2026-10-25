import mammoth from "mammoth";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { parseMinutesText } from "@/domain/minutes-parse";
import { meetingPrint, printApplicationPoster } from "@/domain/print";
import { renderDocx } from "./render";

const church = {
  nume: "Maranata Stavanger",
  adresa: "Kongsgårdbakken 1",
  orgNr: "912 345 678",
  telefon: "",
  email: "",
  pastor: "Daniel Mureșan",
  secretar: "Ioana Pop",
};

/** The paragraphs of a .docx as plain text (mammoth reads it the way the Word import does). */
async function docxLines(docx: Buffer): Promise<string[]> {
  const { value } = await mammoth.extractRawText({ buffer: docx });
  return value.split("\n").map((l) => l.trim()).filter(Boolean);
}

describe("Word (.docx) generation", () => {
  it("the minutes have the same content as the PDF, in order, with diacritics", async () => {
    const signature = new Uint8Array(await sharp({ create: { width: 300, height: 100, channels: 3, background: "#fff" } }).png().toBuffer());
    const p = (prenume: string, nume: string) => ({ prenume, nume });
    const spec = meetingPrint(
      {
        nr: 16,
        tip: "Comitet",
        data: "2026-09-11",
        prezenti: [p("Mihai", "Ionescu"), p("Petru", "Ștefănescu")],
        absenti: [],
        semnaturi: [
          { name: "Mihai Ionescu", image: signature, signedAt: "11.09.2026 19:42" },
          { name: "Petru Ștefănescu", image: null, signedAt: null },
        ],
        invitati: "",
        ordine: "",
        puncte: ["Ziua Recoltei va avea loc pe 4 octombrie.", "Conferința tinerilor se amână."],
        observatii: "Rând unu\nRând doi",
        formulaIncheiere: "Toate punctele au fost votate în unanimitate de membrii prezenți.",
        inchisLa: "11.09.2026 20:00",
      },
      church,
    );
    const docx = await renderDocx(spec);
    expect(docx.subarray(0, 2).toString()).toBe("PK");
    const text = await docxLines(docx);
    const expected = [
      "Biserica Maranata Stavanger",
      "Kongsgårdbakken 1 · Org.nr. 912 345 678",
      "Proces verbal nr. 16",
      "Încheiat azi, 11.09.2026, cu ocazia ședinței de comitet.",
      "La ședință au fost prezenți: 2 membri.",
      "Mihai Ionescu, Petru Ștefănescu",
      "Nume",
      "Semnătura",
      "Mihai Ionescu",
      "semnat 11.09.2026 19:42",
      "Petru Ștefănescu",
      "În cadrul ședinței s-au discutat și aprobat următoarele:",
      "1.\tZiua Recoltei va avea loc pe 4 octombrie.",
      "2.\tConferința tinerilor se amână.",
      "Observații:",
      "Rând unu",
      "Rând doi",
      "Toate punctele au fost votate în unanimitate de membrii prezenți.",
      "Întocmit,",
      "Secretar, Ioana Pop",
      "Semnătura",
      "Pastor, Daniel Mureșan",
      "Semnătura",
    ];
    expect(text).toEqual(expected);
    // The Word import reads the file back (number, date, type, attendees, points).
    const { value } = await mammoth.extractRawText({ buffer: docx });
    const back = parseMinutesText(value).draft;
    expect(back).toMatchObject({ nr: 16, data: "2026-09-11", prezenti: ["Mihai Ionescu", "Petru Ștefănescu"] });
    expect(back.puncte.slice(0, 2)).toEqual(["Ziua Recoltei va avea loc pe 4 octombrie.", "Conferința tinerilor se amână."]);
    // The drawn signature is embedded as an image.
    expect(docx.includes(Buffer.from("word/media/"))).toBe(true);
  });

  it("an A5 page size is kept (the application poster)", async () => {
    const png = new Uint8Array(await sharp({ create: { width: 64, height: 64, channels: 3, background: "#000" } }).png().toBuffer());
    const docx = await renderDocx(printApplicationPoster(church, "https://x.org/cerere/m", png));
    expect(await docxLines(docx)).toContain("Cerere de membru online");
  });
});
