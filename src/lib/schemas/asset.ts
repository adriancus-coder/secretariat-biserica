import { z } from "zod";
import { optionalDate, optionalId, optionalInt, requiredDate, requiredText, text } from "../validation";

/** Fields tracked by the audit log (entity ASSET). */
export const ASSET_FIELDS = ["nrInventar", "denumire", "categorie", "subcategorie", "cantitate", "valoare", "dataIntrarii", "provenienta", "loc", "stare", "dataIesirii", "motivIesirii", "observatii", "responsabil"] as const;

/** A good of the inventory (PATRIMONY). Leaving use goes through `retireSchema`, never through this form. */
export const assetSchema = z.object({
  /** Empty = the next free inventory number. */
  nrInventar: optionalInt(1, 9999999),
  denumire: requiredText(200, "Denumirea lipsește.", "Denumirea"),
  categorie: requiredText(80, "Alegeți categoria.", "Categoria"),
  /** PATRIMONY-SUBCATEGORIES: optional, one of the category's subcategories (checked on the server). */
  subcategoryId: optionalId,
  cantitate: optionalInt(1, 1000000),
  valoare: optionalInt(0, 1000000000),
  dataIntrarii: optionalDate,
  provenienta: z.enum(["CUMPARARE", "DONATIE", "ALTELE"], { message: "Alegeți proveniența." }),
  loc: text(200, "Locul"),
  stare: z.enum(["BUN", "NECESITA_REPARATII"], { message: "Alegeți starea." }),
  observatii: text(2000, "Observațiile"),
  responsabil: text(120, "Responsabilul"),
  responsabilId: optionalId,
});

/** „Scoate din uz”: the date and the reason (the good stays in the inventory's history). */
export const retireSchema = z.object({
  dataIesirii: requiredDate("Data scoaterii din uz este obligatorie."),
  motivIesirii: requiredText(300, "Scrieți motivul.", "Motivul"),
});
