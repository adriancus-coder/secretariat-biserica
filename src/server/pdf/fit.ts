import "server-only";
import type { PrintSpec } from "@/domain/print";
import { fitSteps } from "@/lib/fit-layout";
import { SPARSE_LAST_PAGE } from "@/lib/pagination";
import type { PageLayout } from "@/lib/page-layout";
import { renderPdfInfo } from "./render";

/** FIT-TO-PAGE: the page count of a document in a layout, and whether its last page is nearly empty. */
export async function pageInfo(spec: PrintSpec, layout: PageLayout): Promise<{ pages: number; sparse: boolean }> {
  const r = await renderPdfInfo({ ...spec, layout }, { measure: true });
  return { pages: r.pages, sparse: r.pages > 1 && (r.onlyTailOnLast || r.lastPageFill < SPARSE_LAST_PAGE) };
}

export type FitResult = { ok: true; from: number; to: number; layout: PageLayout } | { ok: false; from: number };

/**
 * „Potrivește pe mai puține pagini”: tries the layouts of fitSteps() in order and keeps the first that
 * takes fewer pages; none (it would need text under 10 pt) → not ok, nothing changes.
 */
export async function fitToFewerPages(spec: PrintSpec, layout: PageLayout): Promise<FitResult> {
  const from = (await renderPdfInfo({ ...spec, layout }, { measure: true })).pages;
  if (from <= 1) return { ok: false, from };
  for (const candidate of fitSteps(layout)) {
    const pages = (await renderPdfInfo({ ...spec, layout: candidate }, { measure: true })).pages;
    if (pages < from) return { ok: true, from, to: pages, layout: candidate };
  }
  return { ok: false, from };
}
