import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";
import {
  EXTRACT_MAX_BYTES,
  EXTRACT_MEDIA_TYPES,
  minutesDraftJsonSchema,
  minutesDraftSchema,
  personDraftJsonSchema,
  personDraftSchema,
  type ExtractMediaType,
  type MinutesDraft,
  type PersonDraft,
} from "@/lib/schemas/extract";

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
Extrage datele persoanei în formatul cerut: nume (de familie), prenume, gen (M sau F), data nașterii și data botezului ca AAAA-LL-ZZ, locul botezului, biserica de proveniență, telefon, e-mail, adresă, iar kind: TRANSFER pentru un certificat de transfer, BOTEZ pentru o cerere de botez.
Copiază textul așa cum este scris. Când o informație lipsește sau nu se poate citi sigur, pune null. Nu inventa nimic.`,
};

const SCHEMAS = {
  "proces-verbal": { json: minutesDraftJsonSchema, zod: minutesDraftSchema },
  persoana: { json: personDraftJsonSchema, zod: personDraftSchema },
} as const;

export interface ExtractInput {
  mediaType: string;
  data: Buffer;
}

export function checkExtractFile(file: { size: number; type: string }): ExtractMediaType {
  if (!file.size) throw new ExtractError("Alegeți un fișier.");
  if (file.size > EXTRACT_MAX_BYTES) throw new ExtractError("Fișierul depășește 20 MB.");
  const type = (EXTRACT_MEDIA_TYPES as readonly string[]).find((t) => t === file.type);
  if (!type) throw new ExtractError("Se pot citi doar fișiere PDF, JPG sau PNG.");
  return type as ExtractMediaType;
}

let defaultClient: Anthropic | undefined;

export async function extractDocument(kind: "proces-verbal", input: ExtractInput, client?: ExtractClient): Promise<MinutesDraft>;
export async function extractDocument(kind: "persoana", input: ExtractInput, client?: ExtractClient): Promise<PersonDraft>;
export async function extractDocument(kind: ExtractKind, input: ExtractInput, client?: ExtractClient): Promise<MinutesDraft | PersonDraft> {
  if (!client && !isExtractConfigured()) throw new ExtractError("Extragerea din imagini nu este configurată.");
  const mediaType = checkExtractFile({ size: input.data.length, type: input.mediaType });
  const api: ExtractClient = client ?? (defaultClient ??= new Anthropic());
  const data = input.data.toString("base64");
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
    console.warn("[extract]", { kind, ms: Date.now() - started, error: error instanceof Anthropic.APIError ? error.status : "network" });
    if (error instanceof Anthropic.APIConnectionTimeoutError) throw new ExtractError("Citirea documentului a durat prea mult. Încercați din nou.");
    if (error instanceof Anthropic.RateLimitError) throw new ExtractError("Serviciul de citire este ocupat. Încercați din nou peste un minut.");
    throw new ExtractError("Documentul nu a putut fi citit. Încercați din nou.");
  }
  console.info("[extract]", {
    kind,
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
