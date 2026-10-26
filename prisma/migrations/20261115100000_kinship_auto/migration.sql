-- KINSHIP-AUTO: the last full check of the kinship links; null = the first run is still due.
ALTER TABLE "churches" ADD COLUMN "kinshipCheckedAt" TIMESTAMP(3);
