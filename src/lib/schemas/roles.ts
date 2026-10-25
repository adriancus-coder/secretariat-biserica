import { ORDINATIONS } from "../officiants";
import { z } from "zod";
import { idSchema, optionalDate, optionalEnum, requiredText } from "../validation";

export const ROLE_NAME_MAX = 60;

/** Fields of a church role (an entry of a group) tracked by the audit log. */
export const ROLE_FIELDS = ["nume", "grup", "activ", "pozitie", "ordinat"] as const;
/** Fields of a role group tracked by the audit log. */
export const GROUP_FIELDS = ["grup", "activ", "pozitie"] as const;

export const roleSchema = z.object({
  nume: requiredText(ROLE_NAME_MAX, "Denumirea este obligatorie.", "Denumirea"),
  /** Statut art. 30: Diacon / Prezbiter / Pastor; empty = not an ordained ministry. */
  ordinat: optionalEnum(ORDINATIONS),
});

export const roleGroupSchema = z.object({
  nume: requiredText(ROLE_NAME_MAX, "Denumirea grupului este obligatorie.", "Denumirea"),
});

export type RoleInput = z.output<typeof roleSchema>;

/**
 * The person form sends its roles as one hidden field `functii` holding JSON
 * `[{ "id": "<roleId>", "din": "YYYY-MM-DD" | "" }]`, so the selection survives a validation error.
 */
export const personRolesSchema = z
  .preprocess(
    (v) => {
      if (v === null || v === undefined || v === "") return [];
      if (typeof v !== "string") return v;
      try {
        return JSON.parse(v);
      } catch {
        return v;
      }
    },
    z
      .array(z.object({ id: idSchema, din: optionalDate }), { error: "Lista de funcții este invalidă." })
      .max(50, "Prea multe funcții."),
  )
  .transform((list) => {
    const seen = new Set<string>();
    return list.filter((r) => !seen.has(r.id) && seen.add(r.id)).map((r) => ({ roleId: r.id, since: r.din }));
  });

export type PersonRolesInput = z.output<typeof personRolesSchema>;
