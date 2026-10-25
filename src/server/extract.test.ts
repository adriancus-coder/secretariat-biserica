import { afterEach, describe, expect, it, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { checkExtractFile, DEFAULT_EXTRACT_MODEL, extractDocument, ExtractError, type ExtractClient } from "./extract";

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
    expect(await extractDocument("proces-verbal", { data: JPEG }, client)).toEqual(minutes);
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
    await expect(extractDocument("persoana", { data: Buffer.from("x") }, client)).rejects.toThrow("PDF, JPG sau PNG");
    await expect(extractDocument("persoana", { data: Buffer.alloc(21 * 1024 * 1024) }, client)).rejects.toThrow("20 MB");
    // A JPEG renamed .pdf is refused (the bytes decide, not the name).
    expect(() => checkExtractFile(JPEG, "application/pdf")).toThrow("nu corespunde");
    // Bytes that are none of the three types are refused whatever the name or the claimed type.
    await expect(extractDocument("persoana", { data: Buffer.from("GIF89a....") }, client)).rejects.toThrow("PDF, JPG sau PNG");
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
