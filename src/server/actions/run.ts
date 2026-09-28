import "server-only";
import { unstable_rethrow } from "next/navigation";
import type { z } from "zod";
import type { FormState } from "@/lib/form-state";
import { fieldErrors, formValues } from "@/lib/validation";
import { ActionError } from "../session";

/** Eroare de validare cu mesaje pe câmpuri. */
export class ValidationError extends Error {
  constructor(
    public errors: Record<string, string>,
    message = "Verificați câmpurile marcate.",
  ) {
    super(message);
  }
}

/**
 * Rulează corpul unei acțiuni de formular și transformă erorile în `FormState`:
 * - redirect()/notFound() trec mai departe (unstable_rethrow);
 * - ActionError / ValidationError devin mesaje pentru utilizator;
 * - orice altă eroare e jurnalizată și afișată generic.
 */
export async function runFormAction(formData: FormData | null, body: () => Promise<FormState | void>): Promise<FormState> {
  try {
    return (await body()) ?? { ok: true };
  } catch (error) {
    unstable_rethrow(error);
    const values = formData ? formValues(formData) : undefined;
    if (error instanceof ValidationError) return { message: error.message, errors: error.errors, values };
    if (error instanceof ActionError) return { message: error.message, values };
    if (isUniqueViolation(error)) {
      return { message: "Există deja o înregistrare cu aceste date (valoare duplicat).", values };
    }
    if (isNotFound(error)) return { message: "Înregistrarea nu mai există.", values };
    console.error("[action]", error);
    return { message: "A apărut o eroare neașteptată. Încercați din nou.", values };
  }
}

/** Validează cu zod sau aruncă ValidationError. */
export function parseOrThrow<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const r = schema.safeParse(input);
  if (!r.success) throw new ValidationError(fieldErrors(r.error));
  return r.data;
}

export function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";
}

export function isNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "P2025";
}
