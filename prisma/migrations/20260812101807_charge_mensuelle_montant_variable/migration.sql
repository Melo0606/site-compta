-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ChargeMensuelle" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "libelle" TEXT NOT NULL,
    "categorie" TEXT NOT NULL,
    "montant" REAL NOT NULL,
    "compte" TEXT NOT NULL DEFAULT 'COMMUN',
    "dateDebut" DATETIME,
    "montantVariable" BOOLEAN NOT NULL DEFAULT false,
    "personneId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ChargeMensuelle_personneId_fkey" FOREIGN KEY ("personneId") REFERENCES "Personne" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ChargeMensuelle" ("categorie", "compte", "createdAt", "dateDebut", "id", "libelle", "montant", "personneId", "updatedAt") SELECT "categorie", "compte", "createdAt", "dateDebut", "id", "libelle", "montant", "personneId", "updatedAt" FROM "ChargeMensuelle";
DROP TABLE "ChargeMensuelle";
ALTER TABLE "new_ChargeMensuelle" RENAME TO "ChargeMensuelle";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
