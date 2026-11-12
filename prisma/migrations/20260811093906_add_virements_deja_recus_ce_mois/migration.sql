-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Parametres" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "cleRepartition" TEXT NOT NULL DEFAULT 'EGALE',
    "soldeCommun" REAL NOT NULL DEFAULT 0,
    "chargesDejaPayeesCeMois" REAL NOT NULL DEFAULT 0,
    "virementsDejaRecusCeMois" REAL NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Parametres" ("chargesDejaPayeesCeMois", "cleRepartition", "id", "soldeCommun", "updatedAt") SELECT "chargesDejaPayeesCeMois", "cleRepartition", "id", "soldeCommun", "updatedAt" FROM "Parametres";
DROP TABLE "Parametres";
ALTER TABLE "new_Parametres" RENAME TO "Parametres";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
