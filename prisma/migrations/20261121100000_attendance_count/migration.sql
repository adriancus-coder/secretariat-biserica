-- ATTENDANCE-COUNT: a meeting's attendance can be recorded only as a number. Existing meetings keep
-- their attendance by name (NULL).
-- AlterTable
ALTER TABLE "meetings" ADD COLUMN     "numarPrezenti" INTEGER;

