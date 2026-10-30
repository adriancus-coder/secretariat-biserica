/*
 * FIT-TO-PAGE: which blocks of a printed document stay together on a page. Shared by the PDF renderer
 * (src/server/pdf/render.ts, which lays the document out, measures where each block landed and asks
 * planPages() where to break, a few passes until nothing moves) and the Word renderer (keepNext).
 *
 * - A group is a run of blocks kept with the next one: titles, the number line, a line ending in „:” or
 *   „,” („Ordinea de zi:”, „Întocmit,”) and the spec's `keepWithNext` (a point with its „Votat: …” line).
 *   A group that would split between pages starts on the next page when it fits on one page; a title is
 *   never the last thing on a page.
 * - The tail (`keepTail` blocks at the end, by default the final signature block) never splits, and is
 *   never alone on its page: the group before it comes along when both fit on one page, else the last
 *   lines of that group are pushed over (a lower page limit on the page before).
 * Pure.
 */
import type { Block, PrintSpec } from "@/domain/print";

/** Where a block landed: start and end page (0-based) and y (points from the top of the page). */
export interface BlockBox {
  sp: number;
  sy: number;
  ep: number;
  ey: number;
}

/** The page geometry: the content's top on each page (lower on the first, under the letterhead) and the regular bottom. */
export interface PageGeometry {
  contentTop: number[];
  /** The top of the content on pages after the first. */
  top: number;
  /** The bottom limit of a page (page height minus the bottom margin). */
  bottom: number;
  /** One line of body text, in points (how far a page limit is lowered to push lines over). */
  line: number;
}

/**
 * Forced breaks before blocks, and lowered bottom limits: block index → the page of that block (counted
 * from its first page) and the y its text must not pass there, so its last lines go to the next page.
 */
export interface PagePlan {
  breaks: number[];
  limits: Record<number, { page: number; y: number }>;
}

export const EMPTY_PLAN: PagePlan = { breaks: [], limits: {} };

const blockText = (b: Block): string => (b.type === "para" ? b.runs.map((r) => r.text).join("") : "");

/** Whether a block stays on the page of the block after it. */
export function keepsWithNext(spec: Pick<PrintSpec, "blocks" | "keepWithNext">, i: number): boolean {
  const b = spec.blocks[i];
  if (!b || i >= spec.blocks.length - 1) return false;
  if (spec.keepWithNext?.includes(i)) return true;
  if (b.type === "title" || b.type === "nr") return true;
  if (b.type === "para" && !b.pre) return /[:,]\s*$/.test(blockText(b));
  return false;
}

/** The first block of the tail, or null (no closing to keep together). */
export function tailStart(spec: Pick<PrintSpec, "blocks" | "keepTail">): number | null {
  const n = spec.blocks.length;
  if (!n) return null;
  if (spec.keepTail && spec.keepTail > 0) return Math.max(0, n - spec.keepTail);
  const last = spec.blocks[n - 1];
  return last.type === "signatures" || last.type === "signed" ? n - 1 : null;
}

/** The groups of blocks kept together, as [first, last] (the tail is one group). */
export function blockGroups(spec: Pick<PrintSpec, "blocks" | "keepWithNext" | "keepTail">): [number, number][] {
  const n = spec.blocks.length;
  const tail = tailStart(spec);
  const groups: [number, number][] = [];
  let start = 0;
  for (let i = 0; i < n; i++) {
    if (tail !== null && i === tail) {
      if (start < i) groups.push([start, i - 1]);
      groups.push([tail, n - 1]);
      return groups;
    }
    if (!keepsWithNext(spec, i) || (tail !== null && i === tail - 1)) {
      groups.push([start, i]);
      start = i + 1;
    }
  }
  if (start < n) groups.push([start, n - 1]);
  return groups;
}

/** The height a run of blocks takes (across pages: the rest of the first page, full pages, the top of the last). */
function spanHeight(a: BlockBox, b: BlockBox, g: PageGeometry): number {
  if (a.sp === b.ep) return b.ey - a.sy;
  return g.bottom - a.sy + (b.ep - a.sp - 1) * (g.bottom - g.top) + (b.ey - g.top);
}

const atTop = (box: BlockBox, g: PageGeometry) => box.sy <= (g.contentTop[box.sp] ?? g.top) + 1;

/**
 * The next plan from where the blocks landed under `plan`: it only adds breaks and lowers limits, so
 * the passes converge. Returns the same plan when nothing has to move.
 */
export function planPages(spec: Pick<PrintSpec, "blocks" | "keepWithNext" | "keepTail">, boxes: BlockBox[], g: PageGeometry, plan: PagePlan = EMPTY_PLAN): PagePlan {
  const breaks = new Set(plan.breaks);
  const limits = { ...plan.limits };
  const usable = g.bottom - g.top;
  const groups = blockGroups(spec);
  const tail = tailStart(spec);
  for (const [first, last] of groups) {
    const a = boxes[first];
    const z = boxes[last];
    if (first === tail || !a || !z || a.sp === z.ep || atTop(a, g)) continue;
    // A title (or another kept block) as the last thing on its page.
    const stranded = Array.from({ length: last - first }, (_, k) => first + k).some((i) => boxes[i].ep < boxes[i + 1].sp);
    if (spanHeight(a, z, g) <= usable || stranded) breaks.add(first);
  }
  if (tail !== null) {
    const t = boxes[tail];
    const end = boxes[spec.blocks.length - 1];
    const before = tail > 0 ? boxes[tail - 1] : undefined;
    const prev = groups.find(([, last]) => last === tail - 1);
    const split = t && end && t.sp !== end.ep;
    const alone = Boolean(t && before && t.sp > before.ep);
    if (t && end && (split || alone)) {
      const p = prev ? boxes[prev[0]] : undefined;
      const tailHeight = split ? spanHeight(t, end, g) : end.ey - t.sy;
      if (prev && p && before && !atTop(p, g) && spanHeight(p, before, g) + tailHeight <= usable) {
        // The closing and the group before it start the next page together.
        breaks.add(prev[0]);
      } else if (prev && before) {
        // Too long to move whole: the closing starts a page and the last lines of the block before it
        // follow (its limit on its last page is lowered by three lines at a time).
        if (split && !atTop(t, g)) breaks.add(tail);
        const k = tail - 1;
        const page = before.ep - before.sp;
        const current = limits[k]?.page === page ? limits[k].y : Math.min(g.bottom, before.ey);
        const lowered = current - 3 * g.line;
        if (lowered > (g.contentTop[before.ep] ?? g.top) + 2 * g.line) limits[k] = { page, y: lowered };
      } else if (split && !atTop(t, g)) breaks.add(tail);
    }
  }
  const next = { breaks: [...breaks].sort((x, y) => x - y), limits };
  return samePlan(next, plan) ? plan : next;
}

export function samePlan(a: PagePlan, b: PagePlan): boolean {
  return JSON.stringify(a.breaks) === JSON.stringify(b.breaks) && JSON.stringify(a.limits) === JSON.stringify(b.limits);
}

/** How the last page looks: its share of content (0–1) and whether it holds only the closing. */
export function lastPageInfo(spec: Pick<PrintSpec, "blocks" | "keepTail">, boxes: BlockBox[], g: PageGeometry, pages: number): { fill: number; onlyTail: boolean } {
  const last = pages - 1;
  const onLast = boxes.filter((b) => b.ep === last);
  const top = g.contentTop[last] ?? g.top;
  const end = Math.max(top, ...onLast.map((b) => b.ey));
  const fill = Math.max(0, Math.min(1, (end - top) / (g.bottom - top)));
  const tail = tailStart(spec);
  // Nothing but the closing (or its end) reaches the last page.
  const onlyTail = last > 0 && tail !== null && boxes.every((b, i) => b.ep < last || i >= tail);
  return { fill, onlyTail };
}

/** A last page with only the closing, or under 15 % filled, is worth fitting onto fewer pages. */
export const SPARSE_LAST_PAGE = 0.15;

/** Word: how each block keeps with the next — every paragraph, only its last one, or none. */
export function docxKeeps(spec: Pick<PrintSpec, "blocks" | "keepWithNext" | "keepTail">): ("all" | "last" | undefined)[] {
  const n = spec.blocks.length;
  const out: ("all" | "last" | undefined)[] = spec.blocks.map((_, i) => (keepsWithNext(spec, i) ? "all" : undefined));
  const tail = tailStart(spec);
  if (tail === null) return out;
  for (let i = tail; i < n - 1; i++) out[i] = "all";
  // The block before the closing: its last paragraph goes with it (a whole long text cannot).
  if (tail > 0) {
    const prev = blockGroups(spec).find(([, last]) => last === tail - 1);
    if (prev) for (let i = prev[0]; i <= prev[1]; i++) out[i] = i === prev[1] ? "last" : "all";
  }
  return out;
}
