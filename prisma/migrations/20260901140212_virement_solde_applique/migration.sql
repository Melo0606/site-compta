-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_VirementEpargneMois" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "moisId" INTEGER NOT NULL,
    "personneId" INTEGER NOT NULL,
    "montant" REAL NOT NULL DEFAULT 0,
    "soldeApplique" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "VirementEpargneMois_moisId_fkey" FOREIGN KEY ("moisId") REFERENCES "Mois" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "VirementEpargneMois_personneId_fkey" FOREIGN KEY ("personneId") REFERENCES "Personne" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_VirementEpargneMois" ("id", "moisId", "montant", "personneId") SELECT "id", "moisId", "montant", "personneId" FROM "VirementEpargneMois";
DROP TABLE "VirementEpargneMois";
ALTER TABLE "new_VirementEpargneMois" RENAME TO "VirementEpargneMois";
CREATE UNIQUE INDEX "VirementEpargneMois_moisId_personneId_key" ON "VirementEpargneMois"("moisId", "personneId");
CREATE TABLE "new_VirementMois" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "moisId" INTEGER NOT NULL,
    "personneId" INTEGER NOT NULL,
    "montant" REAL NOT NULL DEFAULT 0,
    "soldeApplique" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "VirementMois_moisId_fkey" FOREIGN KEY ("moisId") REFERENCES "Mois" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "VirementMois_personneId_fkey" FOREIGN KEY ("personneId") REFERENCES "Personne" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_VirementMois" ("id", "moisId", "montant", "personneId") SELECT "id", "moisId", "montant", "personneId" FROM "VirementMois";
DROP TABLE "VirementMois";
ALTER TABLE "new_VirementMois" RENAME TO "VirementMois";
CREATE UNIQUE INDEX "VirementMois_moisId_personneId_key" ON "VirementMois"("moisId", "personneId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- DataMigration: les virements déjà saisis pour le mois en cours ou un mois
-- futur (au moment où cette migration s'exécute) n'ont, par construction,
-- jamais pu répercuter leur écart avec le montant habituel sur le solde (voir
-- `estMoisPasseOuCourant`) — on les marque donc "non appliqués" pour que
-- `rattraperVirementsMoisCourant` les rattrape dès que leur mois devient le
-- mois en cours. Les virements de mois déjà strictement passés restent
-- inchangés (soldeApplique = true par défaut) : on ne touche pas
-- rétroactivement à des mois déjà clos.
UPDATE "VirementMois"
SET "soldeApplique" = 0
WHERE "moisId" IN (
  SELECT "id" FROM "Mois"
  WHERE ("annee" * 12 + "mois") >= (CAST(strftime('%Y', 'now') AS INTEGER) * 12 + CAST(strftime('%m', 'now') AS INTEGER))
);

UPDATE "VirementEpargneMois"
SET "soldeApplique" = 0
WHERE "moisId" IN (
  SELECT "id" FROM "Mois"
  WHERE ("annee" * 12 + "mois") >= (CAST(strftime('%Y', 'now') AS INTEGER) * 12 + CAST(strftime('%m', 'now') AS INTEGER))
);
