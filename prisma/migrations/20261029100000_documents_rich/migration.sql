-- Rich text of the outgoing documents (editor JSON); "text" keeps the projection.
-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "textRich" JSONB;

