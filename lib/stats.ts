import type { ChargeMensuelle, ChargeAnnuelle, AchatPrevu, Personne, Revenu } from "@/app/generated/prisma/client";
import {
  chargeAnnuelleTerminee,
  estChargeMensuelleActive,
  montantEffectifRevenuAnnuel,
  montantEffectifRevenuMensuel,
  revenuActifPourMois,
  withMontantResolu,
  type HistoriqueMontantCharge,
} from "./calculs";
import { categorieRacineParId, type CategorieArbre } from "./categories";

export type StatsPeriode = { annee: number; mois: number }; // mois 1-12

export type DepenseQuotidiennePeriode = {
  montant: number;
  personneId: number | null;
  libelle: string;
  categorieId: number | null;
  annee: number;
  mois: number; // 1-12
};

/** Dépenses d'un même libellé (« Super U », « Vinci Autoroute »…) dans une catégorie, sur toute la période. */
export type DetailLibelle = {
  /** Sous-catégorie (ou, dans la ligne « Autres », catégorie d'origine) ; `null` = directement dans la catégorie. */
  sousCategorie: string | null;
  libelle: string;
  total: number;
  /** Nombre de dépenses (ou de mois pour une charge mensuelle). */
  nb: number;
};

export type StatsCategoriePeriode = {
  /** Catégorie de premier niveau (les sous-catégories y sont regroupées). */
  categorieId: number | null;
  categorieNom: string;
  /** Un montant par entrée de `periodes`, dans le même ordre. */
  parPeriode: number[];
  total: number;
  /** Détail par sous-catégorie et libellé, trié par total décroissant. */
  detail: DetailLibelle[];
};

const MAX_CATEGORIES = 7;

/**
 * Agrège, pour une liste de périodes (mois précis, année complète, fenêtre
 * glissante...) et un périmètre donné (compte commun ou une personne — au
 * appelant de filtrer les listes en amont), les dépenses par catégorie de
 * premier niveau et par période, toutes sources confondues :
 * - Charges mensuelles : comptées sur chaque période où elles sont actives (sauf l'enveloppe budget
 *   « Dépenses du quotidien », dont le réel est déjà compté via les dépenses du quotidien).
 * - Charges annuelles : montant plein sur la période dont le mois correspond
 *   à leur échéance, ou montant / 12 sur chaque période si `chargesAnnuellesLissees`.
 * - Achats prévus : montant cible sur la période exacte de leur date visée (jamais de prorata).
 * - Dépenses du quotidien : montant sur la période à laquelle elles sont rattachées.
 *
 * Une sous-catégorie est comptée dans sa catégorie principale ; le détail
 * (`detail`) garde la sous-catégorie et le libellé de chaque dépense, en
 * regroupant les libellés identiques (casse et espaces ignorés).
 *
 * Avec `replier` (par défaut), au-delà de `MAX_CATEGORIES` catégories non
 * nulles, les plus petites sont repliées dans une ligne « Autres ».
 */
export function statsParCategorie(data: {
  periodes: StatsPeriode[];
  categories: CategorieArbre[];
  chargesMensuelles: ChargeMensuelle[];
  chargesAnnuelles: ChargeAnnuelle[];
  achatsPrevus: AchatPrevu[];
  depensesQuotidiennes: DepenseQuotidiennePeriode[];
  historiqueParCharge?: Map<number, HistoriqueMontantCharge[]>;
  chargesAnnuellesLissees?: boolean;
  replier?: boolean;
}): StatsCategoriePeriode[] {
  const { periodes } = data;
  const nbPeriodes = periodes.length;
  const historiqueParCharge = data.historiqueParCharge ?? new Map();
  const racineParId = categorieRacineParId(data.categories);
  const nomParId = new Map(data.categories.map((c) => [c.id, c.nom]));

  const parCategorie = new Map<number | null, number[]>();
  const detailParCategorie = new Map<number | null, Map<string, DetailLibelle>>();

  function ajouter(categorieId: number | null, index: number, montant: number, libelle: string) {
    if (index < 0) return;
    const racine = categorieId !== null ? (racineParId.get(categorieId) ?? null) : null;
    const cle = racine?.id ?? null;
    if (!parCategorie.has(cle)) parCategorie.set(cle, new Array(nbPeriodes).fill(0));
    parCategorie.get(cle)![index] += montant;

    const sousCategorie =
      categorieId !== null && racine && racine.id !== categorieId ? (nomParId.get(categorieId) ?? null) : null;
    const libelleNet = libelle.trim() || "Sans libellé";
    const cleDetail = `${sousCategorie ?? ""}|${libelleNet.toLocaleLowerCase("fr")}`;
    if (!detailParCategorie.has(cle)) detailParCategorie.set(cle, new Map());
    const details = detailParCategorie.get(cle)!;
    const existant = details.get(cleDetail);
    if (existant) {
      existant.total += montant;
      existant.nb += 1;
    } else {
      details.set(cleDetail, { sousCategorie, libelle: libelleNet, total: montant, nb: 1 });
    }
  }

  periodes.forEach((periode, index) => {
    const chargesMensuellesResolues = withMontantResolu(
      data.chargesMensuelles,
      historiqueParCharge,
      periode.annee,
      periode.mois - 1,
    );
    for (const charge of chargesMensuellesResolues) {
      // L'enveloppe « Dépenses du quotidien » n'est qu'un budget : le réel, ce sont les dépenses du quotidien
      // saisies, comptées plus bas. La compter ici ferait double emploi.
      if (charge.budgetDepensesQuotidiennes) continue;
      if (estChargeMensuelleActive(charge, periode.annee, periode.mois - 1)) {
        ajouter(charge.categorieId, index, charge.montant, charge.libelle);
      }
    }
    for (const charge of data.chargesAnnuelles) {
      if (chargeAnnuelleTerminee(charge, periode.annee, periode.mois - 1)) continue;
      if (data.chargesAnnuellesLissees) ajouter(charge.categorieId, index, charge.montant / 12, charge.libelle);
      else if (charge.moisEcheance === periode.mois) ajouter(charge.categorieId, index, charge.montant, charge.libelle);
    }
    for (const achat of data.achatsPrevus) {
      if (achat.dateVisee.getFullYear() === periode.annee && achat.dateVisee.getMonth() + 1 === periode.mois) {
        ajouter(achat.categorieId, index, achat.montantCible, achat.libelle);
      }
    }
  });

  const indexParCle = new Map(periodes.map((p, i) => [`${p.annee}-${p.mois}`, i]));
  for (const depense of data.depensesQuotidiennes) {
    const index = indexParCle.get(`${depense.annee}-${depense.mois}`);
    if (index !== undefined) ajouter(depense.categorieId, index, depense.montant, depense.libelle);
  }

  const lignes: StatsCategoriePeriode[] = [];
  for (const [categorieId, parPeriode] of parCategorie) {
    const total = parPeriode.reduce((a, b) => a + b, 0);
    if (Math.abs(total) < 0.005) continue;
    lignes.push({
      categorieId,
      categorieNom: categorieId === null ? "Sans catégorie" : (nomParId.get(categorieId) ?? "?"),
      parPeriode,
      total,
      detail: Array.from(detailParCategorie.get(categorieId)?.values() ?? [])
        .filter((d) => Math.abs(d.total) >= 0.005)
        .sort((a, b) => b.total - a.total),
    });
  }

  lignes.sort((a, b) => {
    if (a.categorieId === null) return 1;
    if (b.categorieId === null) return -1;
    return a.categorieNom.localeCompare(b.categorieNom, "fr");
  });

  return data.replier === false ? lignes : replierAutres(lignes);
}

/** Au-delà de MAX_CATEGORIES catégories, fusionne les plus petites dans une ligne « Autres » (leur détail garde la catégorie d'origine). */
export function replierAutres(lignes: StatsCategoriePeriode[]): StatsCategoriePeriode[] {
  if (lignes.length <= MAX_CATEGORIES) return lignes;

  const triParTotal = [...lignes].sort((a, b) => b.total - a.total);
  const tete = triParTotal.slice(0, MAX_CATEGORIES);
  const queue = triParTotal.slice(MAX_CATEGORIES);

  const parPeriode = new Array(lignes[0].parPeriode.length).fill(0);
  let total = 0;
  const detail: DetailLibelle[] = [];
  for (const ligne of queue) {
    ligne.parPeriode.forEach((montant, i) => (parPeriode[i] += montant));
    total += ligne.total;
    for (const d of ligne.detail) {
      detail.push({
        ...d,
        sousCategorie: d.sousCategorie ? `${ligne.categorieNom} › ${d.sousCategorie}` : ligne.categorieNom,
      });
    }
  }

  return [
    ...tete,
    { categorieId: null, categorieNom: "Autres", parPeriode, total, detail: detail.sort((a, b) => b.total - a.total) },
  ];
}

export type PosteFlux = {
  nom: string;
  montant: number;
  /** Sous-catégories d'une catégorie, pour l'infobulle. */
  sousCategories?: { nom: string; montant: number }[];
};

/** Revenu annuel, ponctuel ou exceptionnel reçu sur la période, cité à part (hors moyenne et hors diagramme). */
export type RevenuExceptionnel = { nom: string; montant: number; annee: number; mois: number /* 1-12 */ };

/**
 * Moyenne mensuelle de ce qui entre et sort d'un compte (diagramme « Où va l'argent ») :
 * une personne (entrées = revenus mensuels) ou le compte commun (entrées = virements reçus de chaque personne).
 */
export type Flux = {
  compte: "personne" | "commun";
  /** Nombre de mois moyennés. */
  nbMois: number;
  /** Revenus mensuels par source (personne) ou virements reçus par personne (compte commun). */
  entrees: PosteFlux[];
  /** Primes, revenus ponctuels et revenus exceptionnels reçus sur ces mois : cités à part. */
  revenusExceptionnels: RevenuExceptionnel[];
  epargne: number;
  /** Virement vers le compte commun (personne seulement). */
  commun: number;
  /** Charges (mensuelles, annuelles lissées, achats prévus) par catégorie. */
  charges: PosteFlux[];
  /** Dépenses du quotidien par catégorie (net des remboursements). */
  quotidien: PosteFlux[];
};

type RevenuExceptionnelSaisi = { libelle: string; montant: number; annee: number; mois: number };

const cleMois = (p: StatsPeriode) => `${p.annee}-${String(p.mois).padStart(2, "0")}`;

/** Postes moyens par catégorie (et sous-catégories pour l'infobulle), postes nuls ou négatifs écartés. */
function postesMoyens(lignes: StatsCategoriePeriode[], n: number): PosteFlux[] {
  return lignes
    .map((l) => {
      const parSousCategorie = new Map<string, number>();
      for (const d of l.detail) {
        if (d.sousCategorie) parSousCategorie.set(d.sousCategorie, (parSousCategorie.get(d.sousCategorie) ?? 0) + d.total);
      }
      return {
        nom: l.categorieNom,
        montant: l.total / n,
        sousCategories: Array.from(parSousCategorie, ([nom, total]) => ({ nom, montant: total / n }))
          .filter((sc) => sc.montant > 0.005)
          .sort((a, b) => b.montant - a.montant),
      };
    })
    .filter((p) => p.montant > 0.005)
    .sort((a, b) => b.montant - a.montant);
}

/** Revenus exceptionnels saisis qui tombent sur les mois donnés. */
function exceptionnelsSurMois(periodes: StatsPeriode[], saisis: RevenuExceptionnelSaisi[]): RevenuExceptionnel[] {
  const cles = new Set(periodes.map(cleMois));
  return saisis
    .filter((r) => cles.has(cleMois(r)) && r.montant > 0)
    .map((r) => ({ nom: r.libelle, montant: r.montant, annee: r.annee, mois: r.mois }));
}

const parDate = (a: RevenuExceptionnel, b: RevenuExceptionnel) => a.annee * 12 + a.mois - (b.annee * 12 + b.mois);

const fluxVide = (compte: Flux["compte"]): Flux => ({
  compte,
  nbMois: 0,
  entrees: [],
  revenusExceptionnels: [],
  epargne: 0,
  commun: 0,
  charges: [],
  quotidien: [],
});

/**
 * Moyenne mensuelle, sur les mois donnés (tous comptés de la même façon), des
 * flux d'argent d'une personne :
 * - revenus mensuels : montant réel saisi pour le mois, sinon référence ; les
 *   revenus annuels et ponctuels, et les revenus exceptionnels saisis sur la
 *   page d'un mois, sont listés à part, sur leur mois, sans entrer dans la
 *   moyenne ;
 * - virements vers le compte commun et vers l'épargne : montant saisi pour
 *   le mois, sinon le virement mensuel habituel de la personne ;
 * - charges perso et dépenses du quotidien par catégorie : `statsCharges` et
 *   `statsQuotidien`, calculées par l'appelant sur ces mêmes mois.
 */
export function fluxMensuelMoyenPersonne(data: {
  periodes: StatsPeriode[];
  personne: Pick<Personne, "id" | "virementMensuelHabituel" | "virementEpargneMensuelHabituel">;
  revenus: Revenu[];
  revenuAnnuelOverrides: Map<string, number>;
  revenuMensuelOverrides: Map<string, number>;
  /** Virements saisis par mois ("YYYY-MM", mois 1-12) pour cette personne. */
  virementsCommun: Map<string, number>;
  virementsEpargne: Map<string, number>;
  statsCharges: StatsCategoriePeriode[];
  statsQuotidien: StatsCategoriePeriode[];
  /** Revenus exceptionnels saisis sur la page d'un mois (ventes, cadeaux…) pour cette personne. */
  revenusExceptionnelsSaisis?: RevenuExceptionnelSaisi[];
}): Flux {
  const n = data.periodes.length;
  if (n === 0) return fluxVide("personne");

  const revenusParLibelle = new Map<string, number>();
  const revenusExceptionnels = exceptionnelsSurMois(data.periodes, data.revenusExceptionnelsSaisis ?? []);
  let commun = 0;
  let epargne = 0;
  for (const p of data.periodes) {
    for (const r of data.revenus) {
      if (r.personneId !== data.personne.id || !revenuActifPourMois(r, p.annee, p.mois - 1)) continue;
      if (r.type === "MENSUEL") {
        const montant = montantEffectifRevenuMensuel(data.revenuMensuelOverrides, r.id, p.annee, p.mois, r.montant);
        revenusParLibelle.set(r.libelle, (revenusParLibelle.get(r.libelle) ?? 0) + montant);
      } else {
        const montant =
          r.type === "ANNUEL" ? montantEffectifRevenuAnnuel(data.revenuAnnuelOverrides, r.id, p.annee, r.montant) : r.montant;
        if (montant > 0) revenusExceptionnels.push({ nom: r.libelle, montant, annee: p.annee, mois: p.mois });
      }
    }
    commun += data.virementsCommun.get(cleMois(p)) ?? data.personne.virementMensuelHabituel;
    epargne += data.virementsEpargne.get(cleMois(p)) ?? data.personne.virementEpargneMensuelHabituel;
  }

  return {
    compte: "personne",
    nbMois: n,
    entrees: Array.from(revenusParLibelle, ([nom, total]) => ({ nom, montant: total / n }))
      .filter((r) => r.montant > 0.005)
      .sort((a, b) => b.montant - a.montant),
    revenusExceptionnels: revenusExceptionnels.sort(parDate),
    epargne: Math.max(0, epargne / n),
    commun: Math.max(0, commun / n),
    charges: postesMoyens(data.statsCharges, n),
    quotidien: postesMoyens(data.statsQuotidien, n),
  };
}

/**
 * Même chose pour le compte commun : les entrées sont les virements reçus de
 * chaque personne (montant saisi pour le mois, sinon son virement mensuel
 * habituel), les sorties les charges communes et les dépenses du quotidien
 * du compte commun ; les revenus exceptionnels du compte commun sont cités à part.
 */
export function fluxMensuelMoyenCommun(data: {
  periodes: StatsPeriode[];
  personnes: Pick<Personne, "id" | "nom" | "virementMensuelHabituel">[];
  /** Virements saisis vers le compte commun, par personne puis par mois ("YYYY-MM"). */
  virementsParPersonne: Map<number, Map<string, number>>;
  statsCharges: StatsCategoriePeriode[];
  statsQuotidien: StatsCategoriePeriode[];
  revenusExceptionnelsSaisis?: RevenuExceptionnelSaisi[];
}): Flux {
  const n = data.periodes.length;
  if (n === 0) return fluxVide("commun");
  const entrees = data.personnes
    .map((personne) => {
      const saisis = data.virementsParPersonne.get(personne.id) ?? new Map<string, number>();
      const total = data.periodes.reduce((s, p) => s + (saisis.get(cleMois(p)) ?? personne.virementMensuelHabituel), 0);
      return { nom: `Virement ${personne.nom}`, montant: total / n };
    })
    .filter((e) => e.montant > 0.005)
    .sort((a, b) => b.montant - a.montant);
  return {
    compte: "commun",
    nbMois: n,
    entrees,
    revenusExceptionnels: exceptionnelsSurMois(data.periodes, data.revenusExceptionnelsSaisis ?? []).sort(parDate),
    epargne: 0,
    commun: 0,
    charges: postesMoyens(data.statsCharges, n),
    quotidien: postesMoyens(data.statsQuotidien, n),
  };
}

/** Multiplie les montants d'un flux (moyenne mensuelle → total de la période avec `facteur` = nombre de mois). Les revenus cités à part restent tels quels. */
export function echelleFlux(flux: Flux, facteur: number): Flux {
  const poste = (p: PosteFlux): PosteFlux => ({
    ...p,
    montant: p.montant * facteur,
    sousCategories: p.sousCategories?.map((sc) => ({ ...sc, montant: sc.montant * facteur })),
  });
  return {
    ...flux,
    entrees: flux.entrees.map(poste),
    epargne: flux.epargne * facteur,
    commun: flux.commun * facteur,
    charges: flux.charges.map(poste),
    quotidien: flux.quotidien.map(poste),
  };
}

/** Multiplie les montants de lignes par catégorie (total de la période → moyenne avec `facteur` = 1 / nombre de mois). */
export function echelleLignes(lignes: StatsCategoriePeriode[], facteur: number): StatsCategoriePeriode[] {
  return lignes.map((l) => ({
    ...l,
    total: l.total * facteur,
    parPeriode: l.parPeriode.map((m) => m * facteur),
    detail: l.detail.map((d) => ({ ...d, total: d.total * facteur })),
  }));
}
