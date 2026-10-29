import { generatedRoute } from "@/server/generated";

/** A group's list. GENERATED-EDIT: the saved version when there is one (`?date=1` from the data, `?format=word`). */
export async function GET(req: Request, { params }: RouteContext<"/pdf/grup/[id]">) {
  return generatedRoute("grup", req, (await params).id);
}
