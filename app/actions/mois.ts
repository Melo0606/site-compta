"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import type { ChargeMensuelle, Personne, TypeElementPaiement, Prisma } from "@/app/generated/prisma/client";
import {
  clePaiement,
  estChargeMensuelleActive,
  montantPayeEffectifCharge,
  chargeDejaDebiteeParDefaut,
  revenuActifPourMois,
  withMontantResolu,
  type SuiviMoisResume,
  type MoisSuiviBrut,
  type HistoriqueMontantCharge,
} from "@/lib/calculs";
import type { DepenseQuotidiennePeriode } from "@/lib/stats";
import {
  assurerChargeBudgetDepensesQuotidiennes,
  getHistoriqueMontantsParCharge,
} from "@/app/actions/charges-mensuelles";
import { getParametres } from "@/app/actions/parametres";
import { operationPropagationArchiveCommun, operationsPropagationArchivePerso } from "@/lib/archives-soldes";

// Toutes les fonctions de ce fichier attendent `mois` au format stocké en
// base, 1-12 (janvier = 1), PAS l'index JS Date 0-11. Les appelants doivent
// convertir (mois0 + 1) avant d'appeler une action d'écriture.

/**
 * Le mois ciblé est-il déjà entamé (mois courant ou passé) ? Sert à
 * n'appliquer une correction de solde en direct (soldeCommun/soldePerso/
 * soldeEpargne) que pour un mouvement qui a réellement pu avoir lieu — jamais
 * pour un mois futur, pas encore entamé, où rien n'a encore pu être
 * transféré/payé dans la vraie vie, même si un suivi est saisi à l'avance
 * (voir `operationsAjustementSolde`, `setVirementEpargneMois`).
 */
function estMoisPasseOuCourant(annee: number, mois: number /* 1-12 */): boolean {
  const now = new Date();
  const cibleAbs = annee * 12 + (mois - 1);
  const actuelAbs = now.getFullYear() * 12 + now.getMonth();
  return cibleAbs <= actuelAbs;
}

async function getOrCreateMois(annee: number, mois: number) {
  const existing = await prisma.mois.findUnique({ where: { annee_mois: { annee, mois } } });
  if (existing) return existing;
  return prisma.mois.create({ data: { annee, mois } });
}

export type DepenseQuotidienneRow = {
  id: number;
  libelle: string;
  montant: number;
  date: Date | null;
  personneId: number | null;
  categorieId: number | null;
  categorieNom: string | null;
};

export type MoisDetail = {
  moisId: number | null;
  paiements: Map<string, boolean>; // clé = `${type}:${refId}`
  /** Montant réellement payé, quand il a été précisé (sinon absent : utiliser le montant de référence). */
  montants: Map<string, number>; // clé = `${type}:${refId}`
  virements: Map<number, number>; // clé = personneId, vers le compte commun
  virementsEpargne: Map<number, number>; // clé = personneId, virement vers l'épargne
  depensesQuotidiennes: DepenseQuotidienneRow[]; // personneId = null → compte commun
};

/** Lecture seule : ne crée pas de ligne Mois si elle n'existe pas encore. */
export async function getMoisDetail(annee: number, mois: number): Promise<MoisDetail> {
  const ligne = await prisma.mois.findUnique({
    where: { annee_mois: { annee, mois } },
    include: {
      paiements: true,
      virements: true,
      virementsEpargne: true,
      depensesQuotidiennes: {
        include: { categorie: true },
        // Toujours de la plus ancienne à la plus récente ; sans date en dernier, puis ordre de saisie.
        orderBy: [{ date: { sort: "asc", nulls: "last" } }, { id: "asc" }],
      },
    },
  });

  if (!ligne) {
    return {
      moisId: null,
      paiements: new Map(),
      montants: new Map(),
      virements: new Map(),
      virementsEpargne: new Map(),
      depensesQuotidiennes: [],
    };
  }

  const paiements = new Map<string, boolean>();
  const montants = new Map<string, number>();
  for (const p of ligne.paiements) {
    paiements.set(clePaiement(p.type, p.refId), p.payee);
    if (p.montant !== null) montants.set(clePaiement(p.type, p.refId), p.montant);
  }
  const virements = new Map<number, number>();
  for (const v of ligne.virements) {
    virements.set(v.personneId, v.montant);
  }
  const virementsEpargne = new Map<number, number>();
  for (const v of ligne.virementsEpargne) {
    virementsEpargne.set(v.personneId, v.montant);
  }

  return {
    moisId: ligne.id,
    paiements,
    montants,
    virements,
    virementsEpargne,
    depensesQuotidiennes: ligne.depensesQuotidiennes.map((d) => ({
      id: d.id,
      libelle: d.libelle,
      montant: d.montant,
      date: d.date,
      personneId: d.personneId,
      categorieId: d.categorieId,
      categorieNom: d.categorie?.nom ?? null,
    })),
  };
}

/**
 * Montant signé d'une ligne « dépenses du quotidien » : positif pour une
 * dépense, négatif pour un remboursement (champ `sens` = "remboursement").
 * Le signe suffit à tout le reste : le solde est décrémenté du montant signé
 * (donc crédité pour un remboursement), et les totaux du mois, le budget
 * « dépenses du quotidien » et les stats raisonnent en net.
 */
function lireMontantSigneDepenseQuotidienne(formData: FormData): number {
  const montant = Number(formData.get("montant"));
  if (!Number.isFinite(montant) || montant <= 0) throw new Error("Montant invalide.");
  return formData.get("sens") === "remboursement" ? -montant : montant;
}

/**
 * Ajoute une dépense du quotidien pour le compte commun (personneId = null)
 * ou une personne, pour un mois donné. Décrémente aussitôt le solde
 * correspondant (`parametres.soldeCommun` ou `personne.soldePerso`) du
 * montant saisi : le solde suit le réel en direct plutôt que d'attendre une
 * réconciliation manuelle (voir `montantPayeEffectifCharge` pour le pendant
 * côté budget/projection).
 */
export async function ajouterDepenseQuotidienne(
  annee: number,
  mois: number,
  personneId: number | null,
  formData: FormData
) {
  const libelle = String(formData.get("libelle") ?? "").trim();
  if (libelle === "") throw new Error("Libellé requis.");

  const montant = lireMontantSigneDepenseQuotidienne(formData);

  const dateRaw = String(formData.get("date") ?? "").trim();
  const date = dateRaw === "" ? null : new Date(dateRaw);
  if (date !== null && Number.isNaN(date.getTime())) throw new Error("Date invalide.");

  const categorieIdRaw = String(formData.get("categorieId") ?? "").trim();
  const categorieId = categorieIdRaw ? Number(categorieIdRaw) : null;

  const ligneMois = await getOrCreateMois(annee, mois);
  const operations: Prisma.PrismaPromise<unknown>[] = [
    prisma.depenseQuotidienne.create({
      data: { moisId: ligneMois.id, personneId, libelle, montant, date, categorieId },
    }),
  ];
  if (personneId === null) {
    const parametres = await getParametres();
    operations.push(
      prisma.parametres.update({
        where: { id: parametres.id },
        data: { soldeCommun: { decrement: montant } },
      }),
      operationPropagationArchiveCommun(annee, mois, -montant)
    );
  } else {
    operations.push(
      prisma.personne.update({
        where: { id: personneId },
        data: { soldePerso: { decrement: montant } },
      }),
      ...(await operationsPropagationArchivePerso(annee, mois, personneId, -montant, 0))
    );
  }
  await Promise.all([prisma.$transaction(operations), assurerChargeBudgetDepensesQuotidiennes(personneId)]);

  revalidatePath(`/mois/${annee}-${String(mois).padStart(2, "0")}`);
  revalidatePath("/");
  if (personneId === null) revalidatePath("/parametres");
  else revalidatePath("/personnes");
}

/**
 * Modifie une dépense du quotidien déjà enregistrée. Si le montant change,
 * répercute uniquement la différence sur le solde correspondant (et sur les
 * archives postérieures si ce mois est déjà clôturé — voir
 * `operationPropagationArchiveCommun`).
 */
export async function modifierDepenseQuotidienne(id: number, formData: FormData) {
  const libelle = String(formData.get("libelle") ?? "").trim();
  if (libelle === "") throw new Error("Libellé requis.");

  const montant = lireMontantSigneDepenseQuotidienne(formData);

  const dateRaw = String(formData.get("date") ?? "").trim();
  const date = dateRaw === "" ? null : new Date(dateRaw);
  if (date !== null && Number.isNaN(date.getTime())) throw new Error("Date invalide.");

  const categorieIdRaw = String(formData.get("categorieId") ?? "").trim();
  const categorieId = categorieIdRaw ? Number(categorieIdRaw) : null;

  const existante = await prisma.depenseQuotidienne.findUniqueOrThrow({ where: { id }, include: { mois: true } });
  const deltaMontant = montant - existante.montant;

  const operations: Prisma.PrismaPromise<unknown>[] = [
    prisma.depenseQuotidienne.update({ where: { id }, data: { libelle, montant, date, categorieId } }),
  ];
  if (deltaMontant !== 0) {
    if (existante.personneId === null) {
      const parametres = await getParametres();
      operations.push(
        prisma.parametres.update({
          where: { id: parametres.id },
          data: { soldeCommun: { decrement: deltaMontant } },
        }),
        operationPropagationArchiveCommun(existante.mois.annee, existante.mois.mois, -deltaMontant)
      );
    } else {
      operations.push(
        prisma.personne.update({
          where: { id: existante.personneId },
          data: { soldePerso: { decrement: deltaMontant } },
        }),
        ...(await operationsPropagationArchivePerso(
          existante.mois.annee,
          existante.mois.mois,
          existante.personneId,
          -deltaMontant,
          0
        ))
      );
    }
  }
  await prisma.$transaction(operations);

  revalidatePath(`/mois/${existante.mois.annee}-${String(existante.mois.mois).padStart(2, "0")}`);
  revalidatePath("/");
  if (existante.personneId === null) revalidatePath("/parametres");
  else revalidatePath("/personnes");
}

/**
 * Supprime une dépense du quotidien. Recrédite le solde correspondant
 * (`parametres.soldeCommun` ou `personne.soldePerso`).
 */
export async function supprimerDepenseQuotidienne(formData: FormData) {
  const id = Number(formData.get("id"));
  const depense = await prisma.depenseQuotidienne.findUniqueOrThrow({ where: { id }, include: { mois: true } });

  const operations: Prisma.PrismaPromise<unknown>[] = [prisma.depenseQuotidienne.delete({ where: { id } })];
  if (depense.personneId === null) {
    const parametres = await getParametres();
    operations.push(
      prisma.parametres.update({
        where: { id: parametres.id },
        data: { soldeCommun: { increment: depense.montant } },
      }),
      operationPropagationArchiveCommun(depense.mois.annee, depense.mois.mois, depense.montant)
    );
  } else {
    operations.push(
      prisma.personne.update({
        where: { id: depense.personneId },
        data: { soldePerso: { increment: depense.montant } },
      }),
      ...(await operationsPropagationArchivePerso(
        depense.mois.annee,
        depense.mois.mois,
        depense.personneId,
        depense.montant,
        0
      ))
    );
  }
  await prisma.$transaction(operations);

  revalidatePath(`/mois/${depense.mois.annee}-${String(depense.mois.mois).padStart(2, "0")}`);
  revalidatePath("/");
  if (depense.personneId === null) revalidatePath("/parametres");
  else revalidatePath("/personnes");
}

type EtatPaiementCharge = { payee: boolean; montant: number | null } | null;

/**
 * Delta à appliquer au solde suite à un changement d'état "payé"/"viré" d'une
 * charge mensuelle commune ou d'un virement épargne fixe (les charges
 * annuelles/achats prévus ne passent pas par ici : provisionnées au prorata,
 * elles ne débitent le solde qu'à leur échéance réelle — voir
 * `detailMoisCommun` / `marquerAchatAchete`). Une charge est considérée
 * payée au montant de référence par défaut (aucune ligne `Paiement` =
 * `ancienEtat`/`nouvelEtat` à `null`), donc le point de départ (aucun état
 * explicite) ne génère aucun ajustement — seul un changement explicite
 * (décochage, recochage, saisie d'un montant réel différent) déplace de
 * l'argent, dans un sens ou dans l'autre.
 */
async function calculerAjustementPaiementCharge(
  charge: Pick<ChargeMensuelle, "id" | "montant" | "jourDebit">,
  annee: number,
  mois: number, // 1-12
  ancienEtat: EtatPaiementCharge,
  nouvelEtat: EtatPaiementCharge
): Promise<number> {
  const historiqueParCharge = await getHistoriqueMontantsParCharge();
  const referenceMontant = withMontantResolu([charge], historiqueParCharge, annee, mois - 1)[0].montant;
  const defautPaye = chargeDejaDebiteeParDefaut(charge, annee, mois - 1, new Date());
  const effectif = (etat: EtatPaiementCharge) => {
    if (!etat) return defautPaye ? referenceMontant : 0;
    if (etat.montant !== null) return etat.montant;
    if (etat.payee === false) return 0;
    return referenceMontant;
  };
  return effectif(ancienEtat) - effectif(nouvelEtat);
}

/**
 * Traduit un ajustement de solde en opérations Prisma sur le bon compte :
 * `parametres.soldeCommun` pour une charge COMMUN, `personne.soldePerso` pour
 * une charge PERSO. Répercute aussi la correction sur les archives
 * postérieures (voir `operationPropagationArchiveCommun`/
 * `operationsPropagationArchivePerso`). Aucun ajustement pour un mois futur
 * (voir `estMoisPasseOuCourant`) : le "payé par défaut" n'a alors aucune
 * réalité à corriger, le paiement ne pouvant pas avoir eu lieu.
 */
async function operationsAjustementSolde(
  charge: Pick<ChargeMensuelle, "compte" | "personneId">,
  parametresId: number,
  ajustementSolde: number,
  annee: number,
  mois: number // 1-12
): Promise<Prisma.PrismaPromise<unknown>[]> {
  if (ajustementSolde === 0 || !estMoisPasseOuCourant(annee, mois)) return [];
  if (charge.compte === "COMMUN") {
    return [
      prisma.parametres.update({
        where: { id: parametresId },
        data: { soldeCommun: { increment: ajustementSolde } },
      }),
      operationPropagationArchiveCommun(annee, mois, ajustementSolde),
    ];
  }
  if (charge.compte === "PERSO" && charge.personneId) {
    return [
      prisma.personne.update({
        where: { id: charge.personneId },
        data: { soldePerso: { increment: ajustementSolde } },
      }),
      ...(await operationsPropagationArchivePerso(annee, mois, charge.personneId, ajustementSolde, 0)),
    ];
  }
  return [];
}

/** Coche/décoche un élément (charge mensuelle, charge annuelle ou achat prévu) comme payé pour un mois. */
export async function togglePaiement(
  annee: number,
  mois: number,
  type: TypeElementPaiement,
  refId: number,
  payee: boolean
) {
  const ligneMois = await getOrCreateMois(annee, mois);

  let ajustementOps: Prisma.PrismaPromise<unknown>[] = [];
  let charge: ChargeMensuelle | null = null;
  if (type === "CHARGE_MENSUELLE") {
    charge = await prisma.chargeMensuelle.findUnique({ where: { id: refId } });
    if (charge && (charge.compte === "COMMUN" || charge.compte === "PERSO")) {
      const existing = await prisma.paiement.findUnique({
        where: { moisId_type_refId: { moisId: ligneMois.id, type, refId } },
      });
      const ajustementSolde = await calculerAjustementPaiementCharge(
        charge,
        annee,
        mois,
        existing ? { payee: existing.payee, montant: existing.montant } : null,
        { payee, montant: null }
      );
      if (ajustementSolde !== 0) {
        const parametres = await getParametres();
        ajustementOps = await operationsAjustementSolde(charge, parametres.id, ajustementSolde, annee, mois);
      }
    }
  }

  const operations: Prisma.PrismaPromise<unknown>[] = [
    prisma.paiement.upsert({
      where: { moisId_type_refId: { moisId: ligneMois.id, type, refId } },
      create: { moisId: ligneMois.id, type, refId, payee },
      update: { payee },
    }),
    ...ajustementOps,
  ];
  await prisma.$transaction(operations);

  revalidatePath(`/mois/${annee}-${String(mois).padStart(2, "0")}`);
  if (ajustementOps.length > 0) revalidatePath(charge?.compte === "COMMUN" ? "/parametres" : "/personnes");
  revalidatePath("/");
}

/**
 * Enregistre le montant réellement payé pour une charge mensuelle à montant
 * variable (ex : carburant), pour un mois donné. Un champ vidé retire le
 * suivi (retour au comportement par défaut : payé au montant de référence).
 * Un montant à 0 saisi explicitement enregistre bien 0 (rien payé ce mois-ci).
 */
export async function setMontantPayeCharge(
  annee: number,
  mois: number,
  chargeId: number,
  formData: FormData
) {
  const raw = String(formData.get("montant") ?? "").trim();
  const ligneMois = await getOrCreateMois(annee, mois);

  let montant: number | null = null;
  if (raw !== "") {
    montant = Number(raw);
    if (!Number.isFinite(montant) || montant < 0) throw new Error("Montant invalide.");
  }

  let ajustementOps: Prisma.PrismaPromise<unknown>[] = [];
  const charge = await prisma.chargeMensuelle.findUnique({ where: { id: chargeId } });
  if (charge && (charge.compte === "COMMUN" || charge.compte === "PERSO")) {
    const existing = await prisma.paiement.findUnique({
      where: { moisId_type_refId: { moisId: ligneMois.id, type: "CHARGE_MENSUELLE", refId: chargeId } },
    });
    const ajustementSolde = await calculerAjustementPaiementCharge(
      charge,
      annee,
      mois,
      existing ? { payee: existing.payee, montant: existing.montant } : null,
      raw === "" ? null : { payee: true, montant }
    );
    if (ajustementSolde !== 0) {
      const parametres = await getParametres();
      ajustementOps = await operationsAjustementSolde(charge, parametres.id, ajustementSolde, annee, mois);
    }
  }

  const operations: Prisma.PrismaPromise<unknown>[] =
    raw === ""
      ? [
          prisma.paiement.deleteMany({
            where: { moisId: ligneMois.id, type: "CHARGE_MENSUELLE", refId: chargeId },
          }),
        ]
      : [
          prisma.paiement.upsert({
            where: {
              moisId_type_refId: { moisId: ligneMois.id, type: "CHARGE_MENSUELLE", refId: chargeId },
            },
            create: { moisId: ligneMois.id, type: "CHARGE_MENSUELLE", refId: chargeId, payee: true, montant },
            update: { payee: true, montant },
          }),
        ];
  operations.push(...ajustementOps);
  await prisma.$transaction(operations);

  revalidatePath("/");
  revalidatePath(`/mois/${annee}-${String(mois).padStart(2, "0")}`);
  if (ajustementOps.length > 0) revalidatePath(charge?.compte === "COMMUN" ? "/parametres" : "/personnes");
}

/**
 * Enregistre le montant réellement transféré par une personne vers le compte
 * commun pour un mois donné. Un seul montant par mois et par personne
 * (ressaisir remplace la valeur précédente). Solde entièrement calculé :
 * l'absence de saisie explicite pour ce mois vaut 0€ transféré (pas le
 * virement habituel — voir `setVirementEpargneMois`, même principe), et
 * c'est l'écart avec le montant précédemment saisi (0 par défaut) qui est
 * aussitôt répercuté sur `parametres.soldeCommun` (+) et `personne.soldePerso`
 * (−), pour un mois courant ou passé uniquement (voir `estMoisPasseOuCourant`).
 * `personne.virementMensuelHabituel` ne sert que de suggestion pré-remplie et
 * d'hypothèse pour les projections des mois sans aucune donnée.
 */
export async function setVirementMois(
  annee: number,
  mois: number,
  personneId: number,
  formData: FormData
) {
  const montant = Number(formData.get("montant") ?? 0);
  if (!Number.isFinite(montant) || montant < 0) throw new Error("Montant invalide.");

  const ligneMois = await getOrCreateMois(annee, mois);
  const existant = await prisma.virementMois.findUnique({
    where: { moisId_personneId: { moisId: ligneMois.id, personneId } },
  });
  const effectifAncien = existant?.montant ?? 0;
  const applicable = estMoisPasseOuCourant(annee, mois);
  const delta = applicable ? montant - effectifAncien : 0;

  const operations: Prisma.PrismaPromise<unknown>[] = [
    prisma.virementMois.upsert({
      where: { moisId_personneId: { moisId: ligneMois.id, personneId } },
      create: { moisId: ligneMois.id, personneId, montant, soldeApplique: applicable },
      update: { montant, soldeApplique: applicable },
    }),
  ];
  if (delta !== 0) {
    const parametres = await getParametres();
    operations.push(
      prisma.parametres.update({
        where: { id: parametres.id },
        data: { soldeCommun: { increment: delta } },
      }),
      prisma.personne.update({
        where: { id: personneId },
        data: { soldePerso: { decrement: delta } },
      }),
      operationPropagationArchiveCommun(annee, mois, delta),
      ...(await operationsPropagationArchivePerso(annee, mois, personneId, -delta, 0))
    );
  }
  await prisma.$transaction(operations);

  revalidatePath(`/mois/${annee}-${String(mois).padStart(2, "0")}`);
  revalidatePath("/");
  if (delta !== 0) {
    revalidatePath("/parametres");
    revalidatePath("/personnes");
  }
}

/**
 * Enregistre le montant réellement viré par une personne entre son compte
 * perso et son compte épargne pour un mois donné — positif vers l'épargne
 * (dépôt), négatif vers le perso (retrait). Contrairement à `setVirementMois`
 * (virement commun, un événement fiable fait le 1er de chaque mois), le
 * virement épargne est une décision ponctuelle prise en fin de mois selon ce
 * qu'il reste — il n'y a donc pas de « montant habituel déjà supposé viré »
 * à corriger : l'absence de saisie explicite pour ce mois vaut 0€ viré, et
 * c'est l'écart avec 0 (donc le montant saisi lui-même) qui est aussitôt
 * répercuté sur `soldePerso`/`soldeEpargne`, pour un mois courant ou passé
 * uniquement (voir `estMoisPasseOuCourant`). `personne.virementEpargneMensuelHabituel`
 * ne sert que de suggestion pré-remplie dans le formulaire et d'hypothèse
 * pour les projections des mois sans aucune donnée — jamais de calcul d'écart.
 */
export async function setVirementEpargneMois(
  annee: number,
  mois: number,
  personneId: number,
  formData: FormData
) {
  const montant = Number(formData.get("montant") ?? 0);
  if (!Number.isFinite(montant)) throw new Error("Montant invalide.");

  const ligneMois = await getOrCreateMois(annee, mois);
  const existant = await prisma.virementEpargneMois.findUnique({
    where: { moisId_personneId: { moisId: ligneMois.id, personneId } },
  });
  const effectifAncien = existant?.montant ?? 0;
  const applicable = estMoisPasseOuCourant(annee, mois);
  const delta = applicable ? montant - effectifAncien : 0;

  const operations: Prisma.PrismaPromise<unknown>[] = [
    prisma.virementEpargneMois.upsert({
      where: { moisId_personneId: { moisId: ligneMois.id, personneId } },
      create: { moisId: ligneMois.id, personneId, montant, soldeApplique: applicable },
      update: { montant, soldeApplique: applicable },
    }),
  ];
  if (delta !== 0) {
    operations.push(
      prisma.personne.update({
        where: { id: personneId },
        data: { soldePerso: { decrement: delta }, soldeEpargne: { increment: delta } },
      }),
      ...(await operationsPropagationArchivePerso(annee, mois, personneId, -delta, delta))
    );
  }
  await prisma.$transaction(operations);

  revalidatePath(`/mois/${annee}-${String(mois).padStart(2, "0")}`);
  revalidatePath("/");
  if (delta !== 0) revalidatePath("/personnes");
}

/**
 * Construit, pour chaque mois suivi en base (typiquement le mois en cours et
 * les mois passés), le résumé utilisé par `projectionCompteCommun` pour ne
 * pas recompter les montants déjà payés/transférés.
 */
export async function getSuiviParMoisMap(data: {
  chargesMensuelles: ChargeMensuelle[];
  personnes: Pick<Personne, "id" | "virementMensuelHabituel">[];
  historiqueParCharge?: Map<number, HistoriqueMontantCharge[]>;
}): Promise<Map<string, SuiviMoisResume>> {
  const lignes = await prisma.mois.findMany({
    include: { paiements: true, virements: true, depensesQuotidiennes: true },
  });
  const result = new Map<string, SuiviMoisResume>();
  const historiqueParCharge = data.historiqueParCharge ?? new Map();
  const now = new Date();
  const chargeBudgetCommun = data.chargesMensuelles.find(
    (c) => c.budgetDepensesQuotidiennes && c.compte === "COMMUN"
  );

  for (const ligne of lignes) {
    // Une ligne Mois peut exister sans aucun suivi réel (juste créée en
    // amont) : dans ce cas elle ne doit pas basculer le mois en mode "suivi".
    const aDuSuiviReel =
      ligne.paiements.length > 0 || ligne.virements.length > 0 || ligne.depensesQuotidiennes.length > 0;
    if (!aDuSuiviReel) continue;

    const mois0 = ligne.mois - 1; // stocké 1-12, calculs en 0-11

    const paiements = new Map<string, boolean>();
    const montants = new Map<string, number>();
    for (const p of ligne.paiements) {
      paiements.set(clePaiement(p.type, p.refId), p.payee);
      if (p.montant !== null) montants.set(clePaiement(p.type, p.refId), p.montant);
    }

    // Un virement suffisant a toujours lieu : les charges mensuelles (fixes,
    // prélevées automatiquement) sont considérées payées par défaut au
    // montant de référence, sauf décochage explicite (payé = false) ou
    // montant réel saisi différent (charges à montant variable).
    const chargesMensuellesResolues = withMontantResolu(
      data.chargesMensuelles,
      historiqueParCharge,
      ligne.annee,
      mois0
    );
    const chargesMensuellesCommunesActives = chargesMensuellesResolues.filter(
      (c) => c.compte === "COMMUN" && estChargeMensuelleActive(c, ligne.annee, mois0)
    );
    // Comme les charges mensuelles ci-dessus (un virement suffisant a
    // toujours lieu par défaut) : un virement non explicitement saisi ce
    // mois-ci (« Déjà transféré ») est supposé reçu au montant habituel de la
    // personne — cohérent avec ce qu'affiche déjà la page (voir « Reste à
    // transférer », qui applique le même repli), pour éviter d'avoir à
    // cliquer sur OK juste pour confirmer une valeur déjà affichée par défaut.
    const virementsRecusTotal = data.personnes.reduce((sum, p) => {
      const virement = ligne.virements.find((v) => v.personneId === p.id);
      return sum + (virement ? virement.montant : p.virementMensuelHabituel);
    }, 0);
    const depensesQuotidiennesTotal = ligne.depensesQuotidiennes
      .filter((d) => d.personneId === null)
      .reduce((sum, d) => sum + d.montant, 0);

    // depensesDejaDeduitesDuSolde = true : les dépenses du quotidien du
    // compte commun décrémentent déjà `parametres.soldeCommun` en direct à
    // la saisie (voir `ajouterDepenseQuotidienne`) — ne réserver que le
    // reliquat du budget de référence, pas le total.
    const chargesMensuellesPayeesTotal = chargesMensuellesCommunesActives.reduce(
      (sum, c) =>
        sum +
        montantPayeEffectifCharge(
          c,
          paiements,
          montants,
          depensesQuotidiennesTotal,
          true,
          chargeDejaDebiteeParDefaut(c, ligne.annee, mois0, now)
        ),
      0
    );

    const cle = `${ligne.annee}-${String(ligne.mois).padStart(2, "0")}`;
    result.set(cle, {
      chargesMensuellesPayeesTotal,
      virementsRecusTotal,
      depensesQuotidiennesTotal,
      depensesQuotidiennesAbsorbees: chargeBudgetCommun !== undefined,
    });
  }

  return result;
}

/**
 * Données brutes de suivi (paiements, virements vers le commun et vers
 * l'épargne) pour chaque mois ayant du suivi réel, utilisées pour projeter
 * les comptes perso/épargne de chaque personne (voir `projectionPersonnes`).
 */
export async function getSuiviBrutParMoisMap(): Promise<Map<string, MoisSuiviBrut>> {
  const lignes = await prisma.mois.findMany({
    include: { paiements: true, virements: true, virementsEpargne: true, depensesQuotidiennes: true },
  });
  const result = new Map<string, MoisSuiviBrut>();

  for (const ligne of lignes) {
    const aDuSuiviReel =
      ligne.paiements.length > 0 ||
      ligne.virements.length > 0 ||
      ligne.virementsEpargne.length > 0 ||
      ligne.depensesQuotidiennes.length > 0;
    if (!aDuSuiviReel) continue;

    const paiements = new Map<string, boolean>();
    const montants = new Map<string, number>();
    for (const p of ligne.paiements) {
      paiements.set(clePaiement(p.type, p.refId), p.payee);
      if (p.montant !== null) montants.set(clePaiement(p.type, p.refId), p.montant);
    }
    const virements = new Map<number, number>();
    for (const v of ligne.virements) virements.set(v.personneId, v.montant);
    const virementsEpargne = new Map<number, number>();
    for (const v of ligne.virementsEpargne) virementsEpargne.set(v.personneId, v.montant);
    const depensesQuotidiennes = new Map<number, number>();
    for (const d of ligne.depensesQuotidiennes) {
      if (d.personneId === null) continue;
      depensesQuotidiennes.set(d.personneId, (depensesQuotidiennes.get(d.personneId) ?? 0) + d.montant);
    }

    const cle = `${ligne.annee}-${String(ligne.mois).padStart(2, "0")}`;
    result.set(cle, { paiements, montants, virements, virementsEpargne, depensesQuotidiennes });
  }

  return result;
}

/**
 * Archive le solde de fin du mois précédent (commun + chaque personne), si ce
 * n'est pas déjà fait. À appeler à chaque affichage du tableau de bord — sans
 * effet si le mois précédent est déjà archivé. Best-effort : comme l'app ne
 * garde pas d'historique de solde jour par jour, le solde RÉEL ACTUEL est
 * utilisé comme approximation du solde de fin de ce mois précédent — fiable
 * seulement si l'app est rouverte au moins une fois par mois (dans le cas
 * contraire, un ou plusieurs mois restent définitivement non archivés :
 * inutile de leur appliquer rétroactivement le solde actuel, qui serait
 * clairement faux pour ces mois-là).
 */
export async function archiverMoisEcoule(): Promise<void> {
  const now = new Date();
  const moisPrecedent =
    now.getMonth() === 0 ? { annee: now.getFullYear() - 1, mois: 12 } : { annee: now.getFullYear(), mois: now.getMonth() };

  const existant = await prisma.mois.findUnique({ where: { annee_mois: moisPrecedent } });
  if (existant?.soldeCommunFinDeMois != null) return;

  const [parametres, personnes] = await Promise.all([getParametres(), prisma.personne.findMany()]);
  const ligneMois = existant ?? (await prisma.mois.create({ data: moisPrecedent }));

  await prisma.$transaction([
    prisma.mois.update({
      where: { id: ligneMois.id },
      data: { soldeCommunFinDeMois: parametres.soldeCommun },
    }),
    ...personnes.map((p) =>
      prisma.soldePersonneMois.upsert({
        where: { moisId_personneId: { moisId: ligneMois.id, personneId: p.id } },
        create: { moisId: ligneMois.id, personneId: p.id, soldePerso: p.soldePerso, soldeEpargne: p.soldeEpargne },
        update: { soldePerso: p.soldePerso, soldeEpargne: p.soldeEpargne },
      })
    ),
  ]);
}

/**
 * Rattrape, pour le mois en cours, les virements (vers le commun ou
 * l'épargne) dont l'écart avec le montant habituel n'a jamais été répercuté
 * sur les soldes (`soldeApplique = false`) — typiquement une valeur saisie à
 * l'avance pendant que ce mois était encore futur (voir `estMoisPasseOuCourant`),
 * jamais retouchée depuis. Sans ce rattrapage, cet écart resterait affiché
 * dans « Déjà transféré » sans jamais avoir été crédité/débité nulle part :
 * appelé à chaque chargement du tableau de bord, comme `archiverMoisEcoule`,
 * pour rattraper ça dès que le mois devient le mois en cours — idempotent
 * (chaque ligne n'est rattrapée qu'une fois, `soldeApplique` repasse à vrai
 * aussitôt).
 */
export async function rattraperVirementsMoisCourant(): Promise<void> {
  const now = new Date();
  const annee = now.getFullYear();
  const mois = now.getMonth() + 1;

  const ligneMois = await prisma.mois.findUnique({ where: { annee_mois: { annee, mois } } });
  if (!ligneMois) return;

  const [virements, virementsEpargne] = await Promise.all([
    prisma.virementMois.findMany({ where: { moisId: ligneMois.id, soldeApplique: false } }),
    prisma.virementEpargneMois.findMany({ where: { moisId: ligneMois.id, soldeApplique: false } }),
  ]);
  if (virements.length === 0 && virementsEpargne.length === 0) return;

  const personnes = await prisma.personne.findMany();
  const personneParId = new Map(personnes.map((p) => [p.id, p]));
  const parametres = virements.length > 0 ? await getParametres() : null;

  const operations: Prisma.PrismaPromise<unknown>[] = [];

  for (const v of virements) {
    operations.push(prisma.virementMois.update({ where: { id: v.id }, data: { soldeApplique: true } }));
    if (!personneParId.has(v.personneId)) continue;
    // Pas de « montant habituel » à corriger ici (voir `setVirementMois`) :
    // l'écart se mesure depuis 0, donc c'est le montant saisi lui-même.
    const delta = v.montant;
    if (delta === 0) continue;
    operations.push(
      prisma.parametres.update({
        where: { id: parametres!.id },
        data: { soldeCommun: { increment: delta } },
      }),
      prisma.personne.update({
        where: { id: v.personneId },
        data: { soldePerso: { decrement: delta } },
      }),
      operationPropagationArchiveCommun(annee, mois, delta),
      ...(await operationsPropagationArchivePerso(annee, mois, v.personneId, -delta, 0))
    );
  }

  for (const v of virementsEpargne) {
    operations.push(prisma.virementEpargneMois.update({ where: { id: v.id }, data: { soldeApplique: true } }));
    if (!personneParId.has(v.personneId)) continue;
    // Pas de « montant habituel » à corriger ici (voir `setVirementEpargneMois`) :
    // l'écart se mesure depuis 0, donc c'est le montant saisi lui-même.
    const delta = v.montant;
    if (delta === 0) continue;
    operations.push(
      prisma.personne.update({
        where: { id: v.personneId },
        data: { soldePerso: { decrement: delta }, soldeEpargne: { increment: delta } },
      }),
      ...(await operationsPropagationArchivePerso(annee, mois, v.personneId, -delta, delta))
    );
  }

  await prisma.$transaction(operations);
}

/**
 * Crédite automatiquement `personne.soldePerso` des revenus du mois en cours
 * dès qu'ils sont réellement versés — jamais fait rétroactivement pour un
 * mois déjà passé (cette fonction ne regarde toujours que le mois en cours,
 * comme `rattraperVirementsMoisCourant`). Un revenu PONCTUEL utilise
 * directement sa date exacte ; un revenu MENSUEL ou ANNUEL n'est crédité que
 * s'il a un `jourVersement` renseigné (comportement inchangé sinon — pas de
 * crédit automatique, comme avant l'existence de ce mécanisme) — un mois plus
 * court que ce jour (ex. 31 en février) est traité comme versé dès le
 * dernier jour du mois. Chaque revenu n'est crédité qu'une seule fois par
 * mois (suivi via une ligne `Paiement` de type REVENU, réutilisée comme
 * simple indicateur « déjà crédité », jamais affichée/cochable) — idempotent,
 * peu importe combien de fois cette fonction est appelée.
 */
export async function rattraperRevenusMoisCourant(): Promise<void> {
  const now = new Date();
  const annee = now.getFullYear();
  const mois0 = now.getMonth(); // 0-11
  const mois = mois0 + 1; // 1-12, format stocké
  const jourDuMois = now.getDate();
  const dernierJourDuMois = new Date(annee, mois, 0).getDate();

  const ligneMois = await getOrCreateMois(annee, mois);

  const [revenus, overridesAnnuel, overridesMensuel, dejaCredites] = await Promise.all([
    prisma.revenu.findMany(),
    prisma.revenuAnnuelMontant.findMany({ where: { annee } }),
    prisma.revenuMensuelMontant.findMany({ where: { annee, mois } }),
    prisma.paiement.findMany({ where: { moisId: ligneMois.id, type: "REVENU" } }),
  ]);
  const dejaCreditesIds = new Set(dejaCredites.map((p) => p.refId));
  const overrideAnnuelParRevenu = new Map(overridesAnnuel.map((m) => [m.revenuId, m.montant]));
  const overrideMensuelParRevenu = new Map(overridesMensuel.map((m) => [m.revenuId, m.montant]));

  const operations: Prisma.PrismaPromise<unknown>[] = [];

  for (const revenu of revenus) {
    if (dejaCreditesIds.has(revenu.id)) continue;
    if (!revenuActifPourMois(revenu, annee, mois0)) continue;

    let recu: boolean;
    let montantResolu: number;
    if (revenu.type === "PONCTUEL") {
      recu = revenu.date !== null && revenu.date.getTime() <= now.getTime();
      montantResolu = revenu.montant;
    } else {
      if (!revenu.jourVersement) continue;
      recu = jourDuMois >= Math.min(revenu.jourVersement, dernierJourDuMois);
      montantResolu =
        revenu.type === "ANNUEL"
          ? (overrideAnnuelParRevenu.get(revenu.id) ?? revenu.montant)
          : (overrideMensuelParRevenu.get(revenu.id) ?? revenu.montant);
    }
    if (!recu) continue;

    operations.push(
      prisma.paiement.create({
        data: { moisId: ligneMois.id, type: "REVENU", refId: revenu.id, payee: true },
      }),
      prisma.personne.update({
        where: { id: revenu.personneId },
        data: { soldePerso: { increment: montantResolu } },
      })
    );
  }

  if (operations.length > 0) await prisma.$transaction(operations);
}

/**
 * Débite automatiquement `parametres.soldeCommun`/`personne.soldePerso` des
 * charges mensuelles du mois en cours dès que leur jour de prélèvement est
 * atteint — même principe que `rattraperRevenusMoisCourant`, symétrique côté
 * dépenses. Ne concerne que les charges avec `jourDebit` renseigné (opt-in,
 * comportement inchangé sinon : payée par défaut au montant de référence,
 * sans aucun mouvement de solde automatique — voir `chargeDejaDebiteeParDefaut`).
 * Exclut la charge budget « dépenses du quotidien » (`budgetDepensesQuotidiennes`) :
 * son suivi est déjà entièrement géré en direct par `ajouterDepenseQuotidienne`,
 * sans notion de jour de prélèvement unique. Chaque charge n'est débitée
 * qu'une seule fois par mois (suivi via la ligne `Paiement` existante,
 * cochée automatiquement du même coup — voir aussi la case à cocher sur la
 * page du mois, qui reflète déjà ce même jour par défaut).
 */
export async function rattraperChargesMoisCourant(): Promise<void> {
  const now = new Date();
  const annee = now.getFullYear();
  const mois0 = now.getMonth(); // 0-11
  const mois = mois0 + 1; // 1-12, format stocké

  const ligneMois = await getOrCreateMois(annee, mois);

  const [charges, historiqueParCharge, dejaPaiements] = await Promise.all([
    prisma.chargeMensuelle.findMany({
      where: { jourDebit: { not: null }, budgetDepensesQuotidiennes: false },
    }),
    getHistoriqueMontantsParCharge(),
    prisma.paiement.findMany({ where: { moisId: ligneMois.id, type: "CHARGE_MENSUELLE" } }),
  ]);
  const dejaPaiementsIds = new Set(dejaPaiements.map((p) => p.refId));
  const chargesResolues = withMontantResolu(charges, historiqueParCharge, annee, mois0);
  const montantResoluParId = new Map(chargesResolues.map((c) => [c.id, c.montant]));

  const operations: Prisma.PrismaPromise<unknown>[] = [];
  let parametres: { id: number } | null = null;

  for (const charge of charges) {
    if (dejaPaiementsIds.has(charge.id)) continue;
    if (!estChargeMensuelleActive(charge, annee, mois0)) continue;
    if (!chargeDejaDebiteeParDefaut(charge, annee, mois0, now)) continue;

    const montant = montantResoluParId.get(charge.id) ?? charge.montant;
    operations.push(
      prisma.paiement.create({
        data: { moisId: ligneMois.id, type: "CHARGE_MENSUELLE", refId: charge.id, payee: true },
      })
    );
    if (charge.compte === "COMMUN") {
      if (!parametres) parametres = await getParametres();
      operations.push(
        prisma.parametres.update({
          where: { id: parametres.id },
          data: { soldeCommun: { decrement: montant } },
        }),
        operationPropagationArchiveCommun(annee, mois, -montant)
      );
    } else if (charge.compte === "PERSO" && charge.personneId) {
      operations.push(
        prisma.personne.update({
          where: { id: charge.personneId },
          data: { soldePerso: { decrement: montant } },
        }),
        ...(await operationsPropagationArchivePerso(annee, mois, charge.personneId, -montant, 0))
      );
    }
  }

  if (operations.length > 0) await prisma.$transaction(operations);
}

export type SoldeArchiveMois = {
  soldeCommun: number | null;
  personnes: Map<number, { soldePerso: number; soldeEpargne: number }>;
};

/** Soldes de fin de mois archivés (voir `archiverMoisEcoule`), indexés par clé "YYYY-MM", pour tous les mois qui en ont un. */
export async function getSoldesArchives(): Promise<Map<string, SoldeArchiveMois>> {
  const lignes = await prisma.mois.findMany({
    where: { soldeCommunFinDeMois: { not: null } },
    include: { soldesPersonnes: true },
  });
  const result = new Map<string, SoldeArchiveMois>();
  for (const ligne of lignes) {
    const cle = `${ligne.annee}-${String(ligne.mois).padStart(2, "0")}`;
    const personnes = new Map<number, { soldePerso: number; soldeEpargne: number }>();
    for (const s of ligne.soldesPersonnes) {
      personnes.set(s.personneId, { soldePerso: s.soldePerso, soldeEpargne: s.soldeEpargne });
    }
    result.set(cle, { soldeCommun: ligne.soldeCommunFinDeMois, personnes });
  }
  return result;
}

/** Toutes les dépenses du quotidien couvrant les périodes données (mois 1-12), pour les statistiques. */
export async function getDepensesQuotidiennesPourPeriodes(
  periodes: { annee: number; mois: number }[]
): Promise<DepenseQuotidiennePeriode[]> {
  if (periodes.length === 0) return [];
  const lignes = await prisma.depenseQuotidienne.findMany({
    where: { mois: { OR: periodes.map((p) => ({ annee: p.annee, mois: p.mois })) } },
    include: { mois: true },
  });
  return lignes.map((d) => ({
    montant: d.montant,
    personneId: d.personneId,
    categorieId: d.categorieId,
    annee: d.mois.annee,
    mois: d.mois.mois,
  }));
}
