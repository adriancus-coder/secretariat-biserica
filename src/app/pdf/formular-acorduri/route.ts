import { generatedRoute } from "@/server/generated";

/** "Formular pe hârtie": the blank consents form, with the weekly prayer rows (write roles). GENERATED-EDIT: the saved version when there is one (`?date=1` from the data, `?format=word`). */
export async function GET(req: Request) {
  return generatedRoute("formular-acorduri", req);
}
