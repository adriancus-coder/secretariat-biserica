"use client";

import { rightsPage, type StatuteExcerpt } from "@/lib/statute-excerpts";

/**
 * "Ce înseamnă să fiți membru al bisericii": the statute excerpts as collapsible blocks, each with its
 * article; links open the Cult's statute PDF at the section's page (only when the church uploaded it).
 * Reading the card does not count as opening the statute; following one of its links does (`onOpen`).
 */
export function StatuteExcerptsCard({
  excerpts,
  statuteUrl,
  onOpen,
  collapsed = false,
}: {
  excerpts: StatuteExcerpt[];
  /** "/cerere/<slug>/statut/cult", or null when no statute of the Cult is published. */
  statuteUrl: string | null;
  onOpen?: () => void;
  /** All blocks closed (the data-update page); otherwise the first one is open. */
  collapsed?: boolean;
}) {
  const link = (page: number | null, text: string) =>
    statuteUrl ? (
      <a href={`${statuteUrl}${page ? `#page=${page}` : ""}`} target="_blank" rel="noopener" onClick={onOpen} className="excerpt-link">
        {text}
      </a>
    ) : null;
  const page = rightsPage(excerpts);
  return (
    <section className="card excerpts" aria-labelledby="excerpts-title">
      <h3 id="excerpts-title">Ce înseamnă să fiți membru al bisericii</h3>
      {excerpts.map((x, i) => (
        <details key={`${i}-${x.titlu}`} open={!collapsed && i === 0}>
          <summary>
            <span className="grow">{x.titlu}</span>
            <span className="tag">Statut {x.articol}</span>
          </summary>
          <div className="excerpt-text">{x.text}</div>
          {link(x.pagina, `Deschide statutul${x.pagina ? ` (pagina ${x.pagina})` : ""}`)}
        </details>
      ))}
      {statuteUrl ? <p className="hint mt-3 mb-0">Textul complet: {link(page, `Deschide statutul (pagina ${page})`)}</p> : null}
    </section>
  );
}
