-- PATRIMONY-SUBCATEGORIES: one level of subcategories under each category of goods
-- (Church.categoriiPatrimoniu), and the optional Asset.subcategoryId.

-- AlterTable
ALTER TABLE "assets" ADD COLUMN     "subcategoryId" TEXT;

-- CreateTable
CREATE TABLE "asset_subcategories" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "categorie" TEXT NOT NULL,
    "nume" TEXT NOT NULL,
    "ordine" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_subcategories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "asset_subcategories_churchId_categorie_idx" ON "asset_subcategories"("churchId", "categorie");

-- CreateIndex
CREATE UNIQUE INDEX "asset_subcategories_churchId_categorie_nume_key" ON "asset_subcategories"("churchId", "categorie", "nume");

-- CreateIndex
CREATE INDEX "assets_subcategoryId_idx" ON "assets"("subcategoryId");

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_subcategoryId_fkey" FOREIGN KEY ("subcategoryId") REFERENCES "asset_subcategories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_subcategories" ADD CONSTRAINT "asset_subcategories_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "churches"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Defaults, only under categories that still have their default name (a church with an empty list uses
-- the default categories; a renamed category gets none) and only where the category has no subcategory
-- yet, so running this block again creates nothing. Counts only.
DO $$
DECLARE created integer;
BEGIN
  INSERT INTO "asset_subcategories" ("id", "churchId", "categorie", "nume", "ordine")
  SELECT gen_random_uuid()::text, c."id", d.categorie, d.nume, d.ord
  FROM "churches" c
  CROSS JOIN (VALUES
    ('Clădiri și terenuri', 'Clădire', 0),
    ('Clădiri și terenuri', 'Teren', 1),
    ('Clădiri și terenuri', 'Anexe', 2),
    ('Mobilier', 'Scaune și bănci', 0),
    ('Mobilier', 'Mese', 1),
    ('Mobilier', 'Dulapuri și rafturi', 2),
    ('Mobilier', 'Amvon', 3),
    ('Instrumente muzicale', 'Clape și pian', 0),
    ('Instrumente muzicale', 'Chitare', 1),
    ('Instrumente muzicale', 'Tobe și percuție', 2),
    ('Instrumente muzicale', 'Suflători', 3),
    ('Instrumente muzicale', 'Corzi', 4),
    ('Sonorizare și video', 'Mixere', 0),
    ('Sonorizare și video', 'Microfoane', 1),
    ('Sonorizare și video', 'Boxe și monitoare', 2),
    ('Sonorizare și video', 'Amplificatoare', 3),
    ('Sonorizare și video', 'Camere video', 4),
    ('Sonorizare și video', 'Proiectoare și ecrane', 5),
    ('Sonorizare și video', 'Cabluri și accesorii', 6),
    ('Echipamente IT', 'Calculatoare', 0),
    ('Echipamente IT', 'Imprimante', 1),
    ('Echipamente IT', 'Rețea', 2),
    ('Echipamente IT', 'Tablete și telefoane', 3),
    ('Bucătărie', 'Electrocasnice', 0),
    ('Bucătărie', 'Veselă și tacâmuri', 1),
    ('Bucătărie', 'Mobilier de bucătărie', 2)
  ) AS d(categorie, nume, ord)
  WHERE (cardinality(c."categoriiPatrimoniu") = 0 OR d.categorie = ANY(c."categoriiPatrimoniu"))
    AND NOT EXISTS (SELECT 1 FROM "asset_subcategories" s WHERE s."churchId" = c."id" AND s."categorie" = d.categorie);
  GET DIAGNOSTICS created = ROW_COUNT;
  RAISE NOTICE 'asset_subcategories: % default subcategories created', created;
END $$;
