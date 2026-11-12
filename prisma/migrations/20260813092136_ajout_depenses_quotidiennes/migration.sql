-- CreateTable
CREATE TABLE "DepenseQuotidienne" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "moisId" INTEGER NOT NULL,
    "personneId" INTEGER,
    "libelle" TEXT NOT NULL,
    "montant" REAL NOT NULL,
    "date" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DepenseQuotidienne_moisId_fkey" FOREIGN KEY ("moisId") REFERENCES "Mois" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DepenseQuotidienne_personneId_fkey" FOREIGN KEY ("personneId") REFERENCES "Personne" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
