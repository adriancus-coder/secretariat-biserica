-- Recalcularea textului de căutare al mențiunilor: maparea diacriticelor din migrarea
-- anterioară era decalată (ș → i, ț → s). Aplicația recalculează valoarea la fiecare salvare.
UPDATE "notes"
SET "searchText" = translate(lower("text" || ' ' || "tip" || ' ' || "familie"), 'ăâîșşțţ', 'aaisstt');
