import { z } from "zod";
import { idSchema } from "../validation";

/** The hidden field `aliasuri` of the import review: the "Nepotriviți" names matched by hand (JSON). */
export const pickedNamesSchema = z
  .array(z.object({ name: z.string().trim().min(1).max(200), personId: idSchema }))
  .max(200, "Prea multe nume alese.");

export function pickedNamesInput(formData: FormData): unknown {
  const raw = formData.get("aliasuri");
  if (typeof raw !== "string" || !raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
