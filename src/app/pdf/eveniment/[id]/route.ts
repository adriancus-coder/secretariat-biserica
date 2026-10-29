import { generatedRoute } from "@/server/generated";

/** The event's sheet. GENERATED-EDIT: the saved version when there is one (`?date=1` from the data, `?format=word`). */
export async function GET(req: Request, { params }: RouteContext<"/pdf/eveniment/[id]">) {
  return generatedRoute("eveniment", req, (await params).id);
}
