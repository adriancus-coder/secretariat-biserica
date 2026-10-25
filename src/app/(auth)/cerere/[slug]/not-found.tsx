import { APPLICATIONS_CLOSED_MESSAGE } from "@/lib/schemas/application";

export default function ApplicationNotFound() {
  return (
    <>
      <h2 className="text-2xl mb-2">Cerere de membru</h2>
      <p className="hint">{APPLICATIONS_CLOSED_MESSAGE}</p>
    </>
  );
}
