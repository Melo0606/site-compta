import type { ChargeMensuelle, ChargeAnnuelle, AchatPrevu, Categorie, Personne, Revenu } from "@/app/generated/prisma/client";
import {
  chargeAnnuelleTerminee,
  estChargeMensuelleActive,
  montantEffectifRevenuAnnuel,
  montantEffectifRevenuMensuel,
  revenuActifPourMois,
  withMontantResolu,
  type HistoriqueMontantCharge,
} from "./calculs";

export type StatsPeriode = { annee: number; mois: number }; // mois 1-12

export type DepenseQuotidiennePeriode = {
  montant: number;
  personneId: number | null;
  categorieId: number | null;
  annee: number;
  mois: number; // 1-12
};

export type StatsCategoriePeriode = {
  categorieId: number | null;
  categorieNom: string;
  /** Un montant par entrée de `periodes`, dans le même ordre. */
  parPeriode: number[];
  total: number;
};

const MAX_CATEGORIES = 7;

/**
 * Agrège, pour une liste de périodes (mois précis, année complète, fenêtre
 * glissante...) et un périmètre donné (compte commun ou une personne — au
 * appelant de filtrer les listes en amont), les dépenses par catégorie et par
 * période, toutes sources confondues :
 * - Charges mensuelles : comptées sur chaque période où elles sont actives.
 * - Charges annuelles : montant plein sur la période dont le mois correspond à leur échéance.
 * - Achats prévus : montant cible sur la période exacte de leur date visée (jamais de prorata).
 * - Dépenses du quotidien : montant sur la période à laquelle elles sont rattachées.
 *
 * Au-delà de `MAX_CATEGORIES` catégories non nulles, les plus petites sont
 * repliées dans une ligne « Autres » (trié par total décroissant).
 */
export function statsParCategorie(data: {
  periodes: StatsPeriode[];
  categories: Categorie[];
  chargesMensuelles: ChargeMensuelle[];
  chargesAnnuelles: ChargeAnnuelle[];
  achatsPrevus: AchatPrevu[];
  depensesQuotidiennes: DepenseQuotidiennePeriode[];
  historiqueParCharge?: Map<number, HistoriqueMontantCharge[]>;
}): StatsCategoriePeriode[] {
  const { periodes } = data;
  const nbPeriodes = periodes.length;
  const historiqueParCharge = data.historiqueParCharge ?? new Map();
  const parCategorie = new Map<number | null, number[]>();

  function ajouter(categorieId: number | null, index: number, montant: number) {
    if (index < 0) return;
    if (!parCategorie.has(categorieId)) parCategorie.set(categorieId, new Array(nbPeriodes).fill(0));
    parCategorie.get(categorieId)![index] += montant;
  }

  periodes.forEach((periode, index) => {
    const chargesMensuellesResolues = withMontantResolu(
      data.chargesMensuelles,
      historiqueParCharge,
      periode.annee,
      periode.mois - 1
    );
    for (const charge of chargesMensuellesResolues) {
      if (estChargeMensuelleActive(charge, periode.annee, periode.mois - 1)) {
        ajouter(charge.categorieId, index, charge.montant);
      }
    }
    for (const charge of data.chargesAnnuelles) {
      if (charge.moisEcheance === periode.mois && !chargeAnnuelleTerminee(charge, periode.annee, periode.mois - 1)) {
        ajouter(charge.categorieId, index, charge.montant);
      }
    }
    for (const achat of data.achatsPrevus) {
      if (achat.dateVisee.getFullYear() === periode.annee && achat.dateVisee.getMonth() + 1 === periode.mois) {
        ajouter(achat.categorieId, index, achat.montantCible);
      }
    }
  });

  const indexParCle = new Map(periodes.map((p, i) => [`${p.annee}-${p.mois}`, i]));
  for (const depense of data.depensesQuotidiennes) {
    const index = indexParCle.get(`${depense.annee}-${depense.mois}`);
    if (index !== undefined) ajouter(depense.categorieId, index, depense.montant);
  }

  const nomsParId = new Map(data.categories.map((c) => [c.id, c.nom]));
  const lignes: StatsCategoriePeriode[] = [];
  for (const [categorieId, parPeriode] of parCategorie) {
    const total = parPeriode.reduce((a, b) => a + b, 0);
    if (total === 0) continue;
    lignes.push({
      categorieId,
      categorieNom: categorieId === null ? "Sans catégorie" : (nomsParId.get(categorieId) ?? "?"),
      parPeriode,
      total,
    });
  }

  lignes.sort((a, b) => {
    if (a.categorieId === null) return 1;
    if (b.categorieId === null) return -1;
    return a.categorieNom.localeCompare(b.categorieNom, "fr");
  });

  return foldAutres(lignes, nbPeriodes);
}

/** Au-delà de MAX_CATEGORIES catégories, fusionne les plus petites dans une ligne « Autres ». */
function foldAutres(lignes: StatsCategoriePeriode[], nbPeriodes: number): StatsCategoriePeriode[] {
  if (lignes.length <= MAX_CATEGORIES) return lignes;

  const triParTotal = [...lignes].sort((a, b) => b.total - a.total);
  const tete = triParTotal.slice(0, MAX_CATEGORIES);
  const queue = triParTotal.slice(MAX_CATEGORIES);

  const parPeriode = new Array(nbPeriodes).fill(0);
  let total = 0;
  for (const ligne of queue) {
    ligne.parPeriode.forEach((montant, i) => (parPeriode[i] += montant));
    total += ligne.total;
  }

  return [...tete, { categorieId: null, categorieNom: "Autres", parPeriode, total }];
}


export type PosteFlux = { nom: string; montant: number };

/** Moyenne mensuelle de ce qui entre et sort pour une personne (diagramme « Où va mon argent »). */
export type FluxPersonne = {
  /** Revenus par source (libellé du revenu), moyenne mensuelle. */
  revenus: PosteFlux[];
  epargne: number;
  commun: number;
  /** Charges perso (mensuelles, annuelles, achats prévus) par catégorie. */
  charges: PosteFlux[];
  /** Dépenses du quotidien par catégorie (net des remboursements). */
  quotidien: PosteFlux[];
  /** Nombre de mois sur lesquels les dépenses du quotidien sont moyennées (0 si aucun mois passé ou en cours). */
  nbMoisQuotidien: number;
};

/**
 * Moyenne mensuelle, sur les périodes choisies, des flux d'argent d'une
 * personne :
 * - revenus : montant effectif de chaque revenu sur chaque mois (montants
 *   réels saisis pour les revenus mensuels/annuels, sinon référence) ;
 * - virements vers le compte commun et vers l'épargne : montant saisi pour
 *   le mois, sinon le virement mensuel habituel de la personne ;
 * - charges perso par catégorie : `statsCharges` (voir `statsParCategorie` —
 *   charges annuelles sur leur échéance et achats prévus sur leur date, donc
 *   lissés par la moyenne) ;
 * - dépenses du quotidien par catégorie : `statsQuotidien`, moyennées sur les
 *   seuls mois écoulés de la période (un mois futur n'a encore aucune
 *   dépense, le mois en cours est incomplet) — à défaut, sur le mois en cours.
 * Les postes nuls ou négatifs sont écartés.
 */
export function fluxMensuelMoyenPersonne(data: {
  periodes: StatsPeriode[];
  /** Mois absolu (annee * 12 + mois 0-11) d'aujourd'hui. */
  todayAbs: number;
  personne: Pick<Personne, "id" | "virementMensuelHabituel" | "virementEpargneMensuelHabituel">;
  revenus: Revenu[];
  revenuAnnuelOverrides: Map<string, number>;
  revenuMensuelOverrides: Map<string, number>;
  /** Virements saisis par mois ("YYYY-MM", mois 1-12) pour cette personne. */
  virementsCommun: Map<string, number>;
  virementsEpargne: Map<string, number>;
  statsCharges: StatsCategoriePeriode[];
  statsQuotidien: StatsCategoriePeriode[];
}): FluxPersonne {
  const n = data.periodes.length;
  if (n === 0) return { revenus: [], epargne: 0, commun: 0, charges: [], quotidien: [], nbMoisQuotidien: 0 };

  const revenusParLibelle = new Map<string, number>();
  let commun = 0;
  let epargne = 0;
  for (const p of data.periodes) {
    const cle = `${p.annee}-${String(p.mois).padStart(2, "0")}`;
    for (const r of data.revenus) {
      if (r.personneId !== data.personne.id || !revenuActifPourMois(r, p.annee, p.mois - 1)) continue;
      const montant =
        r.type === "ANNUEL"
          ? montantEffectifRevenuAnnuel(data.revenuAnnuelOverrides, r.id, p.annee, r.montant)
          : r.type === "MENSUEL"
            ? montantEffectifRevenuMensuel(data.revenuMensuelOverrides, r.id, p.annee, p.mois, r.montant)
            : r.montant;
      revenusParLibelle.set(r.libelle, (revenusParLibelle.get(r.libelle) ?? 0) + montant);
    }
    commun += data.virementsCommun.get(cle) ?? data.personne.virementMensuelHabituel;
    epargne += data.virementsEpargne.get(cle) ?? data.personne.virementEpargneMensuelHabituel;
  }

  const abs = data.periodes.map((p) => p.annee * 12 + (p.mois - 1));
  let indexQuotidien = abs.flatMap((a, i) => (a < data.todayAbs ? [i] : []));
  if (indexQuotidien.length === 0) indexQuotidien = abs.flatMap((a, i) => (a === data.todayAbs ? [i] : []));

  const postes = (lignes: StatsCategoriePeriode[], indices: number[] | null): PosteFlux[] =>
    lignes
      .map((l) => {
        const somme = indices ? indices.reduce((s, i) => s + l.parPeriode[i], 0) : l.total;
        const diviseur = indices ? indices.length : n;
        return { nom: l.categorieNom, montant: diviseur > 0 ? somme / diviseur : 0 };
      })
      .filter((p) => p.montant > 0.005)
      .sort((a, b) => b.montant - a.montant);

  return {
    revenus: Array.from(revenusParLibelle, ([nom, total]) => ({ nom, montant: total / n }))
      .filter((r) => r.montant > 0.005)
      .sort((a, b) => b.montant - a.montant),
    epargne: Math.max(0, epargne / n),
    commun: Math.max(0, commun / n),
    charges: postes(data.statsCharges, null),
    quotidien: postes(data.statsQuotidien, indexQuotidien),
    nbMoisQuotidien: indexQuotidien.length,
  };
}
