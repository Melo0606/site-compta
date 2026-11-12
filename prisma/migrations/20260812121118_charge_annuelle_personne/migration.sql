-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ChargeAnnuelle" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "libelle" TEXT NOT NULL,
    "montant" REAL NOT NULL,
    "moisEcheance" INTEGER NOT NULL,
    "compte" TEXT NOT NULL DEFAULT 'COMMUN',
    "personneId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ChargeAnnuelle_personneId_fkey" FOREIGN KEY ("personneId") REFERENCES "Personne" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ChargeAnnuelle" ("compte", "createdAt", "id", "libelle", "moisEcheance", "montant", "updatedAt") SELECT "compte", "createdAt", "id", "libelle", "moisEcheance", "montant", "updatedAt" FROM "ChargeAnnuelle";
DROP TABLE "ChargeAnnuelle";
ALTER TABLE "new_ChargeAnnuelle" RENAME TO "ChargeAnnuelle";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
