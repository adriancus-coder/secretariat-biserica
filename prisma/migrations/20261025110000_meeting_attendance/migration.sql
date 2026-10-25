-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT');

-- AlterTable
ALTER TABLE "churches" ADD COLUMN     "regulaPrezenta" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "meeting_attendees" ADD COLUMN     "status" "AttendanceStatus" NOT NULL DEFAULT 'PRESENT';


-- AlterTable
ALTER TABLE "meetings" ADD COLUMN     "asteptati" INTEGER;
