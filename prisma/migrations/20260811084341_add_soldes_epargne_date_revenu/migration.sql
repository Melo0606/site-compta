-- AlterTable
ALTER TABLE "Revenu" ADD COLUMN "date" DATETIME;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Parametres" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "cleRepartition" TEXT NOT NULL DEFAULT 'EGALE',
    "soldeCommun" REAL NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Parametres" ("cleRepartition", "id", "updatedAt") SELECT "cleRepartition", "id", "updatedAt" FROM "Parametres";
DROP TABLE "Parametres";
ALTER TABLE "new_Parametres" RENAME TO "Parametres";
CREATE TABLE "new_Personne" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nom" TEXT NOT NULL,
    "soldePerso" REAL NOT NULL DEFAULT 0,
    "soldeEpargne" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Personne" ("createdAt", "id", "nom", "updatedAt") SELECT "createdAt", "id", "nom", "updatedAt" FROM "Personne";
DROP TABLE "Personne";
ALTER TABLE "new_Personne" RENAME TO "Personne";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
