-- Rich text of the minutes (editor JSON); the plain columns keep the projection.
-- AlterTable
ALTER TABLE "meetings" ADD COLUMN     "formulaRich" JSONB,
ADD COLUMN     "observatiiRich" JSONB,
ADD COLUMN     "puncteRich" JSONB;
