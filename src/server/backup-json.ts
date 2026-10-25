import "server-only";
import { parsePrototypeJson, toPrototypeJson, type Backup } from "@/domain/backup";
import { aliasesToJson, parseAliasesJson } from "@/lib/aliases-backup";
import { applicationsToJson, parseApplicationsJson } from "@/lib/application-backup";
import { addMemberBaptism, parseMemberBaptism } from "@/lib/baptism-backup";
import { addMemberRegister, parseMemberRegister } from "@/lib/register-backup";
import { disciplineToJson, parseDisciplineJson } from "@/lib/discipline-backup";
import { parseCampaignsJson, parseConsentsJson } from "@/lib/consents-backup";
import { permissions } from "@/lib/permissions";
import { addDocumentExtras, parseDocumentExtras } from "@/lib/document-backup";
import { addMemberFamilies, familiesToJson, parseFamiliesJson } from "@/lib/families-backup";
import { addGroupExtras, parseGroupExtras } from "@/lib/group-backup";
import { addMeetingExtras, parseMeetingExtras } from "@/lib/meeting-backup";
import { addMemberCommittee, addMemberRoles, parseRolesJson, roleGroupsToJson, rolesToJson } from "@/lib/roles-backup";
import {
  loadAliases,
  loadApplications,
  loadBackup,
  loadBaptism,
  loadRegister,
  loadDiscipline,
  loadCampaignsAndConsents,
  loadDocumentExtras,
  loadFamilies,
  loadGroupExtras,
  loadMeetingExtras,
  loadRoles,
  type ImportExtras,
} from "./backup";
import type { Ctx } from "./session";

/**
 * The church's full JSON backup (the prototype's format plus the app's own collections and fields),
 * as POST /api/export sends it; shared with the tests. Returns the object and the church's name.
 */
export async function buildExportJson(ctx: Ctx): Promise<{ data: Record<string, unknown>; churchName: string }> {
  const [backup, applications, roles, attendance, families, baptism, aliases, documentExtras, groupExtras, register, campaignData] = await Promise.all([
    loadBackup(ctx),
    loadApplications(ctx),
    loadRoles(ctx),
    loadMeetingExtras(ctx),
    loadFamilies(ctx),
    loadBaptism(ctx),
    loadAliases(ctx),
    loadDocumentExtras(ctx),
    loadGroupExtras(ctx),
    loadRegister(ctx),
    loadCampaignsAndConsents(ctx),
  ]);
  const data = toPrototypeJson(backup);
  type Coll = Record<string, Record<string, unknown>>;
  addMemberFamilies(data.members as Coll, families.familyOf);
  addMeetingExtras(data.meetings as Coll, attendance);
  addDocumentExtras(data.documents as Coll, documentExtras);
  addGroupExtras(data.groups as Coll, groupExtras);
  addMemberBaptism(data.members as Coll, baptism);
  addMemberRegister(data.members as Coll, register);
  addMemberRoles(data.members as Coll, roles.functii);
  // Contact data of persons who left reach only an administrator's export.
  if (!permissions.admin(ctx.user.role)) {
    for (const m of Object.values(data.members as Coll)) {
      if (m.dataIesire || m.statut === "Fost membru") Object.assign(m, { telefon: "", email: "", adresa: "" });
    }
  }
  addMemberCommittee(data.members as Coll, roles.committee);
  return {
    data: {
      ...data,
      applications: applicationsToJson(applications),
      roleGroups: roleGroupsToJson(roles.groups),
      roles: rolesToJson(roles.roles),
      families: familiesToJson(families.families),
      aliases: aliasesToJson(aliases),
      campaigns: campaignData.campaigns,
      consents: campaignData.consents,
      // Administrators only (Statut art. 27): a secretary's export carries no trace of discipline.
      ...(permissions.disciplina(ctx.user.role) ? { discipline: disciplineToJson(await loadDiscipline(ctx)) } : {}),
    },
    churchName: backup.settings?.nume ?? "",
  };
}

export type ParsedImport =
  | { ok: false; errors: string[] }
  | { ok: true; backup: Backup; extras: Omit<ImportExtras, "textFamilies">; warnings: string[] };

/** A JSON backup checked and split into the prototype's data and the app's extras (nothing written). */
export function parseImportJson(raw: unknown): ParsedImport {
  const parsed = parsePrototypeJson(raw);
  if (!parsed.ok) return { ok: false, errors: parsed.errors };
  const apps = parseApplicationsJson(raw, new Set(parsed.backup.members.map((m) => m.id)));
  if (apps.errors.length) return { ok: false, errors: apps.errors };
  const roles = parseRolesJson(raw);
  const families = parseFamiliesJson(raw);
  const extraErrors = [...roles.errors, ...families.errors];
  if (extraErrors.length) return { ok: false, errors: extraErrors };
  return {
    ok: true,
    backup: parsed.backup,
    extras: {
      applications: apps.applications,
      roles,
      families,
      meetings: parseMeetingExtras(raw),
      documents: parseDocumentExtras(raw),
      groups: parseGroupExtras(raw),
      baptism: parseMemberBaptism(raw),
      register: parseMemberRegister(raw),
      discipline: parseDisciplineJson(raw),
      campaigns: parseCampaignsJson(raw),
      consents: parseConsentsJson(raw),
      aliases: parseAliasesJson(raw),
    },
    warnings: [...parsed.warnings, ...apps.warnings, ...roles.warnings],
  };
}
