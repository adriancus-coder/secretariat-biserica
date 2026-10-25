/**
 * "Slujire / responsabilități" is no longer a person field: the old text is kept at the top of the
 * note as "Slujire (vechi): …" (by the person_form_polish migration, and once on import). Pure.
 */
export function noteWithSlujire(note: string, slujire: string): string {
  const s = slujire.trim();
  if (!s) return note;
  const line = `Slujire (vechi): ${s}`;
  return note.includes(line) ? note : note ? `${line}\n${note}` : line;
}
