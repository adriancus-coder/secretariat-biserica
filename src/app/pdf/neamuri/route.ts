import { generatedRoute } from "@/server/generated";

/** Statistici → Neamuri as a PDF (the screen's sort). GENERATED-EDIT: the saved version when there is one (`?date=1` from the data, `?format=word`). */
export async function GET(req: Request) {
  return generatedRoute("neamuri", req);
}
