"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { TypeCompte } from "@/app/generated/prisma/client";
import { montantResoluChargeAnnuelle } from "@/lib/calculs";
import { getParametres } from "@/app/actions/parametres";

export async function getChargesAnnuelles() {
  return prisma.chargeAnnuelle.findMany({
    include: { personne: true, categorie: true },
    orderBy: [{ moisEcheance: "asc" }, { libelle: "asc" }],
  });
}

export async function getChargeAnnuelle(id: number) {
  return prisma.chargeAnnuelle.findUnique({ where: { id } });
}

function parseForm(formData: FormData) {
  const libelle = String(formData.get("libelle") ?? "").trim();
  const montant = Number(formData.get("montant"));
  const moisEcheance = Number(formData.get("moisEcheance"));
  const compte = String(formData.get("compte") ?? "COMMUN") as TypeCompte;
  const personneIdRaw = formData.get("personneId");
  const personneId = compte === "PERSO" && personneIdRaw ? Number(personneIdRaw) : null;
  const categorieIdRaw = String(formData.get("categorieId") ?? "").trim();
  const categorieId = categorieIdRaw ? Number(categorieIdRaw) : null;
  const dejaProvisionneRaw = String(formData.get("dejaProvisionne") ?? "").trim();
  const dejaProvisionne = dejaProvisionneRaw ? Number(dejaProvisionneRaw) : null;
  const dateDebutRaw = String(formData.get("dateDebutProvisionnement") ?? "").trim();
  let dateDebutProvisionnement: Date | null = null;
  if (dateDebutRaw) {
    dateDebutProvisionnement = new Date(dateDebutRaw);
    if (Number.isNaN(dateDebutProvisionnement.getTime())) {
      throw new Error("Date de début de provisionnement invalide.");
    }
  }

  if (!libelle) throw new Error("Le libellé est obligatoire.");
  if (!Number.isFinite(montant) || montant < 0) throw new Error("Montant invalide.");
  if (!Number.isInteger(moisEcheance) || moisEcheance < 1 || moisEcheance > 12) {
    throw new Error("Le mois d'échéance doit être compris entre 1 et 12.");
  }
  if (compte === "PERSO" && !personneId) {
    throw new Error("La personne est obligatoire pour une charge annuelle perso.");
  }
  if (dejaProvisionne !== null && (!Number.isFinite(dejaProvisionne) || dejaProvisionne < 0)) {
    throw new Error("Montant déjà provisionné invalide.");
  }
  const anneeDerniereEcheanceRaw = String(formData.get("anneeDerniereEcheance") ?? "").trim();
  const anneeDerniereEcheance = anneeDerniereEcheanceRaw ? Number(anneeDerniereEcheanceRaw) : null;
  if (anneeDerniereEcheance !== null && (!Number.isInteger(anneeDerniereEcheance) || anneeDerniereEcheance < 2000)) {
    throw new Error("Année de dernière échéance invalide.");
  }

  return {
    libelle,
    montant,
    moisEcheance,
    compte,
    personneId,
    categorieId,
    dejaProvisionne,
    dateDebutProvisionnement,
    anneeDerniereEcheance,
  };
}

export async function createChargeAnnuelle(formData: FormData) {
  const data = parseForm(formData);
  await prisma.chargeAnnuelle.create({ data });
  revalidatePath("/charges-annuelles");
  revalidatePath("/");
  redirect("/charges-annuelles");
}

export async function updateChargeAnnuelle(id: number, formData: FormData) {
  const data = parseForm(formData);
  await prisma.chargeAnnuelle.update({ where: { id }, data });
  revalidatePath("/charges-annuelles");
  revalidatePath("/");
  redirect("/charges-annuelles");
}

export async function deleteChargeAnnuelle(formData: FormData) {
  const id = Number(formData.get("id"));
  await prisma.chargeAnnuelle.delete({ where: { id } });
  revalidatePath("/charges-annuelles");
  revalidatePath("/");
}

/**
 * Marque l'échéance annuelle en cours d'une charge annuelle comme réellement
 * payée et débite immédiatement le montant (voir `montantResoluChargeAnnuelle`)
 * du solde actuel — le compte commun pour une charge commune, ou le solde
 * perso de la personne concernée pour une charge perso. Réversible via
 * `demarquerChargeAnnuellePayee`. Contrairement à un achat prévu (ponctuel),
 * une charge annuelle se répète : ce marquage ne concerne que le cycle
 * annuel en cours (redevient automatiquement à régler l'année suivante, sans
 * action manuelle — voir `dejaPayeeCeCycle`/`detailUneChargeAnnuelleMois`).
 *
 * `annee`/`mois` (1-12) : mois auquel attribuer le paiement (`dateDernierPaiement`),
 * typiquement le mois actuellement affiché quand l'action est déclenchée
 * depuis la page d'un mois précis. `null` (déclenché depuis la liste des
 * charges annuelles, hors contexte d'un mois précis) attribue au mois réel
 * d'aujourd'hui.
 */
export async function marquerChargeAnnuellePayee(annee: number | null, mois: number | null, formData: FormData) {
  const id = Number(formData.get("id"));
  const charge = await prisma.chargeAnnuelle.findUnique({ where: { id } });
  if (!charge) return;
  const montant = montantResoluChargeAnnuelle(charge);
  const dateDernierPaiement = annee !== null && mois !== null ? new Date(annee, mois - 1, 1) : new Date();
  if (charge.compte === "PERSO" && charge.personneId) {
    await prisma.$transaction([
      prisma.chargeAnnuelle.update({ where: { id }, data: { dateDernierPaiement } }),
      prisma.personne.update({
        where: { id: charge.personneId },
        data: { soldePerso: { decrement: montant } },
      }),
    ]);
    revalidatePath("/charges-annuelles");
    revalidatePath("/personnes");
    revalidatePath("/");
    return;
  }
  const parametres = await getParametres();
  await prisma.$transaction([
    prisma.chargeAnnuelle.update({ where: { id }, data: { dateDernierPaiement } }),
    prisma.parametres.update({
      where: { id: parametres.id },
      data: { soldeCommun: { decrement: montant } },
    }),
  ]);
  revalidatePath("/charges-annuelles");
  revalidatePath("/parametres");
  revalidatePath("/");
}

/** Annule le marquage « payée » du cycle en cours (efface `dateDernierPaiement`) et recrédite le montant précédemment débité (compte commun ou solde perso, selon le compte de la charge). */
export async function demarquerChargeAnnuellePayee(formData: FormData) {
  const id = Number(formData.get("id"));
  const charge = await prisma.chargeAnnuelle.findUnique({ where: { id } });
  if (!charge) return;
  const montant = montantResoluChargeAnnuelle(charge);
  if (charge.compte === "PERSO" && charge.personneId) {
    await prisma.$transaction([
      prisma.chargeAnnuelle.update({ where: { id }, data: { dateDernierPaiement: null } }),
      prisma.personne.update({
        where: { id: charge.personneId },
        data: { soldePerso: { increment: montant } },
      }),
    ]);
    revalidatePath("/charges-annuelles");
    revalidatePath("/personnes");
    revalidatePath("/");
    return;
  }
  const parametres = await getParametres();
  await prisma.$transaction([
    prisma.chargeAnnuelle.update({ where: { id }, data: { dateDernierPaiement: null } }),
    prisma.parametres.update({
      where: { id: parametres.id },
      data: { soldeCommun: { increment: montant } },
    }),
  ]);
  revalidatePath("/charges-annuelles");
  revalidatePath("/parametres");
  revalidatePath("/");
}
