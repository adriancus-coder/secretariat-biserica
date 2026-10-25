-- AlterTable
ALTER TABLE "churches" ADD COLUMN     "comitetAlegereMeetingId" TEXT,
ADD COLUMN     "comitetAlesLa" DATE,
ADD COLUMN     "comitetPrelungit" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "meeting_attendees" ADD COLUMN     "motivat" BOOLEAN NOT NULL DEFAULT false;

