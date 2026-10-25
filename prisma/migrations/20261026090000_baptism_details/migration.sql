-- Water baptism details: the old free "locBotez" becomes the locality; church and officiant are new.
-- Person.searchText needs no backfill: it gains botezBiserica and botezOficiant, which start empty.
ALTER TABLE "persons" ADD COLUMN "botezBiserica" TEXT NOT NULL DEFAULT '',
ADD COLUMN "botezLocalitate" TEXT NOT NULL DEFAULT '',
ADD COLUMN "botezOficiant" TEXT NOT NULL DEFAULT '';
UPDATE "persons" SET "botezLocalitate" = "locBotez" WHERE "locBotez" <> '';
ALTER TABLE "persons" DROP COLUMN "locBotez";

ALTER TABLE "applications" ADD COLUMN "botezBiserica" TEXT NOT NULL DEFAULT '',
ADD COLUMN "botezLocalitate" TEXT NOT NULL DEFAULT '',
ADD COLUMN "botezOficiant" TEXT NOT NULL DEFAULT '';
UPDATE "applications" SET "botezLocalitate" = "locBotez" WHERE "locBotez" <> '';
ALTER TABLE "applications" DROP COLUMN "locBotez";
