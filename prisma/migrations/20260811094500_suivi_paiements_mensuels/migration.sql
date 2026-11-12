-- AlterTable
ALTER TABLE "ChargeMensuelle" ADD COLUMN "payeeCeMois" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Personne" ADD COLUMN "virementRecuCeMois" REAL NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Parametres" DROP COLUMN "virementsDejaRecusCeMois";
