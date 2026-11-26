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
 * - Charges mensuelles : comptées sur chaque période où elles sont actives.
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
  /** Sous-catégories d'une catégorie (montants moyens), pour l'infobulle. */
  sousCategories?: { nom: string; montant: number }[];
};

/** Revenu annuel ou ponctuel reçu sur la période, cité à part (hors moyenne). */
export type RevenuExceptionnel = { nom: string; montant: number; annee: number; mois: number /* 1-12 */ };

/** Moyenne mensuelle de ce qui entre et sort pour une personne (diagramme « Où va l'argent »). */
export type FluxPersonne = {
  /** Nombre de mois moyennés. */
  nbMois: number;
  /** Revenus mensuels par source (libellé du revenu), moyenne mensuelle. */
  revenus: PosteFlux[];
  /** Revenus annuels et ponctuels (primes…) reçus sur ces mois : cités à part, hors moyenne et hors diagramme. */
  revenusExceptionnels: RevenuExceptionnel[];
  epargne: number;
  commun: number;
  /** Charges perso (mensuelles, annuelles lissées, achats prévus) par catégorie. */
  charges: PosteFlux[];
  /** Dépenses du quotidien par catégorie (net des remboursements). */
  quotidien: PosteFlux[];
};

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
 * Les postes nuls ou négatifs sont écartés.
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
  /** Revenus exceptionnels saisis sur la page d'un mois (ventes, cadeaux…) pour cette personne : cités à part. */
  revenusExceptionnelsSaisis?: { libelle: string; montant: number; annee: number; mois: number }[];
}): FluxPersonne {
  const n = data.periodes.length;
  const vide = { nbMois: 0, revenus: [], revenusExceptionnels: [], epargne: 0, commun: 0, charges: [], quotidien: [] };
  if (n === 0) return vide;

  const revenusParLibelle = new Map<string, number>();
  const revenusExceptionnels: RevenuExceptionnel[] = [];
  let commun = 0;
  let epargne = 0;
  for (const p of data.periodes) {
    const cle = `${p.annee}-${String(p.mois).padStart(2, "0")}`;
    for (const r of data.revenus) {
      if (r.personneId !== data.personne.id || !revenuActifPourMois(r, p.annee, p.mois - 1)) continue;
      if (r.type === "MENSUEL") {
        const montant = montantEffectifRevenuMensuel(data.revenuMensuelOverrides, r.id, p.annee, p.mois, r.montant);
        revenusParLibelle.set(r.libelle, (revenusParLibelle.get(r.libelle) ?? 0) + montant);
      } else {
        const montant =
          r.type === "ANNUEL"
            ? montantEffectifRevenuAnnuel(data.revenuAnnuelOverrides, r.id, p.annee, r.montant)
            : r.montant;
        if (montant > 0) revenusExceptionnels.push({ nom: r.libelle, montant, annee: p.annee, mois: p.mois });
      }
    }
    commun += data.virementsCommun.get(cle) ?? data.personne.virementMensuelHabituel;
    epargne += data.virementsEpargne.get(cle) ?? data.personne.virementEpargneMensuelHabituel;
  }

  const cles = new Set(data.periodes.map((p) => `${p.annee}-${p.mois}`));
  for (const r of data.revenusExceptionnelsSaisis ?? []) {
    if (cles.has(`${r.annee}-${r.mois}`) && r.montant > 0) {
      revenusExceptionnels.push({ nom: r.libelle, montant: r.montant, annee: r.annee, mois: r.mois });
    }
  }
  revenusExceptionnels.sort((a, b) => a.annee * 12 + a.mois - (b.annee * 12 + b.mois));

  const postes = (lignes: StatsCategoriePeriode[]): PosteFlux[] =>
    lignes
      .map((l) => {
        const parSousCategorie = new Map<string, number>();
        for (const d of l.detail) {
          if (d.sousCategorie)
            parSousCategorie.set(d.sousCategorie, (parSousCategorie.get(d.sousCategorie) ?? 0) + d.total);
        }
        return {
          nom: l.categorieNom,
          montant: l.total / n,
          sousCategories: Array.from(parSousCategorie, ([nom, total]) => ({ nom, montant: total / n }))
            .filter((s) => s.montant > 0.005)
            .sort((a, b) => b.montant - a.montant),
        };
      })
      .filter((p) => p.montant > 0.005)
      .sort((a, b) => b.montant - a.montant);

  return {
    nbMois: n,
    revenus: Array.from(revenusParLibelle, ([nom, total]) => ({ nom, montant: total / n }))
      .filter((r) => r.montant > 0.005)
      .sort((a, b) => b.montant - a.montant),
    revenusExceptionnels,
    epargne: Math.max(0, epargne / n),
    commun: Math.max(0, commun / n),
    charges: postes(data.statsCharges),
    quotidien: postes(data.statsQuotidien),
  };
}
