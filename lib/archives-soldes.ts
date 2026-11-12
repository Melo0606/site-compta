import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/app/generated/prisma/client";

/**
 * Répercute rétroactivement un ajustement de solde commun sur toutes les
 * archives de fin de mois (`Mois.soldeCommunFinDeMois`) à partir du mois
 * concerné inclus : sans ça, corriger un mois déjà clôturé laisserait les
 * archives des mois suivants figées sur l'ancienne valeur, désormais fausse.
 */
export function operationPropagationArchiveCommun(
  annee: number,
  mois: number, // 1-12
  delta: number
): Prisma.PrismaPromise<unknown> {
  return prisma.mois.updateMany({
    where: {
      soldeCommunFinDeMois: { not: null },
      OR: [{ annee: { gt: annee } }, { annee, mois: { gte: mois } }],
    },
    data: { soldeCommunFinDeMois: { increment: delta } },
  });
}

/** Même principe que `operationPropagationArchiveCommun`, pour les archives perso/épargne (`SoldePersonneMois`) d'une personne. */
export async function operationsPropagationArchivePerso(
  annee: number,
  mois: number, // 1-12
  personneId: number,
  deltaPerso: number,
  deltaEpargne: number
): Promise<Prisma.PrismaPromise<unknown>[]> {
  if (deltaPerso === 0 && deltaEpargne === 0) return [];
  const moisArchives = await prisma.mois.findMany({
    where: { OR: [{ annee: { gt: annee } }, { annee, mois: { gte: mois } }] },
    select: { id: true },
  });
  const moisIds = moisArchives.map((m) => m.id);
  if (moisIds.length === 0) return [];
  return [
    prisma.soldePersonneMois.updateMany({
      where: { personneId, moisId: { in: moisIds } },
      data: {
        ...(deltaPerso !== 0 ? { soldePerso: { increment: deltaPerso } } : {}),
        ...(deltaEpargne !== 0 ? { soldeEpargne: { increment: deltaEpargne } } : {}),
      },
    }),
  ];
}
