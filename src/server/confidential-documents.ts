import "server-only";
import { permissions, type Who } from "@/lib/permissions";

/*
 * GENERATED-EDIT: a registered disciplinary act is a `confidential` document. Only users with the
 * `disciplina` permission see it anywhere (lists, the register, search, the person page, the backup);
 * its page and files also ask for the step-up. For everyone else it does not exist.
 */

/** The `where` part for document lists: confidential ones only for `disciplina`. */
export function visibleDocumentsWhere(who: Who): { confidential?: false } {
  return permissions.disciplina(who) ? {} : { confidential: false };
}

/** A document found by id, as the user may see it (null = as if it did not exist). */
export function visibleDocument<T extends { confidential: boolean }>(who: Who, doc: T | null): T | null {
  return doc && (!doc.confidential || permissions.disciplina(who)) ? doc : null;
}
