import { generatedRoute } from "@/server/generated";

/** "PV disciplinar" (Statut art. 272 lit. c): the closed-session part of the committee minutes. `disciplina` + step-up. GENERATED-EDIT: the saved version when there is one (`?date=1` from the data, `?format=word`). */
export async function GET(req: Request, { params }: RouteContext<"/pdf/disciplina/[id]/proces-verbal">) {
  return generatedRoute("disciplina-proces-verbal", req, (await params).id);
}
