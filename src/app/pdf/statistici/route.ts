import { generatedRoute } from "@/server/generated";

/** The Statistici page as a PDF (charts as vectors, aggregate numbers only; tables in the screen's sort). GENERATED-EDIT: the saved version when there is one (`?date=1` from the data, `?format=word`). */
export async function GET(req: Request) {
  return generatedRoute("statistici", req);
}
