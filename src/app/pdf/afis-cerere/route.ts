import { generatedRoute } from "@/server/generated";

/** "Afiș PDF": an A5 poster with the QR code and the link of the public application. GENERATED-EDIT: the saved version when there is one (`?date=1` from the data, `?format=word`). */
export async function GET(req: Request) {
  return generatedRoute("afis-cerere", req);
}
