import type { ChargeMensuelle, ChargeAnnuelle, AchatPrevu, Categorie } from "@/app/generated/prisma/client";
import { chargeAnnuelleTerminee, estChargeMensuelleActive, withMontantResolu, type HistoriqueMontantCharge } from "./calculs";

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

export type PointSoldes = {
  /** Libellé court de la période (même texte que les colonnes du tableau par catégorie). */
  label: string;
  /** Solde de fin de mois, `null` si inconnu (mois passé jamais archivé). */
  soldePerso: number | null;
  soldeEpargne: number | null;
  /** Vrai pour le mois en cours et les mois futurs : solde de fin de mois projeté, pas encore constaté. */
  projete: boolean;
};

/**
 * Évolution des soldes perso et épargne d'une personne, un point par période
 * (fin de mois) :
 * - mois passés : solde archivé à la clôture du mois (`SoldePersonneMois`,
 *   voir `archiverMoisEcoule`), sinon `null` (trou dans la courbe) ;
 * - mois en cours et mois futurs : solde de fin de mois projeté
 *   (`projectionPersonnes`, calculée depuis aujourd'hui).
 */
export function evolutionSoldesPersonne(data: {
  periodes: StatsPeriode[];
  labels: string[];
  /** Mois absolu (annee * 12 + mois 0-11) d'aujourd'hui. */
  todayAbs: number;
  /** Soldes archivés de cette personne, par clé "YYYY-MM" (mois 1-12). */
  archives: Map<string, { soldePerso: number; soldeEpargne: number }>;
  /** Projection de cette personne depuis le mois en cours (`MoisProjectionPersonne.cle` → soldes). */
  projection: { cle: string; soldePerso: number; soldeEpargne: number }[];
}): PointSoldes[] {
  const projectionParCle = new Map(data.projection.map((p) => [p.cle, p]));
  return data.periodes.map((p, i) => {
    const cle = `${p.annee}-${String(p.mois).padStart(2, "0")}`;
    const abs = p.annee * 12 + (p.mois - 1);
    const source = abs < data.todayAbs ? data.archives.get(cle) : projectionParCle.get(cle);
    return {
      label: data.labels[i],
      soldePerso: source?.soldePerso ?? null,
      soldeEpargne: source?.soldeEpargne ?? null,
      projete: abs >= data.todayAbs,
    };
  });
}
