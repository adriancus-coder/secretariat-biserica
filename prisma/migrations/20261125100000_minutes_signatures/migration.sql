-- MINUTES-SIGNATURES: „Semnat pe hârtie” on the signatures of those present, and the Secretar / Pastor
-- signatures at the bottom of the minutes (one per role, reached through the meeting).
-- AlterTable
ALTER TABLE "meeting_signatures" ADD COLUMN     "peHartie" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "imagePng" DROP NOT NULL;

-- CreateTable
CREATE TABLE "meeting_role_signatures" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "rol" "SignatureRole" NOT NULL,
    "nume" TEXT NOT NULL DEFAULT '',
    "imagePng" BYTEA,
    "peHartie" BOOLEAN NOT NULL DEFAULT false,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "signedByUserId" TEXT,

    CONSTRAINT "meeting_role_signatures_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "meeting_role_signatures_meetingId_rol_key" ON "meeting_role_signatures"("meetingId", "rol");

-- AddForeignKey
ALTER TABLE "meeting_role_signatures" ADD CONSTRAINT "meeting_role_signatures_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_role_signatures" ADD CONSTRAINT "meeting_role_signatures_signedByUserId_fkey" FOREIGN KEY ("signedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

