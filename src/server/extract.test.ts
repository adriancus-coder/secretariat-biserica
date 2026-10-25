import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import { apiErrorMessage, checkExtractFile, DEFAULT_EXTRACT_MODEL, extractDocument, ExtractError, type ExtractClient } from "./extract";
import { pdfPageCount } from "./extract-image";

function reply(json: unknown, stop: Anthropic.Beta.Messages.BetaMessage["stop_reason"] = "end_turn") {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: DEFAULT_EXTRACT_MODEL,
    content: [{ type: "text", text: typeof json === "string" ? json : JSON.stringify(json) }],
    stop_reason: stop,
    usage: { input_tokens: 1200, output_tokens: 150 },
  } as unknown as Anthropic.Beta.Messages.BetaMessage;
}

function mockClient(answer: Anthropic.Beta.Messages.BetaMessage) {
  const create = vi.fn().mockResolvedValue(answer);
  return { client: { beta: { messages: { create } } } as ExtractClient, create };
}

const pdf = { data: Buffer.from("%PDF-1.7 Ioana Pop secret") };
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]);

const person = {
  nume: "Enache",
  prenume: "Ruxandra",
  gen: "F",
  dataNasterii: "1994-11-11",
  dataBotez: "2012-06-03",
  botezAn: 2012,
  botezBiserica: null,
  botezLocalitate: null,
  botezOficiant: null,
  bisericaProvenienta: "Biserica Harul Cluj",
  telefon: "+47 951 22 333",
  email: null,
  adresa: null,
  kind: "TRANSFER",
};

const minutes = {
  nr: 16,
  data: "2026-09-11",
  tip: "comitet",
  prezenti: ["Mihai Ionescu", "Ioana Pop"],
  absenti: [],
  invitati: ["Lucia Avram"],
  puncte: ["Ziua Recoltei", "Evanghelizare"],
  formulaIncheiere: "Toate punctele au fost votate în unanimitate de membrii prezenți.",
  secretar: "Ioana Pop",
  pastor: "Daniel Mureșan",
};

afterEach(() => vi.restoreAllMocks());

describe("extractDocument", () => {
  it("returns a validated person draft and sends the document with a strict JSON schema", async () => {
    const { client, create } = mockClient(reply(person));
    expect(await extractDocument("persoana", pdf, client)).toEqual(person);
    const [body, options] = create.mock.calls[0];
    expect(body.model).toBe(DEFAULT_EXTRACT_MODEL);
    expect(body.output_config.format.type).toBe("json_schema");
    expect(body.output_config.format.schema.additionalProperties).toBe(false);
    expect(body.messages[0].content[0]).toMatchObject({ type: "document", source: { type: "base64", media_type: "application/pdf" } });
    expect(options).toMatchObject({ timeout: 30_000 });
  });

  it("returns a minutes draft for images", async () => {
    const { client, create } = mockClient(reply(minutes));
    const photo = await sharp({ create: { width: 60, height: 40, channels: 3, background: "#ffffff" } }).jpeg().toBuffer();
    expect(await extractDocument("proces-verbal", { data: photo }, client)).toEqual(minutes);
    expect(create.mock.calls[0][0].messages[0].content[0]).toMatchObject({ type: "image", source: { media_type: "image/jpeg" } });
  });

  it("rejects answers that are off-schema", async () => {
    for (const bad of [
      { ...person, extra: "x" },
      { ...person, dataNasterii: "11.11.1994" },
      { ...person, gen: "Feminin" },
      { ...minutes, nr: "16" },
      "nu este JSON",
    ]) {
      const { client } = mockClient(reply(bad));
      const kind = typeof bad === "object" && "puncte" in bad ? "proces-verbal" : "persoana";
      await expect(extractDocument(kind as "persoana", pdf, client)).rejects.toBeInstanceOf(ExtractError);
    }
  });

  it("stops on a refusal or a truncated answer", async () => {
    for (const stop of ["refusal", "max_tokens"] as const) {
      const { client } = mockClient(reply(person, stop));
      await expect(extractDocument("persoana", pdf, client)).rejects.toBeInstanceOf(ExtractError);
    }
  });

  it("refuses unsupported or oversized files before calling the API", async () => {
    const { client, create } = mockClient(reply(person));
    await expect(extractDocument("persoana", { data: Buffer.from("x") }, client)).rejects.toThrow("PDF sau poze");
    await expect(extractDocument("persoana", { data: Buffer.alloc(21 * 1024 * 1024) }, client)).rejects.toThrow("20 MB");
    // A JPEG renamed .pdf is refused (the bytes decide, not the name).
    expect(() => checkExtractFile(JPEG, "document")).toThrow("nu corespunde");
    expect(() => checkExtractFile(Buffer.from("%PDF-1.4"), "image")).toThrow("nu corespunde");
    // A broken GIF is recognised but cannot be opened.
    await expect(extractDocument("persoana", { data: Buffer.from("GIF89a....") }, client)).rejects.toThrow("nu a putut fi deschisă");
    expect(create).not.toHaveBeenCalled();
  });

  it("logs only the kind, the duration and the token counts", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const { client } = mockClient(reply(person));
    await extractDocument("persoana", pdf, client);
    const logged = JSON.stringify(info.mock.calls);
    expect(logged).toContain("1200");
    for (const secret of ["Enache", "Ruxandra", "Harul", "Ioana", "secret"]) expect(logged).not.toContain(secret);
  });

  it("without a key and without a client, says extraction is not configured", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    await expect(extractDocument("persoana", pdf)).rejects.toThrow("nu este configurată");
    vi.unstubAllEnvs();
  });
});

/** A minimal PDF with n pages (each page object plus the page tree's /Count). */
function pdfWithPages(n: number): Buffer {
  const kids = Array.from({ length: n }, (_, i) => `${i + 3} 0 R`).join(" ");
  const pages = Array.from({ length: n }, (_, i) => `${i + 3} 0 obj << /Type /Page /Parent 2 0 R >> endobj`).join("\n");
  return Buffer.from(`%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [${kids}] /Count ${n} >> endobj\n${pages}\n%%EOF`);
}

describe("extractDocument: phone photos and large files", () => {
  it("converts a HEIC photo to JPEG before sending it", async () => {
    const heic = readFileSync("tests/fixtures/photo-1200x1600.heic");
    expect(checkExtractFile(heic, "image")).toBe("image/heic");
    const { client, create } = mockClient(reply(minutes));
    await extractDocument("proces-verbal", { data: heic }, client);
    const sent = create.mock.calls[0][0].messages[0].content[0];
    expect(sent).toMatchObject({ type: "image", source: { type: "base64", media_type: "image/jpeg" } });
    const meta = await sharp(Buffer.from(sent.source.data, "base64")).metadata();
    expect(meta).toMatchObject({ format: "jpeg", width: 1200, height: 1600 });
  });

  it("converts WebP to JPEG and scales a 5 000 px photo down to 2 500 px", async () => {
    const big = await sharp({ create: { width: 5000, height: 3000, channels: 3, background: "#d0d0d0" } }).jpeg().toBuffer();
    const webp = await sharp({ create: { width: 800, height: 600, channels: 3, background: "#ffffff" } }).webp().toBuffer();
    for (const [data, width, height] of [
      [big, 2500, 1500],
      [webp, 800, 600],
    ] as const) {
      const { client, create } = mockClient(reply(minutes));
      await extractDocument("proces-verbal", { data }, client);
      const sent = create.mock.calls[0][0].messages[0].content[0];
      expect(sent.source.media_type).toBe("image/jpeg");
      expect(await sharp(Buffer.from(sent.source.data, "base64")).metadata()).toMatchObject({ format: "jpeg", width, height });
    }
  });

  it("applies the EXIF orientation", async () => {
    // A 400×200 photo stored with "rotate 90°" (orientation 6) is read as 200×400.
    const sideways = await sharp({ create: { width: 400, height: 200, channels: 3, background: "#ffffff" } }).webp().withMetadata({ orientation: 6 }).toBuffer();
    const { client, create } = mockClient(reply(minutes));
    await extractDocument("proces-verbal", { data: sideways }, client);
    const sent = create.mock.calls[0][0].messages[0].content[0];
    expect(await sharp(Buffer.from(sent.source.data, "base64")).metadata()).toMatchObject({ width: 200, height: 400 });
  });

  it("sends small JPEG and PNG files unchanged", async () => {
    const png = await sharp({ create: { width: 300, height: 200, channels: 3, background: "#ffffff" } }).png().toBuffer();
    const { client, create } = mockClient(reply(minutes));
    await extractDocument("proces-verbal", { data: png }, client);
    expect(create.mock.calls[0][0].messages[0].content[0].source).toMatchObject({ media_type: "image/png", data: png.toString("base64") });
  });

  it("refuses a PDF above 20 pages before calling the API", async () => {
    expect(pdfPageCount(pdfWithPages(25))).toBe(25);
    expect(pdfPageCount(pdfWithPages(3))).toBe(3);
    const { client, create } = mockClient(reply(person));
    await expect(extractDocument("persoana", { data: pdfWithPages(25) }, client)).rejects.toThrow("PDF-ul are 25 de pagini; se pot citi cel mult 20");
    expect(create).not.toHaveBeenCalled();
    await expect(extractDocument("persoana", { data: pdfWithPages(20) }, client)).resolves.toEqual(person);
  });

  it("maps each API error status to its message and logs only status and type", async () => {
    const cases: [number | "timeout", string][] = [
      [400, "Fișierul nu a fost acceptat (tip sau mărime). Încărcați un PDF sau o poză JPG/PNG."],
      [401, "Cheia de acces nu este validă (administrator)."],
      [403, "Cheia de acces nu este validă (administrator)."],
      [404, "Modelul configurat nu este disponibil (administrator)."],
      [429, "Prea multe cereri; reîncercați peste un minut."],
      [500, "Serviciul nu răspunde; reîncercați."],
      [529, "Serviciul nu răspunde; reîncercați."],
      ["timeout", "Serviciul nu răspunde; reîncercați."],
    ];
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const [status, message] of cases) {
      const error =
        status === "timeout"
          ? new Anthropic.APIConnectionTimeoutError()
          : Anthropic.APIError.generate(status, { type: "error", error: { type: "invalid_request_error", message: "Ioana Pop secret" } }, undefined, new Headers());
      const create = vi.fn().mockRejectedValue(error);
      await expect(extractDocument("persoana", pdf, { beta: { messages: { create } } })).rejects.toThrow(message);
      expect(apiErrorMessage(status === "timeout" ? undefined : status)).toBe(message);
    }
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).toContain('"status":400');
    expect(logged).toContain('"type":"invalid_request_error"');
    expect(logged).toContain('"status":"timeout"');
    for (const secret of ["Ioana", "secret", "%PDF"]) expect(logged).not.toContain(secret);
  });
});
