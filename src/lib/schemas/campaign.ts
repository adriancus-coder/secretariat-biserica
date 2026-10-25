import { z } from "zod";
import { requiredDate, requiredText } from "../validation";

export const CAMPAIGN_FIELDS = ["nume", "deadline", "generalLinkEnabled", "stare"] as const;

export const campaignSchema = z.object({
  nume: requiredText(120, "Numele campaniei este obligatoriu.", "Numele"),
  deadline: requiredDate("Alegeți data limită."),
  generalLinkEnabled: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()),
});

export type CampaignInput = z.output<typeof campaignSchema>;
