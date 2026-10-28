-- EVENT-PERSONS: the family and the persons of a calendar event (blessing, baptism, wedding, funeral),
-- whose register changes are applied only after a confirmation. Existing events are unchanged.
-- CreateEnum
CREATE TYPE "EventPersonRole" AS ENUM ('COPIL', 'BOTEZAT', 'MIRE', 'MIREASA', 'DECEDAT');

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "familyId" TEXT,
ADD COLUMN     "registruIgnoratLa" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "event_persons" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "personId" TEXT,
    "numeLiber" TEXT NOT NULL DEFAULT '',
    "rol" "EventPersonRole" NOT NULL,
    "ordine" INTEGER NOT NULL DEFAULT 0,
    "aplicatInRegistruLa" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_persons_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "event_persons_churchId_idx" ON "event_persons"("churchId");

-- CreateIndex
CREATE INDEX "event_persons_eventId_idx" ON "event_persons"("eventId");

-- CreateIndex
CREATE INDEX "event_persons_personId_idx" ON "event_persons"("personId");

-- CreateIndex
CREATE INDEX "events_familyId_idx" ON "events"("familyId");

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "families"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_persons" ADD CONSTRAINT "event_persons_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "churches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_persons" ADD CONSTRAINT "event_persons_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_persons" ADD CONSTRAINT "event_persons_personId_fkey" FOREIGN KEY ("personId") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

