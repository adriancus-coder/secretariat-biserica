import type { ReactNode } from "react";

/**
 * Small server-rendered SVG charts (no client library): readable in both themes (colours from
 * --chart-1…4 and --ink / --line), scaled to the width of their card, each with a <title>, a
 * description and, next to it on the page, a table with the same numbers. Points and bars that
 * stand for a list of persons are links to it.
 */

export interface Series {
  name: string;
  values: number[];
  /** One link per value (the persons behind it), optional. */
  hrefs?: (string | undefined)[];
}

// Narrow viewBox: text stays ≥ 11 px on a 390 px phone; the CSS caps the width on desktop.
const W = 420;
const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)"];

/** Years as "17" when there are many columns; other labels as given. */
const short = (l: string, n: number) => (n > 6 && /^\d{4}$/.test(l) ? l.slice(-2) : l);

function niceMax(n: number): number {
  if (n <= 5) return 5;
  const p = 10 ** Math.floor(Math.log10(n));
  return Math.ceil(n / p) * p;
}

function Link({ href, label, children }: { href?: string; label: string; children: ReactNode }) {
  return href ? (
    <a href={href} aria-label={label}>
      {children}
    </a>
  ) : (
    <g aria-label={label}>{children}</g>
  );
}

function Legend({ series }: { series: Series[] }) {
  return series.length > 1 ? (
    <ul className="chart-legend">
      {series.map((s, i) => (
        <li key={s.name}>
          <span style={{ background: COLORS[i % COLORS.length] }} aria-hidden="true" />
          {s.name}
        </li>
      ))}
    </ul>
  ) : null;
}

/** A line per series over the labels (years). */
export function LineChart({ title, desc, labels, series, height = 220 }: { title: string; desc: string; labels: string[]; series: Series[]; height?: number }) {
  const pad = { l: 36, r: 12, t: 12, b: 28 };
  const max = niceMax(Math.max(1, ...series.flatMap((s) => s.values)));
  const x = (i: number) => pad.l + (labels.length > 1 ? (i * (W - pad.l - pad.r)) / (labels.length - 1) : (W - pad.l - pad.r) / 2);
  const y = (v: number) => pad.t + (height - pad.t - pad.b) * (1 - v / max);
  const id = title.replace(/\W+/g, "-");
  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-labelledby={`${id}-t ${id}-d`} preserveAspectRatio="xMidYMid meet">
        <title id={`${id}-t`}>{title}</title>
        <desc id={`${id}-d`}>{desc}</desc>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={pad.l} x2={W - pad.r} y1={y(max * f)} y2={y(max * f)} className="chart-grid" />
            <text x={pad.l - 6} y={y(max * f) + 4} textAnchor="end" className="chart-axis">
              {Math.round(max * f)}
            </text>
          </g>
        ))}
        {labels.map((l, i) => (
          <text key={l} x={x(i)} y={height - 8} textAnchor="middle" className="chart-axis">
            {short(l, labels.length)}
          </text>
        ))}
        {series.map((s, si) => (
          <g key={s.name} style={{ color: COLORS[si % COLORS.length] }}>
            <polyline fill="none" stroke="currentColor" strokeWidth="2.5" points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ")} />
            {s.values.map((v, i) => (
              <Link key={i} href={s.hrefs?.[i]} label={`${s.name} ${labels[i]}: ${v}`}>
                <circle cx={x(i)} cy={y(v)} r="9" fill="transparent" />
                <circle cx={x(i)} cy={y(v)} r="4" fill="currentColor" />
              </Link>
            ))}
          </g>
        ))}
      </svg>
      <Legend series={series} />
    </figure>
  );
}

/** Stacked vertical bars per label (e.g. entries per year by mode). */
export function StackedBars({ title, desc, labels, series, height = 220 }: { title: string; desc: string; labels: string[]; series: Series[]; height?: number }) {
  const pad = { l: 36, r: 12, t: 12, b: 28 };
  const totals = labels.map((_, i) => series.reduce((a, s) => a + (s.values[i] ?? 0), 0));
  const max = niceMax(Math.max(1, ...totals));
  const slot = (W - pad.l - pad.r) / labels.length;
  const bw = Math.min(36, slot * 0.6);
  const h = (v: number) => ((height - pad.t - pad.b) * v) / max;
  const id = title.replace(/\W+/g, "-");
  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-labelledby={`${id}-t ${id}-d`}>
        <title id={`${id}-t`}>{title}</title>
        <desc id={`${id}-d`}>{desc}</desc>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={pad.l} x2={W - pad.r} y1={height - pad.b - h(max * f)} y2={height - pad.b - h(max * f)} className="chart-grid" />
            <text x={pad.l - 6} y={height - pad.b - h(max * f) + 4} textAnchor="end" className="chart-axis">
              {Math.round(max * f)}
            </text>
          </g>
        ))}
        {labels.map((l, i) => {
          let base = height - pad.b;
          const cx = pad.l + slot * i + slot / 2;
          return (
            <g key={l}>
              {series.map((s, si) => {
                const v = s.values[i] ?? 0;
                if (!v) return null;
                base -= h(v);
                return (
                  <Link key={s.name} href={s.hrefs?.[i]} label={`${s.name} ${l}: ${v}`}>
                    <rect x={cx - bw / 2} y={base} width={bw} height={h(v)} fill={COLORS[si % COLORS.length]} />
                  </Link>
                );
              })}
              <text x={cx} y={height - 8} textAnchor="middle" className="chart-axis">
                {short(l, labels.length)}
              </text>
            </g>
          );
        })}
      </svg>
      <Legend series={series} />
    </figure>
  );
}

/** The age pyramid: men to the left, women to the right, one row per band. */
export function Pyramid({
  title,
  desc,
  rows,
}: {
  title: string;
  desc: string;
  rows: { label: string; M: number; F: number; hrefM?: string; hrefF?: string }[];
}) {
  const rowH = 30;
  const height = rows.length * rowH + 30;
  const mid = W / 2;
  const half = mid - 70;
  const max = Math.max(1, ...rows.flatMap((r) => [r.M, r.F]));
  const len = (v: number) => (half * v) / max;
  const id = title.replace(/\W+/g, "-");
  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-labelledby={`${id}-t ${id}-d`}>
        <title id={`${id}-t`}>{title}</title>
        <desc id={`${id}-d`}>{desc}</desc>
        <text x={mid - 40} y="14" textAnchor="end" className="chart-axis">
          Bărbați
        </text>
        <text x={mid + 40} y="14" className="chart-axis">
          Femei
        </text>
        {rows.map((r, i) => {
          const y = 24 + i * rowH;
          return (
            <g key={r.label}>
              <Link href={r.hrefM} label={`Bărbați ${r.label}: ${r.M}`}>
                <rect x={mid - 32 - len(r.M)} y={y} width={Math.max(len(r.M), 1)} height={rowH - 8} fill="var(--chart-1)" />
                <text x={mid - 38 - len(r.M)} y={y + 16} textAnchor="end" className="chart-value">
                  {r.M}
                </text>
              </Link>
              <text x={mid} y={y + 16} textAnchor="middle" className="chart-axis">
                {r.label}
              </text>
              <Link href={r.hrefF} label={`Femei ${r.label}: ${r.F}`}>
                <rect x={mid + 32} y={y} width={Math.max(len(r.F), 1)} height={rowH - 8} fill="var(--chart-3)" />
                <text x={mid + 38 + len(r.F)} y={y + 16} className="chart-value">
                  {r.F}
                </text>
              </Link>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
