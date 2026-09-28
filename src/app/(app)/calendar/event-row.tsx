import Link from "next/link";
import { dateBadge } from "@/lib/format";
import type { EventListItem } from "@/server/queries/events";

/** Rândul unui eveniment, ca în prototip: dată, titlu, oră · loc · invitat, eticheta tipului sau a agapei. */
export function EventRow({ e }: { e: EventListItem }) {
  const d = dateBadge(e.data);
  const meta = [e.ora, e.loc, e.invitat ? `Invitat: ${e.invitat}` : ""].filter(Boolean).join(" · ");
  return (
    <Link href={`/calendar/${e.id}`} className="item">
      <div className="date">
        <b>{d.day}</b>
        <span>{d.mon}</span>
      </div>
      <div className="body">
        <div className="t">{e.titlu}</div>
        <div className="m">{meta}</div>
      </div>
      {e.agapaActiva ? <span className="tag tag-gold">Agapă {e.contributii}</span> : <span className="tag">{e.tip}</span>}
    </Link>
  );
}
