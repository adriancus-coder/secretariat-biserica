-- MINUTES-IMPORT-ROBUST: imported minutes (record copies), the old number when it is taken, and the
-- original Word file kept with the meeting.
-- AlterTable
ALTER TABLE "meetings" ADD COLUMN     "importat" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "nrVechi" INTEGER;

-- CreateTable
CREATE TABLE "meeting_source_files" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "numeFisier" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meeting_source_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "meeting_source_files_meetingId_key" ON "meeting_source_files"("meetingId");

-- CreateIndex
CREATE INDEX "meeting_source_files_churchId_idx" ON "meeting_source_files"("churchId");

-- AddForeignKey
ALTER TABLE "meeting_source_files" ADD CONSTRAINT "meeting_source_files_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "churches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_source_files" ADD CONSTRAINT "meeting_source_files_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

