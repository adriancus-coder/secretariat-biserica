-- PATRIMONY-PHOTOS: photos of the goods, re-encoded by the server, in the database (no file storage yet).
-- CreateTable
CREATE TABLE "asset_photos" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "ordine" INTEGER NOT NULL DEFAULT 0,
    "mime" TEXT NOT NULL DEFAULT 'image/jpeg',
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "bytes" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "thumb" BYTEA NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_photos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "asset_photos_churchId_idx" ON "asset_photos"("churchId");

-- CreateIndex
CREATE INDEX "asset_photos_assetId_ordine_idx" ON "asset_photos"("assetId", "ordine");

-- AddForeignKey
ALTER TABLE "asset_photos" ADD CONSTRAINT "asset_photos_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "churches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_photos" ADD CONSTRAINT "asset_photos_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

