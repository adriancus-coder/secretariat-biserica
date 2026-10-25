import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";
import { sniffFileType, type SniffedType } from "@/lib/file-type";
import {
  EXTRACT_MAX_BYTES,
  minutesDraftJsonSchema,
  minutesDraftSchema,
  personDraftJsonSchema,
  personDraftSchema,
  type MinutesDraft,
  type PersonDraft,
} from "@/lib/schemas/extract";
import { ExtractInputError, prepareUpload, type HeicDecoder } from "./extract-image";

/**
 * Reading scanned documents and photos with the Claude API: a minutes page becomes a minutes
 * draft, a transfer certificate or membership application becomes a person draft. Only the
 * document kind, the duration and the token counts are logged, never the content.
 */

/** A current Sonnet-class model; EXTRACT_MODEL overrides it. */
export const DEFAULT_EXTRACT_MODEL = "claude-sonnet-5-5";
const TIMEOUT_MS = 30_000;

export function isExtractConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

export function extractModel(): string {
  return process.env.EXTRACT_MODEL?.trim() || DEFAULT_EXTRACT_MODEL;
}

/** The message the user sees (Romanian, no technical details). */
export class ExtractError extends Error {}

export type ExtractKind = "proces-verbal" | "persoana";

/** The part of the SDK client used here (tests pass a mock). */
export interface ExtractClient {
  beta: {
    messages: {
      create(
        body: Anthropic.Beta.Messages.MessageCreateParamsNonStreaming,
        options?: { timeout?: number; maxRetries?: number },
      ): PromiseLike<Anthropic.Beta.Messages.BetaMessage>;
    };
  };
}

const PROMPTS: Record<ExtractKind, string> = {
  "proces-verbal": `Documentul atașat este un proces-verbal al unei ședințe de biserică (scanat sau fotografiat).
Extrage datele în formatul cerut:
- nr: numărul procesului-verbal, dacă apare;
- data: data ședinței, ca AAAA-LL-ZZ;
- tip: tipul ședinței, așa cum apare după „cu ocazia ședinței de” (de exemplu „comitet”);
- prezenti, absenti, invitati: numele persoanelor exact cum sunt scrise, câte unul pe element;
- puncte: punctele discutate și aprobate, în ordine, fără numerele din față;
- formulaIncheiere: fraza de încheiere (de exemplu „Toate punctele au fost votate …”);
- secretar, pastor: numele celor care semnează.
Copiază textul așa cum este scris. Când o informație lipsește sau nu se poate citi sigur, pune null (sau listă goală). Nu inventa nimic.`,
  persoana: `Documentul atașat este un certificat de transfer de la altă biserică sau o cerere de membru (scanat sau fotografiat).
Extrage datele persoanei în formatul cerut: nume (de familie), prenume, gen (M sau F), data nașterii și data botezului ca AAAA-LL-ZZ, biserica, localitatea și cine a oficiat botezul (fiecare separat, null dacă nu scrie), biserica de proveniență, telefon, e-mail, adresă, iar kind: TRANSFER pentru un certificat de transfer, BOTEZ pentru o cerere de botez.
Copiază textul așa cum este scris. Când o informație lipsește sau nu se poate citi sigur, pune null. Nu inventa nimic.`,
};

const SCHEMAS = {
  "proces-verbal": { json: minutesDraftJsonSchema, zod: minutesDraftSchema },
  persoana: { json: personDraftJsonSchema, zod: personDraftSchema },
} as const;

export interface ExtractInput {
  data: Buffer;
  /** HEIC decoder override (tests). */
  decodeHeic?: HeicDecoder;
}

/**
 * The file's real type, from its first bytes (never the browser's claim); size and type checked. A
 * file named as a document but holding a photo, or the other way round, is refused; a HEIC photo
 * named .jpg is fine (it is converted anyway).
 */
export function checkExtractFile(data: Uint8Array, declared: "document" | "image" | "" = ""): SniffedType {
  if (!data.length) throw new ExtractError("Alegeți un fișier.");
  if (data.length > EXTRACT_MAX_BYTES) throw new ExtractError("Fișierul depășește 20 MB.");
  const type = sniffFileType(data);
  if (!type) throw new ExtractError("Se pot citi doar fișiere PDF sau poze (JPG, PNG, HEIC, WebP, GIF, TIFF).");
  const kind = type === "application/pdf" ? "document" : "image";
  if (declared && declared !== kind) {
    throw new ExtractError("Conținutul fișierului nu corespunde tipului său (de exemplu, o poză redenumită .pdf). Încărcați fișierul original.");
  }
  return type;
}

/** What the user sees when the API call fails, by HTTP status (no technical details). */
export function apiErrorMessage(status: number | undefined): string {
  if (status === 400 || status === 413) return "Fișierul nu a fost acceptat (tip sau mărime). Încărcați un PDF sau o poză JPG/PNG.";
  if (status === 401 || status === 403) return "Cheia de acces nu este validă (administrator).";
  if (status === 404) return "Modelul configurat nu este disponibil (administrator).";
  if (status === 429) return "Prea multe cereri; reîncercați peste un minut.";
  return "Serviciul nu răspunde; reîncercați.";
}

/** The API's error type ("invalid_request_error", "overloaded_error"…), safe to log. */
function apiErrorType(error: InstanceType<typeof Anthropic.APIError>): string | undefined {
  const body = error.error as { error?: { type?: unknown }; type?: unknown } | undefined;
  const type = body?.error?.type ?? body?.type;
  return typeof type === "string" ? type.slice(0, 60) : undefined;
}

let defaultClient: Anthropic | undefined;

export async function extractDocument(kind: "proces-verbal", input: ExtractInput, client?: ExtractClient): Promise<MinutesDraft>;
export async function extractDocument(kind: "persoana", input: ExtractInput, client?: ExtractClient): Promise<PersonDraft>;
export async function extractDocument(kind: ExtractKind, input: ExtractInput, client?: ExtractClient): Promise<MinutesDraft | PersonDraft> {
  if (!client && !isExtractConfigured()) throw new ExtractError("Extragerea din imagini nu este configurată.");
  const sniffed = checkExtractFile(input.data);
  let prepared;
  try {
    prepared = await prepareUpload(input.data, sniffed, input.decodeHeic);
  } catch (error) {
    if (error instanceof ExtractInputError) throw new ExtractError(error.message);
    throw error;
  }
  const { mediaType } = prepared;
  const api: ExtractClient = client ?? (defaultClient ??= new Anthropic());
  const data = prepared.data.toString("base64");
  const source: Anthropic.Beta.Messages.BetaContentBlockParam =
    mediaType === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
      : { type: "image", source: { type: "base64", media_type: mediaType, data } };
  const started = Date.now();
  let message: Anthropic.Beta.Messages.BetaMessage;
  try {
    message = await api.beta.messages.create(
      {
        model: extractModel(),
        max_tokens: 16000,
        // A declined request is retried server-side on Anthropic's recommended fallback model.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { format: { type: "json_schema", schema: SCHEMAS[kind].json } },
        messages: [{ role: "user", content: [source, { type: "text", text: PROMPTS[kind] }] }],
      },
      { timeout: TIMEOUT_MS, maxRetries: 1 },
    );
  } catch (error) {
    // Only the kind, the duration, the status and the API error type; never the file or the answer.
    const api = error instanceof Anthropic.APIError ? error : undefined;
    const status = api && typeof api.status === "number" ? api.status : undefined;
    console.warn("[extract]", { kind, ms: Date.now() - started, status: status ?? (error instanceof Anthropic.APIConnectionTimeoutError ? "timeout" : "network"), type: api ? apiErrorType(api) : undefined });
    throw new ExtractError(apiErrorMessage(status));
  }
  console.info("[extract]", {
    kind,
    sent: mediaType,
    steps: prepared.steps,
    ms: Date.now() - started,
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
    stop: message.stop_reason,
  });
  if (message.stop_reason === "refusal") throw new ExtractError("Documentul nu a putut fi citit.");
  if (message.stop_reason === "max_tokens") throw new ExtractError("Documentul este prea lung pentru a fi citit dintr-o dată.");
  return parseDraft(SCHEMAS[kind].zod, message);
}

/** The model's JSON answer, validated again: anything off-schema is refused. */
function parseDraft<S extends z.ZodType>(schema: S, message: Anthropic.Beta.Messages.BetaMessage): z.output<S> {
  const text = message.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ExtractError("Documentul nu a putut fi citit.");
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new ExtractError("Datele citite din document nu au forma așteptată.");
  return parsed.data;
}
