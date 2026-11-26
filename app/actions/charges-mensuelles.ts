"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { TypeCompte } from "@/app/generated/prisma/client";
import { changementEnVigueur, type HistoriqueMontantCharge } from "@/lib/calculs";

export async function getChargesMensuelles() {
  return prisma.chargeMensuelle.findMany({
    include: { personne: true, categorie: { include: { parent: true } } },
    orderBy: [{ compte: "asc" }, { libelle: "asc" }],
  });
}

export async function getChargeMensuelle(id: number) {
  return prisma.chargeMensuelle.findUnique({ where: { id } });
}

/** Nombre de charges budget « dépenses du quotidien » dont le montant de référence n'a pas encore été fixé (encore à 0€). */
export async function compterBudgetsQuotidiensNonConfigures(): Promise<number> {
  return prisma.chargeMensuelle.count({
    where: { budgetDepensesQuotidiennes: true, montant: 0 },
  });
}

function parseForm(formData: FormData) {
  const libelle = String(formData.get("libelle") ?? "").trim();
  const categorieIdRaw = String(formData.get("categorieId") ?? "").trim();
  const categorieId = categorieIdRaw ? Number(categorieIdRaw) : null;
  const montant = Number(formData.get("montant"));
  const compte = String(formData.get("compte") ?? "COMMUN") as TypeCompte;
  const personneIdRaw = formData.get("personneId");
  const personneId = compte === "PERSO" && personneIdRaw ? Number(personneIdRaw) : null;
  const dateDebutRaw = String(formData.get("dateDebut") ?? "").trim();
  let dateDebut: Date | null = null;
  if (dateDebutRaw) {
    dateDebut = new Date(dateDebutRaw);
    if (Number.isNaN(dateDebut.getTime())) throw new Error("Date de début invalide.");
  }
  const dateFinRaw = String(formData.get("dateFin") ?? "").trim();
  let dateFin: Date | null = null;
  if (dateFinRaw) {
    dateFin = new Date(dateFinRaw);
    if (Number.isNaN(dateFin.getTime())) throw new Error("Date de fin invalide.");
  }
  const montantVariable = formData.get("montantVariable") === "on";
  const jourDebitRaw = String(formData.get("jourDebit") ?? "").trim();
  const jourDebit = jourDebitRaw ? Number(jourDebitRaw) : null;
  const moisDebutAnneeRaw = String(formData.get("moisDebutAnnee") ?? "").trim();
  const moisFinAnneeRaw = String(formData.get("moisFinAnnee") ?? "").trim();
  const moisDebutAnnee = moisDebutAnneeRaw ? Number(moisDebutAnneeRaw) : null;
  const moisFinAnnee = moisFinAnneeRaw ? Number(moisFinAnneeRaw) : null;

  if (!libelle) throw new Error("Le libellé est obligatoire.");
  if (!categorieId) throw new Error("La catégorie est obligatoire.");
  if (!Number.isFinite(montant) || montant < 0) throw new Error("Montant invalide.");
  if (compte === "PERSO" && !personneId) {
    throw new Error("La personne est obligatoire pour une charge perso.");
  }
  if (dateDebut && dateFin && dateFin < dateDebut) {
    throw new Error("La date de fin doit être postérieure à la date de début.");
  }
  if (jourDebit !== null && (!Number.isInteger(jourDebit) || jourDebit < 1 || jourDebit > 31)) {
    throw new Error("Le jour de prélèvement doit être compris entre 1 et 31.");
  }
  if ((moisDebutAnnee === null) !== (moisFinAnnee === null)) {
    throw new Error("Choisir à la fois le premier et le dernier mois concernés, ou « Tous les mois » pour les deux.");
  }
  for (const m of [moisDebutAnnee, moisFinAnnee]) {
    if (m !== null && (!Number.isInteger(m) || m < 1 || m > 12)) throw new Error("Mois concernés invalides.");
  }

  return {
    libelle,
    categorieId,
    montant,
    compte,
    personneId,
    dateDebut,
    dateFin,
    montantVariable,
    jourDebit,
    moisDebutAnnee,
    moisFinAnnee,
  };
}

export async function createChargeMensuelle(formData: FormData) {
  const data = parseForm(formData);
  await prisma.chargeMensuelle.create({ data });
  revalidatePath("/charges-mensuelles");
  revalidatePath("/");
  redirect("/charges-mensuelles");
}

/**
 * Le champ « Montant actuel » porte le montant du mois en cours : s'il vient
 * d'un changement daté, c'est ce changement qui est corrigé, et le montant de
 * base (période « Début → … ») reste intact.
 */
export async function updateChargeMensuelle(id: number, formData: FormData) {
  const { montant, ...data } = parseForm(formData);
  const aujourdhui = new Date();
  const enVigueur = changementEnVigueur(
    await getHistoriqueMontantsPourCharge(id),
    aujourdhui.getFullYear(),
    aujourdhui.getMonth()
  );
  await prisma.$transaction([
    prisma.chargeMensuelle.update({ where: { id }, data: enVigueur ? data : { ...data, montant } }),
    ...(enVigueur
      ? [prisma.chargeMensuelleMontant.update({ where: { id: enVigueur.id }, data: { montant } })]
      : []),
  ]);
  revalidatePath("/charges-mensuelles");
  revalidatePath("/");
  redirect("/charges-mensuelles");
}

export async function deleteChargeMensuelle(formData: FormData) {
  const id = Number(formData.get("id"));
  await prisma.chargeMensuelle.delete({ where: { id } });
  revalidatePath("/charges-mensuelles");
  revalidatePath("/");
}

/**
 * S'assure qu'une charge mensuelle « Dépenses du quotidien » existe pour ce
 * périmètre (compte commun si `personneId` est `null`, sinon cette
 * personne), avec un montant de référence à 0 que l'utilisateur fixe
 * ensuite lui-même via cette page — appelée à la création d'une personne et
 * en filet de sécurité au premier ajout d'une dépense du quotidien.
 */
export async function assurerChargeBudgetDepensesQuotidiennes(personneId: number | null): Promise<void> {
  const compte = personneId === null ? "COMMUN" : "PERSO";
  const existe = await prisma.chargeMensuelle.findFirst({
    where: { budgetDepensesQuotidiennes: true, compte, personneId },
  });
  if (existe) return;

  const categorie =
    (await prisma.categorie.findFirst({ where: { nom: "Quotidien", parentId: null } })) ??
    (await prisma.categorie.create({ data: { nom: "Quotidien" } }));

  await prisma.chargeMensuelle.create({
    data: {
      libelle: "Dépenses du quotidien",
      categorieId: categorie.id,
      montant: 0,
      compte,
      personneId,
      montantVariable: true,
      budgetDepensesQuotidiennes: true,
    },
  });
}

/** Historique des changements de montant datés, groupé par charge (toutes charges confondues). */
export async function getHistoriqueMontantsParCharge(): Promise<Map<number, HistoriqueMontantCharge[]>> {
  const lignes = await prisma.chargeMensuelleMontant.findMany({
    orderBy: [{ chargeMensuelleId: "asc" }, { depuisAnnee: "asc" }, { depuisMois: "asc" }],
  });
  const result = new Map<number, HistoriqueMontantCharge[]>();
  for (const l of lignes) {
    if (!result.has(l.chargeMensuelleId)) result.set(l.chargeMensuelleId, []);
    result.get(l.chargeMensuelleId)!.push(l);
  }
  return result;
}

/** Historique des changements de montant datés d'une seule charge, trié par date. */
export async function getHistoriqueMontantsPourCharge(
  chargeMensuelleId: number
): Promise<HistoriqueMontantCharge[]> {
  return prisma.chargeMensuelleMontant.findMany({
    where: { chargeMensuelleId },
    orderBy: [{ depuisAnnee: "asc" }, { depuisMois: "asc" }],
  });
}

/**
 * Change le montant d'une charge mensuelle à partir d'un mois donné (ex :
 * l'assurance passe de 150€ à 120€ à partir de mars) — n'affecte que ce mois
 * et les suivants, contrairement à `updateChargeMensuelle` qui corrige le
 * montant de base partout. Ré-saisir pour un mois déjà changé corrige ce
 * changement (upsert) plutôt que d'échouer.
 */
export async function changerMontantDepuis(chargeMensuelleId: number, formData: FormData) {
  const montant = Number(formData.get("montant"));
  const depuisAnnee = Number(formData.get("depuisAnnee"));
  const depuisMois = Number(formData.get("depuisMois"));

  if (!Number.isFinite(montant) || montant < 0) throw new Error("Montant invalide.");
  if (!Number.isInteger(depuisAnnee) || depuisAnnee < 2000) throw new Error("Année invalide.");
  if (!Number.isInteger(depuisMois) || depuisMois < 1 || depuisMois > 12) {
    throw new Error("Le mois doit être compris entre 1 et 12.");
  }

  await prisma.chargeMensuelleMontant.upsert({
    where: { chargeMensuelleId_depuisAnnee_depuisMois: { chargeMensuelleId, depuisAnnee, depuisMois } },
    create: { chargeMensuelleId, montant, depuisAnnee, depuisMois },
    update: { montant },
  });

  revalidatePath("/charges-mensuelles");
  revalidatePath("/");
}

/**
 * Corrige le montant d'une période de l'historique (erreur de saisie) :
 * `historiqueId` vide = première période (montant de base de la charge),
 * sinon le changement daté correspondant. Les dates ne bougent pas.
 */
export async function corrigerMontantPeriode(chargeMensuelleId: number, formData: FormData) {
  const historiqueIdRaw = String(formData.get("historiqueId") ?? "").trim();
  const montant = Number(formData.get("montant"));
  if (!Number.isFinite(montant) || montant < 0) throw new Error("Montant invalide.");

  if (historiqueIdRaw) {
    await prisma.chargeMensuelleMontant.update({
      where: { id: Number(historiqueIdRaw), chargeMensuelleId },
      data: { montant },
    });
  } else {
    await prisma.chargeMensuelle.update({ where: { id: chargeMensuelleId }, data: { montant } });
  }

  revalidatePath("/charges-mensuelles");
  revalidatePath("/");
}

/** Supprime un changement de montant daté (annule une saisie faite par erreur). */
export async function supprimerHistoriqueMontant(formData: FormData) {
  const id = Number(formData.get("id"));
  await prisma.chargeMensuelleMontant.delete({ where: { id } });
  revalidatePath("/charges-mensuelles");
  revalidatePath("/");
}
