-- General Assembly (Statut art. 46): convocation, kind, votes per point, the types that are an AG or show the quorum, and the convocation document type.
-- CreateEnum
CREATE TYPE "GeneralAssemblyKind" AS ENUM ('ORDINARA', 'EXTRAORDINARA');

-- AlterEnum
ALTER TYPE "DocumentType" ADD VALUE 'convocare';

-- AlterTable
ALTER TABLE "churches" ADD COLUMN     "tipuriAG" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "tipuriCvorum" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "meetings" ADD COLUMN     "convocareText" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "convocatLa" DATE,
ADD COLUMN     "convocataDeComunitate" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tipAG" "GeneralAssemblyKind",
ADD COLUMN     "voturi" JSONB;

