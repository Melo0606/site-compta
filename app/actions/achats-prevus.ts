"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { TypeCompte } from "@/app/generated/prisma/client";
import { getParametres } from "@/app/actions/parametres";

export async function getAchatsPrevus() {
  return prisma.achatPrevu.findMany({
    include: { categorie: true, personne: true },
    orderBy: { dateVisee: "asc" },
  });
}

export async function getAchatPrevu(id: number) {
  return prisma.achatPrevu.findUnique({ where: { id } });
}

function parseForm(formData: FormData) {
  const libelle = String(formData.get("libelle") ?? "").trim();
  const montantCible = Number(formData.get("montantCible"));
  const dejaProvisionne = Number(formData.get("dejaProvisionne") ?? 0);
  const dateViseeRaw = String(formData.get("dateVisee") ?? "");
  const dateDebutRaw = String(formData.get("dateDebutProvisionnement") ?? "").trim();
  const categorieIdRaw = String(formData.get("categorieId") ?? "").trim();
  const categorieId = categorieIdRaw ? Number(categorieIdRaw) : null;
  const sansProvisionnement = formData.get("sansProvisionnement") === "on";
  const compte = String(formData.get("compte") ?? "COMMUN") as TypeCompte;
  const personneIdRaw = formData.get("personneId");
  const personneId = compte === "PERSO" && personneIdRaw ? Number(personneIdRaw) : null;

  if (!libelle) throw new Error("Le libellé est obligatoire.");
  if (!Number.isFinite(montantCible) || montantCible < 0) throw new Error("Montant cible invalide.");
  if (!Number.isFinite(dejaProvisionne) || dejaProvisionne < 0) throw new Error("Montant déjà provisionné invalide.");
  if (!dateViseeRaw) throw new Error("La date visée est obligatoire.");
  if (compte === "PERSO" && !personneId) {
    throw new Error("La personne est obligatoire pour un achat perso.");
  }

  const dateVisee = new Date(dateViseeRaw);
  if (Number.isNaN(dateVisee.getTime())) throw new Error("Date visée invalide.");

  let dateDebutProvisionnement: Date | null = null;
  if (dateDebutRaw) {
    dateDebutProvisionnement = new Date(dateDebutRaw);
    if (Number.isNaN(dateDebutProvisionnement.getTime())) {
      throw new Error("Date de début de provisionnement invalide.");
    }
    if (dateDebutProvisionnement > dateVisee) {
      throw new Error("La date de début de provisionnement doit être antérieure à la date visée.");
    }
  }

  return {
    libelle,
    montantCible,
    dejaProvisionne,
    dateVisee,
    dateDebutProvisionnement,
    categorieId,
    sansProvisionnement,
    compte,
    personneId,
  };
}

export async function createAchatPrevu(formData: FormData) {
  const data = parseForm(formData);
  await prisma.achatPrevu.create({ data });
  revalidatePath("/achats-prevus");
  revalidatePath("/");
  redirect("/achats-prevus");
}

export async function updateAchatPrevu(id: number, formData: FormData) {
  const data = parseForm(formData);
  await prisma.achatPrevu.update({ where: { id }, data });
  revalidatePath("/achats-prevus");
  revalidatePath("/");
  redirect("/achats-prevus");
}

export async function deleteAchatPrevu(formData: FormData) {
  const id = Number(formData.get("id"));
  await prisma.achatPrevu.delete({ where: { id } });
  revalidatePath("/achats-prevus");
  revalidatePath("/");
}

/**
 * Marque un achat prévu comme réellement acheté (n'affecte pas dejaProvisionne,
 * réversible) et débite immédiatement le montant restant du solde actuel —
 * le compte commun (Paramètres > Solde du compte commun) pour un achat
 * commun, ou le solde perso de la personne concernée pour un achat perso —
 * qui reste modifiable à la main à tout moment (attention au double comptage
 * si le solde est aussi corrigé manuellement après relevé bancaire).
 *
 * `annee`/`mois` (1-12) : mois auquel attribuer l'achat (`dateAchat`), depuis
 * lequel l'achat n'apparaîtra plus que ce mois-là dans le détail mensuel —
 * typiquement le mois actuellement affiché quand l'action est déclenchée
 * depuis la page d'un mois précis. `null` (déclenché depuis la liste des
 * achats prévus, hors contexte d'un mois précis) attribue au mois réel
 * d'aujourd'hui.
 */
export async function marquerAchatAchete(annee: number | null, mois: number | null, formData: FormData) {
  const id = Number(formData.get("id"));
  const achat = await prisma.achatPrevu.findUnique({ where: { id } });
  if (!achat) return;
  const restant = Math.max(achat.montantCible - achat.dejaProvisionne, 0);
  const dateAchat = annee !== null && mois !== null ? new Date(annee, mois - 1, 1) : new Date();
  if (achat.compte === "PERSO" && achat.personneId) {
    await prisma.$transaction([
      prisma.achatPrevu.update({ where: { id }, data: { achete: true, dateAchat } }),
      prisma.personne.update({
        where: { id: achat.personneId },
        data: { soldePerso: { decrement: restant } },
      }),
    ]);
    revalidatePath("/achats-prevus");
    revalidatePath("/personnes");
    revalidatePath("/");
    return;
  }
  const parametres = await getParametres();
  await prisma.$transaction([
    prisma.achatPrevu.update({ where: { id }, data: { achete: true, dateAchat } }),
    prisma.parametres.update({
      where: { id: parametres.id },
      data: { soldeCommun: { decrement: restant } },
    }),
  ]);
  revalidatePath("/achats-prevus");
  revalidatePath("/parametres");
  revalidatePath("/");
}

/** Annule le marquage « acheté », repasse l'achat en cours (efface `dateAchat`) et recrédite le montant précédemment débité (compte commun ou solde perso, selon le compte de l'achat). */
export async function demarquerAchatAchete(formData: FormData) {
  const id = Number(formData.get("id"));
  const achat = await prisma.achatPrevu.findUnique({ where: { id } });
  if (!achat) return;
  const restant = Math.max(achat.montantCible - achat.dejaProvisionne, 0);
  if (achat.compte === "PERSO" && achat.personneId) {
    await prisma.$transaction([
      prisma.achatPrevu.update({ where: { id }, data: { achete: false, dateAchat: null } }),
      prisma.personne.update({
        where: { id: achat.personneId },
        data: { soldePerso: { increment: restant } },
      }),
    ]);
    revalidatePath("/achats-prevus");
    revalidatePath("/personnes");
    revalidatePath("/");
    return;
  }
  const parametres = await getParametres();
  await prisma.$transaction([
    prisma.achatPrevu.update({ where: { id }, data: { achete: false, dateAchat: null } }),
    prisma.parametres.update({
      where: { id: parametres.id },
      data: { soldeCommun: { increment: restant } },
    }),
  ]);
  revalidatePath("/achats-prevus");
  revalidatePath("/parametres");
  revalidatePath("/");
}
