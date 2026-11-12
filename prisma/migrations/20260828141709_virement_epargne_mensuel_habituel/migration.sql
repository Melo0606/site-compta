-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Personne" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nom" TEXT NOT NULL,
    "soldePerso" REAL NOT NULL DEFAULT 0,
    "soldeEpargne" REAL NOT NULL DEFAULT 0,
    "virementMensuelHabituel" REAL NOT NULL DEFAULT 0,
    "virementEpargneMensuelHabituel" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Personne" ("createdAt", "id", "nom", "soldeEpargne", "soldePerso", "updatedAt", "virementMensuelHabituel") SELECT "createdAt", "id", "nom", "soldeEpargne", "soldePerso", "updatedAt", "virementMensuelHabituel" FROM "Personne";
DROP TABLE "Personne";
ALTER TABLE "new_Personne" RENAME TO "Personne";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- DataMigration: bascule des charges mensuelles "virement épargne" (compte
-- EPARGNE) vers le nouveau virement épargne mensuel habituel par personne,
-- qui fonctionne désormais comme le virement mensuel habituel vers le
-- commun (référence par défaut, purement informative, plus de suivi
-- paiement/décochage par charge).
UPDATE "Personne"
SET "virementEpargneMensuelHabituel" = (
  SELECT COALESCE(SUM("montant"), 0)
  FROM "ChargeMensuelle"
  WHERE "ChargeMensuelle"."personneId" = "Personne"."id"
    AND "ChargeMensuelle"."compte" = 'EPARGNE'
);

DELETE FROM "Paiement"
WHERE "type" = 'CHARGE_MENSUELLE'
  AND "refId" IN (SELECT "id" FROM "ChargeMensuelle" WHERE "compte" = 'EPARGNE');

DELETE FROM "ChargeMensuelle" WHERE "compte" = 'EPARGNE';
