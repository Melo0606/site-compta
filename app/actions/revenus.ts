"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma, TypeRevenu } from "@/app/generated/prisma/client";
import { operationsPropagationArchivePerso } from "@/lib/archives-soldes";

export async function getRevenus() {
  return prisma.revenu.findMany({
    include: { personne: true },
    orderBy: [{ personne: { nom: "asc" } }, { libelle: "asc" }],
  });
}

export async function getRevenu(id: number) {
  return prisma.revenu.findUnique({ where: { id } });
}

function parseRevenuForm(formData: FormData) {
  const libelle = String(formData.get("libelle") ?? "").trim();
  const montant = Number(formData.get("montant"));
  const personneId = Number(formData.get("personneId"));
  const type = String(formData.get("type") ?? "MENSUEL") as TypeRevenu;
  const dateRaw = String(formData.get("date") ?? "");
  const moisRecurrenceRaw = formData.get("moisRecurrence");
  const jourVersementRaw = String(formData.get("jourVersement") ?? "").trim();

  if (!libelle) throw new Error("Le libellé est obligatoire.");
  if (!Number.isFinite(montant) || montant < 0) throw new Error("Montant invalide.");
  if (!personneId) throw new Error("La personne est obligatoire.");

  let date: Date | null = null;
  let moisRecurrence: number | null = null;
  if (type === "PONCTUEL") {
    if (!dateRaw) throw new Error("La date est obligatoire pour un revenu ponctuel.");
    date = new Date(dateRaw);
    if (Number.isNaN(date.getTime())) throw new Error("Date invalide.");
  } else if (type === "ANNUEL") {
    moisRecurrence = Number(moisRecurrenceRaw);
    if (!Number.isInteger(moisRecurrence) || moisRecurrence < 1 || moisRecurrence > 12) {
      throw new Error("Le mois de versement doit être compris entre 1 et 12.");
    }
  }

  // Sans objet pour un revenu ponctuel (déjà une date exacte).
  const jourVersement = type !== "PONCTUEL" && jourVersementRaw ? Number(jourVersementRaw) : null;
  if (jourVersement !== null && (!Number.isInteger(jourVersement) || jourVersement < 1 || jourVersement > 31)) {
    throw new Error("Le jour de versement doit être compris entre 1 et 31.");
  }

  return { libelle, montant, personneId, type, date, moisRecurrence, jourVersement };
}

export async function createRevenu(formData: FormData) {
  const data = parseRevenuForm(formData);
  await prisma.revenu.create({ data });
  revalidatePath("/revenus");
  revalidatePath("/");
  redirect("/revenus");
}

export async function updateRevenu(id: number, formData: FormData) {
  const data = parseRevenuForm(formData);
  await prisma.revenu.update({ where: { id }, data });
  revalidatePath("/revenus");
  revalidatePath("/");
  redirect("/revenus");
}

export async function deleteRevenu(formData: FormData) {
  const id = Number(formData.get("id"));
  await prisma.revenu.delete({ where: { id } });
  revalidatePath("/revenus");
  revalidatePath("/");
}

/**
 * Si le revenu a déjà été crédité automatiquement sur le solde perso pour ce
 * mois (marqueur `Paiement` REVENU posé par `rattraperRevenusMoisCourant`,
 * au montant connu ce jour-là), répercute l'écart entre l'ancien et le
 * nouveau montant effectif sur `personne.soldePerso` et sur les archives
 * de fin de mois suivantes — sinon le solde resterait sur l'ancien montant
 * (ex : crédité 2000€ le 1er, montant réel 1985,50€ saisi le 3). Rien à
 * faire tant que le revenu n'est pas crédité : il le sera au bon montant.
 */
async function operationsCorrectionRevenuCredite(
  revenuId: number,
  annee: number,
  mois: number, // 1-12
  ancienMontant: number,
  nouveauMontant: number
): Promise<Prisma.PrismaPromise<unknown>[]> {
  const delta = nouveauMontant - ancienMontant;
  if (delta === 0) return [];
  const [revenu, ligneMois] = await Promise.all([
    prisma.revenu.findUnique({ where: { id: revenuId } }),
    prisma.mois.findUnique({ where: { annee_mois: { annee, mois } } }),
  ]);
  if (!revenu || !ligneMois) return [];
  const credite = await prisma.paiement.findUnique({
    where: { moisId_type_refId: { moisId: ligneMois.id, type: "REVENU", refId: revenuId } },
  });
  if (!credite) return [];
  return [
    prisma.personne.update({
      where: { id: revenu.personneId },
      data: { soldePerso: { increment: delta } },
    }),
    ...(await operationsPropagationArchivePerso(annee, mois, revenu.personneId, delta, 0)),
  ];
}

/**
 * Enregistre le montant réel d'un revenu annuel pour une année donnée (ex :
 * la prime d'intéressement d'octobre 2026 était finalement de 2500€ au lieu
 * des 2000€ de référence). Un champ vidé retire l'override, retour au
 * montant de référence.
 */
export async function setRevenuAnnuelMontant(revenuId: number, annee: number, formData: FormData) {
  const raw = String(formData.get("montant") ?? "").trim();
  const montant = raw === "" ? null : Number(raw);
  if (montant !== null && (!Number.isFinite(montant) || montant < 0)) throw new Error("Montant invalide.");

  const [revenu, existant] = await Promise.all([
    prisma.revenu.findUnique({ where: { id: revenuId } }),
    prisma.revenuAnnuelMontant.findUnique({ where: { revenuId_annee: { revenuId, annee } } }),
  ]);
  if (!revenu) throw new Error("Revenu introuvable.");
  const correction = revenu.moisRecurrence
    ? await operationsCorrectionRevenuCredite(
        revenuId,
        annee,
        revenu.moisRecurrence,
        existant?.montant ?? revenu.montant,
        montant ?? revenu.montant
      )
    : [];

  await prisma.$transaction([
    montant === null
      ? prisma.revenuAnnuelMontant.deleteMany({ where: { revenuId, annee } })
      : prisma.revenuAnnuelMontant.upsert({
          where: { revenuId_annee: { revenuId, annee } },
          create: { revenuId, annee, montant },
          update: { montant },
        }),
    ...correction,
  ]);

  revalidatePath("/revenus");
  revalidatePath("/");
  if (revenu.moisRecurrence) revalidatePath(`/mois/${annee}-${String(revenu.moisRecurrence).padStart(2, "0")}`);
  if (correction.length > 0) revalidatePath("/personnes");
}

/** Récupère les montants réels des revenus annuels, par (revenuId, année). */
export async function getRevenuAnnuelMontantsParAnnee(): Promise<Map<string, number>> {
  const lignes = await prisma.revenuAnnuelMontant.findMany();
  const result = new Map<string, number>();
  for (const ligne of lignes) {
    result.set(`${ligne.revenuId}:${ligne.annee}`, ligne.montant);
  }
  return result;
}

/**
 * Enregistre le montant réel d'un revenu mensuel pour un mois donné (ex : le
 * salaire de mars 2026 était finalement de 1980€ au lieu des 2000€ de
 * référence). Un champ vidé retire l'override, retour au montant de
 * référence défini sur la personne.
 */
export async function setRevenuMensuelMontant(revenuId: number, annee: number, mois: number, formData: FormData) {
  const raw = String(formData.get("montant") ?? "").trim();
  const montant = raw === "" ? null : Number(raw);
  if (montant !== null && (!Number.isFinite(montant) || montant < 0)) throw new Error("Montant invalide.");

  const [revenu, existant] = await Promise.all([
    prisma.revenu.findUnique({ where: { id: revenuId } }),
    prisma.revenuMensuelMontant.findUnique({ where: { revenuId_annee_mois: { revenuId, annee, mois } } }),
  ]);
  if (!revenu) throw new Error("Revenu introuvable.");
  const correction = await operationsCorrectionRevenuCredite(
    revenuId,
    annee,
    mois,
    existant?.montant ?? revenu.montant,
    montant ?? revenu.montant
  );

  await prisma.$transaction([
    montant === null
      ? prisma.revenuMensuelMontant.deleteMany({ where: { revenuId, annee, mois } })
      : prisma.revenuMensuelMontant.upsert({
          where: { revenuId_annee_mois: { revenuId, annee, mois } },
          create: { revenuId, annee, mois, montant },
          update: { montant },
        }),
    ...correction,
  ]);

  revalidatePath("/revenus");
  revalidatePath("/");
  revalidatePath(`/mois/${annee}-${String(mois).padStart(2, "0")}`);
  if (correction.length > 0) revalidatePath("/personnes");
}

/** Récupère les montants réels des revenus mensuels, par (revenuId, année, mois). */
export async function getRevenuMensuelMontantsParMois(): Promise<Map<string, number>> {
  const lignes = await prisma.revenuMensuelMontant.findMany();
  const result = new Map<string, number>();
  for (const ligne of lignes) {
    result.set(`${ligne.revenuId}:${ligne.annee}:${ligne.mois}`, ligne.montant);
  }
  return result;
}
