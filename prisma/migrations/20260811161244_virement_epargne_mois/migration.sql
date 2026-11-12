-- CreateTable
CREATE TABLE "VirementEpargneMois" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "moisId" INTEGER NOT NULL,
    "personneId" INTEGER NOT NULL,
    "montant" REAL NOT NULL DEFAULT 0,
    CONSTRAINT "VirementEpargneMois_moisId_fkey" FOREIGN KEY ("moisId") REFERENCES "Mois" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "VirementEpargneMois_personneId_fkey" FOREIGN KEY ("personneId") REFERENCES "Personne" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "VirementEpargneMois_moisId_personneId_key" ON "VirementEpargneMois"("moisId", "personneId");
