"use server";

import { personExportInput, personExportSchema } from "@/lib/schemas/person-export";
import { actionCtx } from "../session";
import { filteredSelectionIds } from "../queries/categories";

/** "Se exportă N persoane": the live count of the export page (nothing is exported here). */
export async function exportCountAction(formData: FormData): Promise<{ count: number } | { error: string }> {
  try {
    const ctx = await actionCtx("export");
    const parsed = personExportSchema.safeParse(personExportInput(formData));
    if (!parsed.success) return { count: 0 };
    const { categorie, mod, an, functie, gen, varsta } = parsed.data;
    return { count: (await filteredSelectionIds(ctx, { keys: categorie, year: an, functie }, mod, { gen, varsta })).length };
  } catch {
    return { error: "Numărul nu a putut fi calculat." };
  }
}
