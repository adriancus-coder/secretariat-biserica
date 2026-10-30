import "server-only";
import { parsePrototypeJson, toPrototypeJson, type Backup } from "@/domain/backup";
import { aliasesToJson, parseAliasesJson } from "@/lib/aliases-backup";
import { assetPhotosToJson, assetsToJson, assetSubcategoriesToJson, parseAssetPhotosJson, parseAssetsJson, parseAssetSubcategoriesJson } from "@/lib/asset-backup";
import { correspondenceToJson, parseCorrespondenceJson } from "@/lib/correspondence-backup";
import { generatedToJson, isDisciplineKind, parseGeneratedJson } from "@/lib/generated-backup";
import { isGeneratedKind } from "@/lib/generated-kinds";
import { externalParentsToJson, kinshipToJson, parseExternalParentsJson, parseKinshipJson } from "@/lib/kinship-backup";
import { applicationsToJson, parseApplicationsJson } from "@/lib/application-backup";
import { addMemberBaptism, parseMemberBaptism } from "@/lib/baptism-backup";
import { addMemberRegister, parseMemberRegister } from "@/lib/register-backup";
import { disciplineToJson, parseDisciplineJson } from "@/lib/discipline-backup";
import { parseCampaignsJson, parseConsentsJson } from "@/lib/consents-backup";
import { permissions } from "@/lib/permissions";
import { addDocumentExtras, parseDocumentExtras } from "@/lib/document-backup";
import { addMemberFamilies, familiesToJson, parseFamiliesJson } from "@/lib/families-backup";
import { addEventExtras, parseEventExtras } from "@/lib/event-backup";
import { addGroupExtras, parseGroupExtras } from "@/lib/group-backup";
import { addMeetingExtras, committeeToJson, parseCommitteeJson, parseMeetingExtras } from "@/lib/meeting-backup";
import { fromDbDate } from "@/lib/dates";
import { prisma } from "./db";
import { addMemberCommittee, addMemberRoles, parseRolesJson, roleGroupsToJson, rolesToJson } from "@/lib/roles-backup";
import {
  loadAliases,
  loadApplications,
  loadBackup,
  loadAssetsForBackup,
  loadCorrespondence,
  loadKinshipLinks,
  loadBaptism,
  loadRegister,
  loadDiscipline,
  loadCampaignsAndConsents,
  loadDocumentExtras,
  loadFamilies,
  loadEventExtras,
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
export async function buildExportJson(ctx: Ctx, opts: { photos?: boolean; originals?: boolean } = {}): Promise<{ data: Record<string, unknown>; churchName: string }> {
  // The Church row is not a tenant model: read by the session's church id.
  const c = await prisma.church.findUnique({
    where: { id: ctx.user.churchId },
    select: { comitetAlesLa: true, comitetAlegereMeetingId: true, comitetPrelungit: true },
  });
  const comitet = c ? committeeToJson({ ...c, comitetAlesLa: fromDbDate(c.comitetAlesLa) }) : undefined;
  const [backup, applications, roles, attendance, families, baptism, aliases, documentExtras, groupExtras, register, campaignData] = await Promise.all([
    loadBackup(ctx),
    loadApplications(ctx),
    loadRoles(ctx),
    loadMeetingExtras(ctx, { originals: opts.originals }),
    loadFamilies(ctx),
    loadBaptism(ctx),
    loadAliases(ctx),
    loadDocumentExtras(ctx),
    loadGroupExtras(ctx),
    loadRegister(ctx),
    loadCampaignsAndConsents(ctx),
  ]);
  const kinship = await loadKinshipLinks(ctx);
  const eventExtras = await loadEventExtras(ctx);
  const data = toPrototypeJson(backup);
  type Coll = Record<string, Record<string, unknown>>;
  addMemberFamilies(data.members as Coll, families.familyOf);
  addMeetingExtras(data.meetings as Coll, attendance);
  addDocumentExtras(data.documents as Coll, documentExtras);
  addGroupExtras(data.groups as Coll, groupExtras);
  addEventExtras(data.events as Coll, eventExtras);
  addMemberBaptism(data.members as Coll, baptism);
  addMemberRegister(data.members as Coll, register);
  addMemberRoles(data.members as Coll, roles.functii);
  // Contact data of persons who left reach only an administrator's export.
  if (!permissions.admin(ctx.user.role)) {
    for (const m of Object.values(data.members as Coll)) {
      if (m.dataIesire || m.statut === "Fost membru") Object.assign(m, { telefon: "", email: "", adresa: "", codPostal: "", localitate: "" });
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
      rudenii: kinshipToJson(kinship.links),
      parintiExterni: externalParentsToJson(kinship.externals),
      corespondenta: correspondenceToJson(await loadCorrespondence(ctx)),
      // GENERATED-EDIT: the disciplinary versions only in the files of users with `disciplina`.
      documenteGenerate: generatedToJson(
        (await ctx.db.generatedDocument.findMany({ orderBy: { sourceKey: "asc" } })).filter((g) => !isGeneratedKind(g.kind) || !isDisciplineKind(g.kind) || permissions.disciplina(ctx.user)),
      ),
      subcategoriiPatrimoniu: assetSubcategoriesToJson(await ctx.db.assetSubcategory.findMany({ orderBy: [{ categorie: "asc" }, { ordine: "asc" }] })),
      patrimoniu: assetsToJson(await loadAssetsForBackup(ctx)),
      // PATRIMONY-PHOTOS: only when asked ("Include pozele patrimoniului"): the file grows by about 4/3 of them.
      ...(opts.photos
        ? { patrimoniuPoze: assetPhotosToJson(await ctx.db.assetPhoto.findMany({ orderBy: [{ assetId: "asc" }, { ordine: "asc" }], select: { id: true, assetId: true, ordine: true, data: true } })) }
        : {}),
      campaigns: campaignData.campaigns,
      consents: campaignData.consents,
      ...(comitet ? { comitet } : {}),
      // Administrators only (Statut art. 27): a secretary's export carries no trace of discipline.
      ...(permissions.disciplina(ctx.user) ? { discipline: disciplineToJson(await loadDiscipline(ctx)) } : {}),
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
      events: parseEventExtras(raw),
      baptism: parseMemberBaptism(raw),
      register: parseMemberRegister(raw),
      discipline: parseDisciplineJson(raw),
      campaigns: parseCampaignsJson(raw),
      consents: parseConsentsJson(raw),
      aliases: parseAliasesJson(raw),
      kinship: parseKinshipJson(raw),
      externalParents: parseExternalParentsJson(raw),
      committee: parseCommitteeJson(raw),
      correspondence: parseCorrespondenceJson(raw),
      generated: parseGeneratedJson(raw),
      assets: parseAssetsJson(raw),
      assetPhotos: parseAssetPhotosJson(raw),
      assetSubcategories: parseAssetSubcategoriesJson(raw),
    },
    warnings: [...parsed.warnings, ...apps.warnings, ...roles.warnings],
  };
}
