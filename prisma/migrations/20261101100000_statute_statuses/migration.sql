-- Statut art. 28: COPIL is no longer a status; baptised non-members get their own status.
-- Rules (nothing is deleted):
--   COPIL baptised (dataBotez or botezAn)                               -> MEMBRU
--   COPIL unbaptised, family head/spouse/parent is MEMBRU               -> APARTINATOR
--   other COPIL                                                         -> PRIETEN
--   APARTINATOR baptised                                                -> BOTEZAT_FARA_TRANSFER
ALTER TABLE "persons" ADD COLUMN "statutAjustat" TEXT;
ALTER TABLE "persons" ADD COLUMN "_statutNou" TEXT;

UPDATE "persons" p SET "_statutNou" = CASE
  WHEN p."statut" = 'COPIL' AND (p."dataBotez" IS NOT NULL OR p."botezAn" IS NOT NULL) THEN 'MEMBRU'
  WHEN p."statut" = 'COPIL' AND p."familyId" IS NOT NULL AND EXISTS (
    SELECT 1 FROM "persons" q
    LEFT JOIN "families" f ON f."id" = q."familyId"
    WHERE q."familyId" = p."familyId" AND q."churchId" = p."churchId" AND q."id" <> p."id"
      AND q."statut" = 'MEMBRU'
      AND (f."headId" = q."id" OR q."rudenie" IN ('Cap de familie', 'Soție', 'Soț', 'Părinte'))
  ) THEN 'APARTINATOR'
  WHEN p."statut" = 'COPIL' THEN 'PRIETEN'
  WHEN p."statut" = 'APARTINATOR' AND (p."dataBotez" IS NOT NULL OR p."botezAn" IS NOT NULL) THEN 'BOTEZAT_FARA_TRANSFER'
  ELSE NULL
END;

UPDATE "persons" SET
  "statutAjustat" = (CASE "statut"::text WHEN 'COPIL' THEN 'Copil' ELSE 'Aparținător' END) || ' → ' ||
    (CASE "_statutNou" WHEN 'MEMBRU' THEN 'Membru' WHEN 'APARTINATOR' THEN 'Aparținător' WHEN 'PRIETEN' THEN 'Prieten' ELSE 'Botezat, fără calitate de membru' END),
  "note" = 'Statut ajustat după Statutul Cultului (art. 28): ' ||
    (CASE "statut"::text WHEN 'COPIL' THEN 'Copil' ELSE 'Aparținător' END) || ' → ' ||
    (CASE "_statutNou" WHEN 'MEMBRU' THEN 'Membru' WHEN 'APARTINATOR' THEN 'Aparținător' WHEN 'PRIETEN' THEN 'Prieten' ELSE 'Botezat, fără calitate de membru' END) ||
    CASE WHEN "note" = '' THEN '' ELSE E'\n' || "note" END
WHERE "_statutNou" IS NOT NULL;

-- Swap the enum.
CREATE TYPE "PersonStatus_new" AS ENUM ('MEMBRU', 'APARTINATOR', 'PRIETEN', 'BOTEZAT_FARA_TRANSFER', 'FOST_MEMBRU');
ALTER TABLE "persons" ALTER COLUMN "statut" DROP DEFAULT;
ALTER TABLE "persons" ALTER COLUMN "statut" TYPE "PersonStatus_new"
  USING (COALESCE("_statutNou", "statut"::text)::"PersonStatus_new");
DROP TYPE "PersonStatus";
ALTER TYPE "PersonStatus_new" RENAME TO "PersonStatus";
ALTER TABLE "persons" ALTER COLUMN "statut" SET DEFAULT 'MEMBRU';
ALTER TABLE "persons" DROP COLUMN "_statutNou";
