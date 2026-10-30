/*
 * FIT-TO-PAGE: „Potrivește pe mai puține pagini”. The layouts tried, in order, each step keeping the
 * previous ones at their limit: the space between paragraphs and points (down to half), the line
 * height (down to 1,15), the top and bottom margins (down to 15 mm), then the side margins, then the
 * text size in half points (down to 10 pt; tables stay at 9 pt at most). The first layout that saves a
 * page wins (src/server/pdf/fit.ts). Pure.
 */
import { LINE_HEIGHTS, PARA_SPACINGS, type PageLayout } from "./page-layout";

export const FIT_MIN_FONT = 10;
export const FIT_MIN_LINE_HEIGHT = 1.15;
export const FIT_MIN_MARGIN = 15;
/** How much a margin shrinks per try, in millimetres. */
const MARGIN_STEP = 3;

export const FIT_FAILED = "Documentul nu încape pe mai puține pagini fără să devină greu de citit.";
export const FIT_ONE_PAGE = "Documentul are deja o singură pagină.";

/** „Rearanjat: 4 → 3 pagini”. */
export function fitMessage(from: number, to: number): string {
  return `Rearanjat: ${from} → ${to} ${to === 1 ? "pagină" : "pagini"}`;
}

/** „3 pagini” / „1 pagină”. */
export function pagesLabel(n: number): string {
  return n === 1 ? "1 pagină" : `${n} pagini`;
}

const shrink = (mm: number) => (mm > FIT_MIN_MARGIN ? Math.max(FIT_MIN_MARGIN, mm - MARGIN_STEP) : mm);

/** Every layout to try, in order (each one keeps the reductions before it). */
export function fitSteps(start: PageLayout): PageLayout[] {
  const out: PageLayout[] = [];
  let cur: PageLayout = { ...start, paraSpacing: start.paraSpacing ?? 1 };
  const push = (patch: Partial<PageLayout>) => {
    cur = { ...cur, ...patch };
    out.push(cur);
  };
  for (const s of [...PARA_SPACINGS].sort((a, b) => b - a)) if (s < cur.paraSpacing) push({ paraSpacing: s });
  for (const h of [...LINE_HEIGHTS].sort((a, b) => b - a)) if (h < cur.lineHeight && h >= FIT_MIN_LINE_HEIGHT) push({ lineHeight: h });
  while (cur.marginTop > FIT_MIN_MARGIN || cur.marginBottom > FIT_MIN_MARGIN) push({ marginTop: shrink(cur.marginTop), marginBottom: shrink(cur.marginBottom) });
  while (cur.marginLeft > FIT_MIN_MARGIN || cur.marginRight > FIT_MIN_MARGIN) push({ marginLeft: shrink(cur.marginLeft), marginRight: shrink(cur.marginRight) });
  while (cur.fontSize > FIT_MIN_FONT) push({ fontSize: Math.max(FIT_MIN_FONT, Math.round((cur.fontSize - 0.5) * 2) / 2) });
  return out;
}
