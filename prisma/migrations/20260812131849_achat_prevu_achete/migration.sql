-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AchatPrevu" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "libelle" TEXT NOT NULL,
    "montantCible" REAL NOT NULL,
    "dateVisee" DATETIME NOT NULL,
    "dejaProvisionne" REAL NOT NULL DEFAULT 0,
    "achete" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_AchatPrevu" ("createdAt", "dateVisee", "dejaProvisionne", "id", "libelle", "montantCible", "updatedAt") SELECT "createdAt", "dateVisee", "dejaProvisionne", "id", "libelle", "montantCible", "updatedAt" FROM "AchatPrevu";
DROP TABLE "AchatPrevu";
ALTER TABLE "new_AchatPrevu" RENAME TO "AchatPrevu";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
