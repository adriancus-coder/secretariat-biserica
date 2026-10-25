-- "Cerere de membralitate": a new entry mode and application kind.
ALTER TYPE "EntryMode" ADD VALUE 'CERERE_MEMBRALITATE' BEFORE 'ALTUL';
ALTER TYPE "ApplicationKind" ADD VALUE 'CERERE_MEMBRALITATE' BEFORE 'ALTUL';
