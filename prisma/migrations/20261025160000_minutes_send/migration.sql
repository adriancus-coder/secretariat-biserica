-- CreateEnum
CREATE TYPE "MeetingSendStatus" AS ENUM ('SENT', 'FAILED');

-- AlterTable
ALTER TABLE "churches" ADD COLUMN     "pastorEmail" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "secretarEmail" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "meeting_sends" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "to" TEXT[],
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentByUserId" TEXT,
    "resendId" TEXT,
    "status" "MeetingSendStatus" NOT NULL,
    "error" TEXT,

    CONSTRAINT "meeting_sends_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "meeting_sends_meetingId_sentAt_idx" ON "meeting_sends"("meetingId", "sentAt");

-- AddForeignKey
ALTER TABLE "meeting_sends" ADD CONSTRAINT "meeting_sends_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_sends" ADD CONSTRAINT "meeting_sends_sentByUserId_fkey" FOREIGN KEY ("sentByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

