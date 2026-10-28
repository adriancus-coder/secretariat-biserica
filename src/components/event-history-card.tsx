import Link from "next/link";
import { EVENT_ROLE_LABEL, type EventPersonRole } from "@/lib/event-persons";
import { fmt } from "@/lib/format";

/** EVENT-PERSONS: „Istoric” on the person and family pages — the calendar events they took part in. */
export function EventHistoryCard({
  events,
  showPersons = false,
}: {
  events: { id: string; titlu: string; tip: string; data: string; persons: { rol: EventPersonRole; name: string; personId: string }[] }[];
  /** The family page names the members (the person page does not need to). */
  showPersons?: boolean;
}) {
  return (
    <div className="card" id="istoric-evenimente">
      <h3>Istoric: evenimente ({events.length})</h3>
      {events.length ? (
        <ul>
          {events.map((e) => (
            <li key={e.id} className="py-1">
              <Link href={`/calendar/${e.id}`}>{e.titlu}</Link> <span className="hint inline">({e.tip}, {fmt(e.data)})</span>
              {showPersons && e.persons.length ? <span className="hint block">{e.persons.map((p) => `${EVENT_ROLE_LABEL[p.rol]}: ${p.name}`).join(" · ")}</span> : null}
            </li>
          ))}
        </ul>
      ) : (
        <div className="hint">Niciun eveniment din calendar.</div>
      )}
    </div>
  );
}
