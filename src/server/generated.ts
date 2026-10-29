import "server-only";
import { createHash } from "node:crypto";
import { notFound, redirect } from "next/navigation";
import { eventPrint, groupPrint, printApplicationPoster, reportPrint, type PrintSpec } from "@/domain/print";
import { consentFormPrint } from "@/lib/consent-form-print";
import { registerPrint } from "@/lib/correspondence";
import { fromDbDate, todayIso } from "@/lib/dates";
import { disciplinaryMinutesPrint, exclusionNoticePrint, hearingConvocationPrint, sanctionNoticePrint } from "@/lib/discipline-print";
import { fmtL, memberName } from "@/lib/format";
import { blocksFingerprintText, resolveStored, storedBlocksOf, type StoredBlock } from "@/lib/generated-blocks";
import { asOfDay, stableJson } from "@/lib/source-data";
import { GENERATED, generatedKey, kindParams, type GeneratedKind } from "@/lib/generated-kinds";
import { neamPrint } from "@/lib/kinship-report";
import { DISCIPLINARY_FORM_LABEL } from "@/lib/labels";
import { storedLayout } from "@/lib/page-layout";
import { inventoryPrint } from "@/lib/patrimony";
import { statisticsPrint } from "@/lib/statistics-report";
import { requestedYear } from "@/lib/statistics-params";
import { idSchema } from "@/lib/validation";
import { applicationQrPng, applicationUrl } from "./application-link";
import { exportAssets } from "./assets-export";
import { exportRegister } from "./correspondence-export";
import { renderDocx, docxResponse } from "./docx/render";
import { loadKinship } from "./kinship";
import { loadMeasureForPrint } from "./pdf/discipline";
import { pdfFileName, pdfResponse, renderPdf } from "./pdf/render";
import { getCampaign } from "./queries/campaigns";
import { getChurch } from "./queries/church";
import { getEvent } from "./queries/events";
import { getGroup } from "./queries/groups-notes";
import { reportSource, reportTextOf } from "./queries/stats";
import { statisticsFrom } from "./queries/statistics";
import { loadCategoryInput } from "./queries/categories";
import { requireCtx, type Ctx } from "./session";
import { hasStepUp } from "./step-up";

/*
 * GENERATED-EDIT: the sources of the generated documents. Each loader builds the document exactly as
 * its PDF route did before (same PrintSpec, same file name), and names the version it may be saved
 * under (`key`; null = not editable, e.g. the inventory with photos). The caller holds the kind's
 * permission (requireCtx / actionCtx with GENERATED[kind].permission).
 */

export interface LoadedSource {
  spec: PrintSpec;
  /** The saved version's key ("eveniment:<id>", "statistici:2026"…); null = not editable. */
  key: string | null;
  /** The file name's base (pdfFileName). */
  fileBase: string;
  /** Where the editor goes back to. */
  backHref: string;
  /** An official act's person (the registered document's `persoana` / `catre`). */
  person?: { id: string; name: string };
  /**
   * GENERATED-HASH-STABLE: the data the document is made of, as read from the database (never the
   * date of printing): its fingerprint tells whether a saved version is still current.
   */
  data: unknown;
}

const yearOf = (raw: string | null) => {
  const an = Number(raw);
  return Number.isInteger(an) && an > 1800 && an < 2201 ? an : Number(todayIso().slice(0, 4));
};
const validId = (sp: URLSearchParams) => {
  const id = sp.get("id") ?? "";
  return idSchema.safeParse(id).success ? id : null;
};
const sorted = (sp: URLSearchParams) => ({ sort: sp.get("sort"), dir: sp.get("dir") });

const FILTERS = ["filtru", "categorie", "sub", "q"] as const;

/** The church's details a document prints (letterhead, signatures, the Comunitate). */
const churchData = (c: Awaited<ReturnType<typeof getChurch>>) => ({
  nume: c.nume,
  adresa: c.adresa,
  codPostal: c.codPostal,
  localitate: c.localitate,
  orgNr: c.orgNr,
  telefon: c.telefon,
  email: c.email,
  pastor: c.pastor,
  secretar: c.secretar,
  comunitate: c.comunitate,
  slug: c.slug,
});

type Loader = (ctx: Ctx, sp: URLSearchParams) => Promise<LoadedSource | null>;

const LOADERS: Record<GeneratedKind, Loader> = {
  eveniment: async (ctx, sp) => {
    const id = validId(sp);
    if (!id) return null;
    const [e, church] = await Promise.all([getEvent(ctx, id), getChurch(ctx)]);
    if (!e) return null;
    const event = {
        titlu: e.titlu,
        data: e.data,
        ora: e.ora,
        loc: e.loc,
        invitat: e.invitat,
        responsabil: e.responsabil,
        oficiant: e.oficiant,
        descriere: e.descriere,
        agapaActiva: e.agapaActiva,
        agapaResponsabil: e.agapaResponsabil,
        agapaPersoane: e.agapaPersoane,
        contributii: e.contributii,
      };
    const spec = eventPrint(event, church);
    return { spec, key: generatedKey("eveniment", { id }), fileBase: `${e.data}-${e.titlu}`, backHref: `/calendar/${id}`, data: { event, church: churchData(church) } };
  },
  grup: async (ctx, sp) => {
    const id = validId(sp);
    if (!id) return null;
    const [g, church] = await Promise.all([getGroup(ctx, id), getChurch(ctx)]);
    if (!g) return null;
    const group = { nume: g.nume, responsabil: g.responsabilName, membri: g.membri };
    return { spec: groupPrint(group, church), key: generatedKey("grup", { id }), fileBase: `grup-${g.nume}`, backHref: `/grupuri/${id}`, data: { group, church: churchData(church) } };
  },
  "dare-de-seama": async (ctx, sp) => {
    const year = yearOf(sp.get("an"));
    // The year is in the key; the data are the register's records (the current year's figures follow today).
    const [source, church] = await Promise.all([reportSource(ctx, year), getChurch(ctx)]);
    const spec = reportPrint(year, reportTextOf(source, todayIso()), church);
    return { spec, key: generatedKey("dare-de-seama", { an: year }), fileBase: `dare-de-seama-${year}`, backHref: `/?an=${year}`, data: { source, church: churchData(church) } };
  },
  statistici: async (ctx, sp) => {
    const [input, church] = await Promise.all([loadCategoryInput(ctx), getChurch(ctx)]);
    const d = statisticsFrom(input, requestedYear(sp.get("an")), todayIso());
    // The tables in the order the page shows them (?sort=<table>.<column>&dir=); the year is in the key.
    return {
      spec: statisticsPrint(d, church, sorted(sp)),
      key: generatedKey("statistici", { an: d.year }),
      fileBase: `statistici-${d.year}`,
      backHref: `/statistici?an=${d.year}`,
      // The register's records without the day of printing (`today` stays out of the fingerprint).
      data: { year: d.year, input: { ...input, today: undefined }, church: churchData(church) },
    };
  },
  neamuri: async (ctx, sp) => {
    const [kin, church] = await Promise.all([loadKinship(ctx.db), getChurch(ctx)]);
    return { spec: neamPrint(kin.neamuri, church, sorted(sp)), key: generatedKey("neamuri", {}), fileBase: "neamuri", backHref: "/statistici/neamuri", data: { neamuri: kin.neamuri, families: kin.families, church: churchData(church) } };
  },
  patrimoniu: async (ctx, sp) => {
    const today = todayIso();
    const [rows, church] = await Promise.all([exportAssets(ctx, sp), getChurch(ctx)]);
    // „Cu poze” (`poze=1`): the thumbnail of each good's main photo; by default without photos. Not editable.
    const withPhotos = sp.get("poze") === "1";
    const ids = rows.map((r) => r.photoId).filter((x): x is string => Boolean(x));
    const photos = withPhotos ? new Map((await ctx.db.assetPhoto.findMany({ where: { id: { in: ids } }, select: { id: true, thumb: true } })).map((p) => [p.id, new Uint8Array(p.thumb)])) : undefined;
    const back = new URLSearchParams(Object.fromEntries(FILTERS.flatMap((k) => (sp.get(k) ? [[k, sp.get(k)!]] : []))));
    return {
      spec: inventoryPrint(rows, today, church, sorted(sp), photos),
      key: withPhotos ? null : generatedKey("patrimoniu", Object.fromEntries(FILTERS.map((k) => [k, sp.get(k)]))),
      fileBase: `inventar-${today}${withPhotos ? "-cu-poze" : ""}`,
      backHref: `/patrimoniu${back.toString() ? `?${back}` : ""}`,
      // The goods (not the inventory's date: the list does not depend on it), in a stable order.
      data: { rows: [...rows].sort((a, b) => a.nrInventar - b.nrInventar), church: churchData(church) },
    };
  },
  corespondenta: async (ctx, sp) => {
    const [{ an, rows }, church] = await Promise.all([exportRegister(ctx, sp), getChurch(ctx)]);
    return {
      spec: registerPrint(rows, an, church, sorted(sp)),
      key: generatedKey("corespondenta", { an, filtru: sp.get("filtru"), q: sp.get("q") }),
      fileBase: `registru-intrare-iesire-${an}`,
      backHref: `/corespondenta?an=${an}`,
      data: { an, rows, church: churchData(church) },
    };
  },
  "formular-acorduri": async (ctx) => {
    const church = await getChurch(ctx);
    return { spec: consentFormPrint(church), key: generatedKey("formular-acorduri", {}), fileBase: "formular-acorduri", backHref: "/setari/actualizare-date", data: { church: churchData(church) } };
  },
  "afis-cerere": async (ctx) => {
    const church = await getChurch(ctx);
    const url = await applicationUrl(church.slug);
    return { spec: printApplicationPoster(church, url, await applicationQrPng(url, 800)), key: generatedKey("afis-cerere", {}), fileBase: `afis-cerere-${church.slug}`, backHref: "/setari#cerere", data: { url, church: churchData(church) } };
  },
  "afis-actualizare": async (ctx, sp) => {
    const id = validId(sp);
    if (!id) return null;
    const [c, church] = await Promise.all([getCampaign(ctx, id), getChurch(ctx)]);
    if (!c?.generalUrl) return null;
    const spec = printApplicationPoster(church, c.generalUrl, await applicationQrPng(c.generalUrl, 800), {
      title: "Actualizarea datelor",
      line: "Scanați codul cu telefonul pentru a vă verifica datele din evidența bisericii.",
    });
    return { spec, key: generatedKey("afis-actualizare", { id }), fileBase: `afis-actualizare-${church.slug}`, backHref: `/setari/actualizare-date/${id}`, data: { url: c.generalUrl, church: churchData(church) } };
  },
  "disciplina-convocare": async (ctx, sp) => {
    const id = validId(sp);
    if (!id) return null;
    const m = await loadMeasureForPrint(ctx, id);
    if (!m || !m.audiereLa) return null;
    const church = await getChurch(ctx);
    const hearing = { person: m.person, data: fromDbDate(m.audiereLa)!, ora: m.audiereOra, loc: m.audiereLoc };
    const spec = hearingConvocationPrint({ ...hearing, today: todayIso() }, church);
    return {
      spec,
      key: generatedKey("disciplina-convocare", { id }),
      fileBase: `convocare-audiere-${m.person.nume}`,
      backHref: `/persoane/${m.personId}/disciplina`,
      person: { id: m.personId, name: memberName(m.person) },
      data: { hearing, church: churchData(church) },
    };
  },
  "disciplina-comunicare": async (ctx, sp) => {
    const id = validId(sp);
    if (!id) return null;
    const m = await loadMeasureForPrint(ctx, id);
    if (!m || m.stare !== "APLICATA") return null;
    const church = await getChurch(ctx);
    // Not communicated yet: today's date is printed, the data keep the empty date.
    const notice = { person: m.person, sanctiune: DISCIPLINARY_FORM_LABEL[m.forma], sedinta: m.pv, temei: m.temei, comunicatLa: fromDbDate(m.comunicatLa), comunitate: church.comunitate };
    const spec = sanctionNoticePrint({ ...notice, comunicatLa: notice.comunicatLa ?? todayIso() }, church);
    return {
      spec,
      key: generatedKey("disciplina-comunicare", { id }),
      fileBase: `comunicare-sanctiune-${m.person.nume}`,
      backHref: `/persoane/${m.personId}/disciplina`,
      person: { id: m.personId, name: memberName(m.person) },
      data: { notice, church: churchData(church) },
    };
  },
  "disciplina-informare": async (ctx, sp) => {
    const id = validId(sp);
    if (!id) return null;
    const m = await ctx.db.disciplinaryMeasure.findUnique({
      where: { id },
      include: {
        person: { select: { nume: true, prenume: true, gen: true, dataNasterii: true } },
        meeting: { select: { nr: true, anRegistru: true, data: true } },
      },
    });
    if (!m || m.forma !== "EXCLUDERE") return null;
    const church = await getChurch(ctx);
    const pv = m.meeting ? `${m.meeting.nr !== null ? `PV nr. ${m.meeting.nr}/${m.meeting.anRegistru}` : "procesul-verbal"} din ${fmtL(fromDbDate(m.meeting.data)!)}` : "";
    const exclusion = { person: { ...m.person, dataNasterii: fromDbDate(m.person.dataNasterii) }, data: fromDbDate(m.dataInceput)!, procesVerbal: pv, comunitate: church.comunitate };
    const spec = exclusionNoticePrint({ ...exclusion, today: todayIso() }, church);
    return {
      spec,
      key: generatedKey("disciplina-informare", { id }),
      fileBase: `informare-excludere-${m.person.nume}`,
      backHref: `/persoane/${m.personId}/disciplina`,
      person: { id: m.personId, name: memberName(m.person) },
      data: { exclusion, church: churchData(church) },
    };
  },
  "disciplina-proces-verbal": async (ctx, sp) => {
    const id = validId(sp);
    if (!id) return null;
    const m = await loadMeasureForPrint(ctx, id);
    if (!m || m.stare === "CERCETARE" || !m.meetingId) return null;
    const church = await getChurch(ctx);
    const minutes = {
        person: m.person,
        sedinta: m.pv,
        abatere: m.abatere,
        raspuns: m.raspuns,
        nuSaPrezentat: m.nuSaPrezentat,
        sanctiune: DISCIPLINARY_FORM_LABEL[m.forma],
        incadrare: m.incadrare,
        temei: m.temei,
        comunitate: church.comunitate,
      };
    const spec = disciplinaryMinutesPrint(minutes, church);
    return {
      spec,
      key: generatedKey("disciplina-proces-verbal", { id }),
      fileBase: `pv-disciplinar-${m.person.nume}`,
      backHref: `/persoane/${m.personId}/disciplina`,
      person: { id: m.personId, name: memberName(m.person) },
      data: { minutes, church: churchData(church) },
    };
  },
};

/** The source document, freshly generated from the data (null = not found). */
export function loadSource(ctx: Ctx, kind: GeneratedKind, sp: URLSearchParams): Promise<LoadedSource | null> {
  return LOADERS[kind](ctx, kindParams(kind, sp));
}

/**
 * GENERATED-HASH-STABLE: the fingerprint of a source's DATA (sha256 of its stable JSON): the same
 * data give the same fingerprint whatever the day it is printed; a saved version with another
 * fingerprint shows „Datele s-au schimbat de la editare”.
 */
export function sourceHash(src: Pick<LoadedSource, "data">): string {
  return createHash("sha256").update(stableJson(src.data)).digest("hex");
}

/** The fingerprint the versions saved before kept: the printed text, today's date written back as `savedDay`. */
function legacyTextHash(spec: PrintSpec, savedDay: string): string {
  return createHash("sha256").update(asOfDay(blocksFingerprintText(spec.blocks), todayIso(), savedDay)).digest("hex");
}

/** A fingerprint that never equals a data fingerprint: a version whose data had already changed. */
export const CHANGED_BEFORE = "schimbat-inainte-de-amprenta-noua";

/**
 * A version saved with the text's fingerprint (hashVersion 1), checked once and moved to the data's
 * fingerprint: unchanged (the text as of its day is the same) → the current data's fingerprint, so
 * the notice goes; changed → a mark that keeps the notice. Idempotent: only versions still on 1.
 * Returns the version's current fingerprint.
 */
export async function upgradeHash(ctx: Ctx, src: LoadedSource, saved: { id: string; sourceHash: string; hashVersion: number; updatedAt: Date }): Promise<string> {
  if (saved.hashVersion >= HASH_VERSION) return saved.sourceHash;
  const unchanged = legacyTextHash(src.spec, todayIso(undefined, saved.updatedAt)) === saved.sourceHash;
  const next = unchanged ? sourceHash(src) : CHANGED_BEFORE;
  await ctx.db.generatedDocument.updateMany({ where: { id: saved.id, hashVersion: saved.hashVersion }, data: { sourceHash: next, hashVersion: HASH_VERSION } });
  return next;
}

/** The fingerprint's version: 1 = the printed text (before GENERATED-HASH-STABLE), 2 = the source's data. */
export const HASH_VERSION = 2;

export type SavedVersion = NonNullable<Awaited<ReturnType<typeof savedVersion>>>;

/** The saved version of a source, when there is one with a readable model. */
export async function savedVersion(ctx: Ctx, key: string) {
  const row = await ctx.db.generatedDocument.findFirst({
    where: { sourceKey: key },
    include: { updatedBy: { select: { name: true } }, document: { select: { id: true, nr: true, anRegistru: true, stare: true } } },
  });
  if (!row) return null;
  const blocks = storedBlocksOf(row.blocks);
  return blocks ? { ...row, blocks } : null;
}

/** The saved version applied to the fresh document (its text, its own layout; signatures and pictures from the data). */
export function applyStored(fresh: PrintSpec, blocks: readonly StoredBlock[], layout: unknown): PrintSpec {
  return { ...fresh, blocks: resolveStored(blocks, fresh.blocks), ...(layout ? { layout: storedLayout(layout) } : {}) };
}

/**
 * The PDF / Word route of a generated document: the kind's permission, the step-up for disciplinary
 * data, then the saved version when there is one (`?date=1`: from the data), as PDF or `?format=word`.
 */
export async function generatedRoute(kind: GeneratedKind, req: Request, id?: string): Promise<Response> {
  const meta = GENERATED[kind];
  const ctx = await requireCtx(meta.permission);
  const sp = new URL(req.url).searchParams;
  if (id !== undefined) {
    if (!idSchema.safeParse(id).success) notFound();
    sp.set("id", id);
  }
  const src = await loadSource(ctx, kind, sp);
  if (!src) notFound();
  if (meta.discipline && !(await hasStepUp(ctx.user))) redirect(src.backHref);
  const saved = src.key && sp.get("date") !== "1" ? await savedVersion(ctx, src.key) : null;
  const spec = saved ? applyStored(src.spec, saved.blocks, saved.layout) : src.spec;
  if (sp.get("format") === "word") return docxResponse(await renderDocx(spec), pdfFileName(src.fileBase).replace(/\.pdf$/, ".docx"));
  return pdfResponse(await renderPdf(spec), pdfFileName(src.fileBase));
}
