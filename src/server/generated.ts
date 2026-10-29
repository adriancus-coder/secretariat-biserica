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
import { generateReportText } from "./queries/stats";
import { loadStatistics } from "./queries/statistics";
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

type Loader = (ctx: Ctx, sp: URLSearchParams) => Promise<LoadedSource | null>;

const LOADERS: Record<GeneratedKind, Loader> = {
  eveniment: async (ctx, sp) => {
    const id = validId(sp);
    if (!id) return null;
    const [e, church] = await Promise.all([getEvent(ctx, id), getChurch(ctx)]);
    if (!e) return null;
    const spec = eventPrint(
      {
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
      },
      church,
    );
    return { spec, key: generatedKey("eveniment", { id }), fileBase: `${e.data}-${e.titlu}`, backHref: `/calendar/${id}` };
  },
  grup: async (ctx, sp) => {
    const id = validId(sp);
    if (!id) return null;
    const [g, church] = await Promise.all([getGroup(ctx, id), getChurch(ctx)]);
    if (!g) return null;
    return { spec: groupPrint({ nume: g.nume, responsabil: g.responsabilName, membri: g.membri }, church), key: generatedKey("grup", { id }), fileBase: `grup-${g.nume}`, backHref: `/grupuri/${id}` };
  },
  "dare-de-seama": async (ctx, sp) => {
    const year = yearOf(sp.get("an"));
    const [text, church] = await Promise.all([generateReportText(ctx, year), getChurch(ctx)]);
    return { spec: reportPrint(year, text, church), key: generatedKey("dare-de-seama", { an: year }), fileBase: `dare-de-seama-${year}`, backHref: `/?an=${year}` };
  },
  statistici: async (ctx, sp) => {
    const [d, church] = await Promise.all([loadStatistics(ctx, requestedYear(sp.get("an"))), getChurch(ctx)]);
    // The tables in the order the page shows them (?sort=<table>.<column>&dir=).
    return { spec: statisticsPrint(d, church, sorted(sp)), key: generatedKey("statistici", { an: d.year }), fileBase: `statistici-${d.year}`, backHref: `/statistici?an=${d.year}` };
  },
  neamuri: async (ctx, sp) => {
    const [kin, church] = await Promise.all([loadKinship(ctx.db), getChurch(ctx)]);
    return { spec: neamPrint(kin.neamuri, church, sorted(sp)), key: generatedKey("neamuri", {}), fileBase: "neamuri", backHref: "/statistici/neamuri" };
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
    };
  },
  corespondenta: async (ctx, sp) => {
    const [{ an, rows }, church] = await Promise.all([exportRegister(ctx, sp), getChurch(ctx)]);
    return {
      spec: registerPrint(rows, an, church, sorted(sp)),
      key: generatedKey("corespondenta", { an, filtru: sp.get("filtru"), q: sp.get("q") }),
      fileBase: `registru-intrare-iesire-${an}`,
      backHref: `/corespondenta?an=${an}`,
    };
  },
  "formular-acorduri": async (ctx) => ({
    spec: consentFormPrint(await getChurch(ctx)),
    key: generatedKey("formular-acorduri", {}),
    fileBase: "formular-acorduri",
    backHref: "/setari/actualizare-date",
  }),
  "afis-cerere": async (ctx) => {
    const church = await getChurch(ctx);
    const url = await applicationUrl(church.slug);
    return { spec: printApplicationPoster(church, url, await applicationQrPng(url, 800)), key: generatedKey("afis-cerere", {}), fileBase: `afis-cerere-${church.slug}`, backHref: "/setari#cerere" };
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
    return { spec, key: generatedKey("afis-actualizare", { id }), fileBase: `afis-actualizare-${church.slug}`, backHref: `/setari/actualizare-date/${id}` };
  },
  "disciplina-convocare": async (ctx, sp) => {
    const id = validId(sp);
    if (!id) return null;
    const m = await loadMeasureForPrint(ctx, id);
    if (!m || !m.audiereLa) return null;
    const church = await getChurch(ctx);
    const spec = hearingConvocationPrint({ person: m.person, data: fromDbDate(m.audiereLa)!, ora: m.audiereOra, loc: m.audiereLoc, today: todayIso() }, church);
    return { spec, key: generatedKey("disciplina-convocare", { id }), fileBase: `convocare-audiere-${m.person.nume}`, backHref: `/persoane/${m.personId}/disciplina`, person: { id: m.personId, name: memberName(m.person) } };
  },
  "disciplina-comunicare": async (ctx, sp) => {
    const id = validId(sp);
    if (!id) return null;
    const m = await loadMeasureForPrint(ctx, id);
    if (!m || m.stare !== "APLICATA") return null;
    const church = await getChurch(ctx);
    const spec = sanctionNoticePrint(
      {
        person: m.person,
        sanctiune: DISCIPLINARY_FORM_LABEL[m.forma],
        sedinta: m.pv,
        temei: m.temei,
        comunicatLa: fromDbDate(m.comunicatLa) ?? todayIso(),
        comunitate: church.comunitate,
      },
      church,
    );
    return { spec, key: generatedKey("disciplina-comunicare", { id }), fileBase: `comunicare-sanctiune-${m.person.nume}`, backHref: `/persoane/${m.personId}/disciplina`, person: { id: m.personId, name: memberName(m.person) } };
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
    const spec = exclusionNoticePrint(
      {
        person: { ...m.person, dataNasterii: fromDbDate(m.person.dataNasterii) },
        data: fromDbDate(m.dataInceput)!,
        procesVerbal: pv,
        today: todayIso(),
        comunitate: church.comunitate,
      },
      church,
    );
    return { spec, key: generatedKey("disciplina-informare", { id }), fileBase: `informare-excludere-${m.person.nume}`, backHref: `/persoane/${m.personId}/disciplina`, person: { id: m.personId, name: memberName(m.person) } };
  },
  "disciplina-proces-verbal": async (ctx, sp) => {
    const id = validId(sp);
    if (!id) return null;
    const m = await loadMeasureForPrint(ctx, id);
    if (!m || m.stare === "CERCETARE" || !m.meetingId) return null;
    const church = await getChurch(ctx);
    const spec = disciplinaryMinutesPrint(
      {
        person: m.person,
        sedinta: m.pv,
        abatere: m.abatere,
        raspuns: m.raspuns,
        nuSaPrezentat: m.nuSaPrezentat,
        sanctiune: DISCIPLINARY_FORM_LABEL[m.forma],
        incadrare: m.incadrare,
        temei: m.temei,
        comunitate: church.comunitate,
      },
      church,
    );
    return { spec, key: generatedKey("disciplina-proces-verbal", { id }), fileBase: `pv-disciplinar-${m.person.nume}`, backHref: `/persoane/${m.personId}/disciplina`, person: { id: m.personId, name: memberName(m.person) } };
  },
};

/** The source document, freshly generated from the data (null = not found). */
export function loadSource(ctx: Ctx, kind: GeneratedKind, sp: URLSearchParams): Promise<LoadedSource | null> {
  return LOADERS[kind](ctx, kindParams(kind, sp));
}

/** The fingerprint of the generated data (sha256 of its blocks): a saved version older than the data shows a notice. */
export function sourceHash(spec: PrintSpec): string {
  return createHash("sha256").update(blocksFingerprintText(spec.blocks)).digest("hex");
}

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
