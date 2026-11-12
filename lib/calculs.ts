import type {
  Personne,
  Revenu,
  ChargeMensuelle,
  ChargeAnnuelle,
  AchatPrevu,
  CleRepartition,
} from "@/app/generated/prisma/client";

/**
 * Nombre de mois sur lesquels étaler une provision, en comptant le mois en
 * cours ET le mois de l'échéance (minimum 1). Par exemple, un achat visé en
 * septembre alors qu'on est en août compte pour 2 mois (août + septembre),
 * pas 1 : on considère qu'on a jusqu'au virement du mois de l'échéance pour
 * finir de le financer.
 */
export function moisRestants(dateVisee: Date, from: Date = new Date()): number {
  const months =
    (dateVisee.getFullYear() - from.getFullYear()) * 12 +
    (dateVisee.getMonth() - from.getMonth()) +
    1;
  return Math.max(months, 1);
}

/**
 * Prochaine occurrence de l'échéance d'une charge annuelle à partir de
 * `from` : ce mois-ci si `moisEcheance` n'est pas encore passé cette année,
 * sinon l'année suivante.
 */
function prochaineEcheanceChargeAnnuelle(moisEcheance: number, from: Date): Date {
  const moisEcheance0 = moisEcheance - 1; // 1-12 -> 0-11
  const annee = from.getFullYear();
  if (moisEcheance0 >= from.getMonth()) return new Date(annee, moisEcheance0, 1);
  return new Date(annee + 1, moisEcheance0, 1);
}

/**
 * Année de l'échéance du cycle annuel auquel appartient `date`, pour une
 * charge dont l'échéance tombe au mois `moisEcheance` (1-12). Permet de
 * savoir si deux dates quelconques (ex : un mois affiché et la date d'un
 * paiement) se rapportent à la même occurrence annuelle de l'échéance :
 * l'année de `date` si `date` est ce mois-ci ou avant (paiement à l'heure ou
 * en avance), ou jusqu'à 6 mois après (paiement en retard, encore rattaché à
 * l'échéance qui vient de passer plutôt qu'à la suivante) — au-delà,
 * l'année suivante.
 */
function anneeEcheanceCycle(date: Date, moisEcheance: number): number {
  const moisEcheance0 = moisEcheance - 1;
  const echeanceCetteAnneeAbs = moisAbs(date.getFullYear(), moisEcheance0);
  const dateAbs = moisAbs(date.getFullYear(), date.getMonth());
  if (dateAbs <= echeanceCetteAnneeAbs) return date.getFullYear();
  const moisDeRetard = dateAbs - echeanceCetteAnneeAbs;
  return moisDeRetard <= 6 ? date.getFullYear() : date.getFullYear() + 1;
}

/**
 * Montant réellement dû à l'échéance d'une charge annuelle — débité par
 * `marquerChargeAnnuellePayee` : le montant plein en mode classique, ou le
 * restant après `dejaProvisionne` en mode rattrapage (voir
 * `detailUneChargeAnnuelleMois`).
 */
export function montantResoluChargeAnnuelle(charge: Pick<ChargeAnnuelle, "montant" | "dejaProvisionne">): number {
  return charge.dejaProvisionne === null ? charge.montant : Math.max(charge.montant - charge.dejaProvisionne, 0);
}

/**
 * La charge annuelle a-t-elle déjà été marquée payée pour le cycle annuel
 * auquel appartient (annee, mois) — que le paiement ait eu lieu pile au mois
 * d'échéance, en avance ou en retard (voir `anneeEcheanceCycle`) ? Sert à
 * exclure une charge déjà débitée en direct d'un calcul de solde, pour
 * éviter de la déduire une seconde fois — n'affecte jamais le lissage
 * mensuel affiché (`provision`), qui continue normalement pour le cycle
 * suivant (voir `detailUneChargeAnnuelleMois`).
 */
export function dejaPayeeCeCycle(
  charge: Pick<ChargeAnnuelle, "dateDernierPaiement" | "moisEcheance">,
  annee: number,
  mois: number // 0-11
): boolean {
  if (!charge.dateDernierPaiement) return false;
  return (
    anneeEcheanceCycle(charge.dateDernierPaiement, charge.moisEcheance) ===
    anneeEcheanceCycle(new Date(annee, mois, 1), charge.moisEcheance)
  );
}

/**
 * Détail d'une charge annuelle pour un mois donné (provision, échéance) —
 * partagé par `detailChargesAnnuellesMois` (communes) et
 * `detailChargesAnnuellesPersonneMois` (perso).
 *
 * Comportement classique (`dejaProvisionne` à `null`, le cas par défaut pour
 * toutes les charges existantes) : lissage fixe montant/12, peu importe le
 * mois — la charge est supposée exister depuis toujours, donc le solde a eu
 * le temps d'accumuler les provisions des mois précédents avant l'échéance.
 *
 * Mode rattrapage (`dejaProvisionne` renseigné, y compris 0) : pour une
 * charge tout juste créée dont la prochaine échéance est proche, ces mois
 * précédents n'ont jamais existé — rien n'a réellement été mis de côté. Le
 * montant restant (montant - dejaProvisionne) est donc réparti sur les mois
 * qui restent jusqu'à cette échéance (comme un achat prévu), pour que la
 * provision affichée reflète le vrai effort nécessaire au lieu du lissage
 * /12 optimiste. Une fois cette échéance passée, le rattrapage ne s'applique
 * plus : les cycles suivants retombent automatiquement sur le lissage
 * classique, sans qu'il soit nécessaire de remettre `dejaProvisionne` à
 * `null` à la main.
 *
 * Cycle déjà réglé (`dateDernierPaiement` renseigné, voir
 * `marquerChargeAnnuellePayee`) : n'affecte PAS ce calcul (le lissage
 * mensuel continue normalement, y compris après l'échéance, puisqu'il faut
 * continuer à mettre de côté pour l'échéance suivante) — seul l'appelant
 * (`detailMoisCommun`, via `dejaPayeeCeCycle`) exclut le montant déjà débité
 * en direct du solde projeté, pour éviter un double comptage.
 */
function detailUneChargeAnnuelleMois(
  charge: ChargeAnnuelle,
  annee: number,
  mois: number, // 0-11
  from: Date
): { provision: number; estEcheance: boolean; montantDu: number } {
  if (chargeAnnuelleTerminee(charge, annee, mois)) return { provision: 0, estEcheance: false, montantDu: 0 };
  const estEcheance = charge.moisEcheance === mois + 1;

  if (charge.dejaProvisionne === null) {
    const provision = charge.montant / 12;
    return { provision, estEcheance, montantDu: estEcheance ? charge.montant : provision };
  }

  const prochaine = prochaineEcheanceChargeAnnuelle(charge.moisEcheance, from);
  const cibleAbs = moisAbs(annee, mois);
  const prochaineAbs = moisAbs(prochaine.getFullYear(), prochaine.getMonth());

  if (cibleAbs > prochaineAbs) {
    // Cycle suivant : le rattrapage ne concernait que la toute prochaine
    // échéance, déjà passée à ce stade.
    const provision = charge.montant / 12;
    return { provision, estEcheance, montantDu: estEcheance ? charge.montant : provision };
  }

  const debutEffectif = debutProvisionnementEffectif(charge, from);
  const debutEffectifAbs = moisAbs(debutEffectif.getFullYear(), debutEffectif.getMonth());
  if (cibleAbs < debutEffectifAbs) {
    // Avant le début effectif du provisionnement (ex : charge créée en
    // cours de mois, ce mois-ci n'a pas pu être provisionné) : rien compté
    // ce mois-ci pour cette charge.
    return { provision: 0, estEcheance: false, montantDu: 0 };
  }

  const restant = Math.max(charge.montant - charge.dejaProvisionne, 0);
  const provision = restant / moisRestants(prochaine, debutEffectif);
  return { provision, estEcheance, montantDu: estEcheance ? restant : provision };
}

/** Provision mensuelle d'une charge annuelle pour le mois de `from` (voir `detailUneChargeAnnuelleMois`). */
export function provisionChargeAnnuelle(charge: ChargeAnnuelle, from: Date = new Date()): number {
  return detailUneChargeAnnuelleMois(charge, from.getFullYear(), from.getMonth(), from).provision;
}

/**
 * Point de départ effectif du provisionnement d'un achat prévu ou d'une
 * charge annuelle en mode rattrapage : sa date de début de provisionnement
 * si elle est renseignée et postérieure à `from` (le provisionnement n'a pas
 * encore commencé), sinon `from` (comportement par défaut, inchangé si le
 * champ est vide).
 */
function debutProvisionnementEffectif(
  item: { dateDebutProvisionnement: Date | null },
  from: Date
): Date {
  if (item.dateDebutProvisionnement && item.dateDebutProvisionnement.getTime() > from.getTime()) {
    return item.dateDebutProvisionnement;
  }
  return from;
}

/** Provision mensuelle d'un achat prévu = (montant cible - déjà provisionné) / mois restants (à partir du début effectif du provisionnement) */
export function provisionAchatPrevu(
  achat: Pick<
    AchatPrevu,
    "montantCible" | "dejaProvisionne" | "dateVisee" | "achete" | "dateDebutProvisionnement" | "sansProvisionnement"
  >,
  from: Date = new Date()
): number {
  if (achat.achete) return 0;
  if (achat.sansProvisionnement) return 0;
  const restant = Math.max(achat.montantCible - achat.dejaProvisionne, 0);
  if (restant === 0) return 0;
  return restant / moisRestants(achat.dateVisee, debutProvisionnementEffectif(achat, from));
}

/** Revenus mensuels récurrents (type MENSUEL) d'une personne */
export function revenuMensuel(revenus: Revenu[], personneId: number): number {
  return revenus
    .filter((r) => r.personneId === personneId && r.type === "MENSUEL")
    .reduce((sum, r) => sum + r.montant, 0);
}

/** Un revenu (mensuel, ponctuel ou annuel) tombe-t-il sur ce mois précis ? */
export function revenuActifPourMois(
  revenu: Pick<Revenu, "type" | "date" | "moisRecurrence">,
  annee: number,
  mois: number // 0-11
): boolean {
  if (revenu.type === "MENSUEL") return true;
  if (revenu.type === "PONCTUEL") {
    return revenu.date !== null && revenu.date.getFullYear() === annee && revenu.date.getMonth() === mois;
  }
  // ANNUEL : revient chaque année au mois de récurrence, quelle que soit l'année.
  return revenu.moisRecurrence === mois + 1;
}

/** Clé technique d'un override de montant de revenu annuel, pour une année donnée. */
export function cleRevenuAnnuelMontant(revenuId: number, annee: number): string {
  return `${revenuId}:${annee}`;
}

/**
 * Montant effectif d'un revenu annuel pour une année donnée : le montant
 * réel saisi pour cette année-là (`overrides`) s'il existe, sinon le montant
 * de référence de la définition du revenu.
 */
export function montantEffectifRevenuAnnuel(
  overrides: Map<string, number>,
  revenuId: number,
  annee: number,
  reference: number
): number {
  return overrides.get(cleRevenuAnnuelMontant(revenuId, annee)) ?? reference;
}

/** Clé technique d'un override de montant de revenu mensuel, pour un mois/année donnés. */
export function cleRevenuMensuelMontant(revenuId: number, annee: number, mois: number): string {
  return `${revenuId}:${annee}:${mois}`;
}

/**
 * Montant effectif d'un revenu mensuel pour un mois donné : le montant réel
 * saisi pour ce mois-là (`overrides`) s'il existe, sinon le montant de
 * référence de la définition du revenu (même logique que
 * `montantEffectifRevenuAnnuel`, indexée par mois plutôt que par année).
 */
export function montantEffectifRevenuMensuel(
  overrides: Map<string, number>,
  revenuId: number,
  annee: number,
  mois: number, // 1-12
  reference: number
): number {
  return overrides.get(cleRevenuMensuelMontant(revenuId, annee, mois)) ?? reference;
}

/** Somme des revenus d'une personne pour un mois donné, montants réels des revenus annuels et mensuels inclus. */
export function revenusDuMoisTotal(
  revenus: Revenu[],
  personneId: number,
  annee: number,
  mois: number, // 0-11
  overridesAnnuel: Map<string, number>,
  overridesMensuel: Map<string, number> = new Map()
): number {
  return revenus
    .filter((r) => r.personneId === personneId && revenuActifPourMois(r, annee, mois))
    .reduce((sum, r) => {
      if (r.type === "ANNUEL") return sum + montantEffectifRevenuAnnuel(overridesAnnuel, r.id, annee, r.montant);
      if (r.type === "MENSUEL") return sum + montantEffectifRevenuMensuel(overridesMensuel, r.id, annee, mois + 1, r.montant);
      return sum + r.montant;
    }, 0);
}

/**
 * Une charge mensuelle est active pour un mois donné si elle n'a pas de date
 * de début, ou si cette date tombe ce mois-ci ou avant — et si elle n'a pas
 * de date de fin, ou si cette date tombe ce mois-ci ou après (dernier mois
 * actif inclus).
 */
export function estChargeMensuelleActive(
  charge: Pick<ChargeMensuelle, "dateDebut" | "dateFin" | "moisDebutAnnee" | "moisFinAnnee">,
  annee: number,
  mois: number // 0-11
): boolean {
  if (!estDansMoisActifsAnnee(charge, mois + 1)) return false;
  const moisCible = moisAbs(annee, mois);
  if (charge.dateDebut && moisAbs(charge.dateDebut.getFullYear(), charge.dateDebut.getMonth()) > moisCible) {
    return false;
  }
  if (charge.dateFin && moisAbs(charge.dateFin.getFullYear(), charge.dateFin.getMonth()) < moisCible) {
    return false;
  }
  return true;
}

/**
 * Le mois (1-12) fait-il partie des mois de l'année où la charge tombe
 * (`moisDebutAnnee` → `moisFinAnnee`, bornes incluses, éventuellement à
 * cheval sur deux années) ? Toujours vrai si la plage n'est pas renseignée.
 */
function estDansMoisActifsAnnee(
  charge: Pick<ChargeMensuelle, "moisDebutAnnee" | "moisFinAnnee">,
  mois: number // 1-12
): boolean {
  const { moisDebutAnnee: debut, moisFinAnnee: fin } = charge;
  if (debut === null || fin === null) return true;
  return debut <= fin ? mois >= debut && mois <= fin : mois >= debut || mois <= fin;
}

/**
 * Charge annuelle arrêtée (`anneeDerniereEcheance`) dont la dernière
 * échéance est déjà passée au mois ciblé : elle ne compte plus du tout
 * (ni provision, ni échéance, ni réserve — voir `detailUneChargeAnnuelleMois`).
 * Le mois de la dernière échéance lui-même compte encore normalement.
 */
export function chargeAnnuelleTerminee(
  charge: Pick<ChargeAnnuelle, "anneeDerniereEcheance" | "moisEcheance">,
  annee: number,
  mois: number // 0-11
): boolean {
  if (charge.anneeDerniereEcheance === null) return false;
  return moisAbs(annee, mois) > moisAbs(charge.anneeDerniereEcheance, charge.moisEcheance - 1);
}

export type HistoriqueMontantCharge = {
  id: number;
  chargeMensuelleId: number;
  depuisAnnee: number;
  depuisMois: number; // 1-12
  montant: number;
};

/**
 * Montant effectif d'une charge mensuelle pour un mois donné : le montant du
 * changement daté le plus récent dont le "depuis" est <= à ce mois, sinon le
 * montant de base de la charge (même logique que `montantEffectifRevenuAnnuel`,
 * mais indexée par mois plutôt que par année).
 */
function montantChargeMensuellePourMois(
  charge: Pick<ChargeMensuelle, "montant">,
  historiqueDeLaCharge: HistoriqueMontantCharge[] | undefined,
  annee: number,
  mois: number // 0-11
): number {
  if (!historiqueDeLaCharge || historiqueDeLaCharge.length === 0) return charge.montant;
  const cibleAbs = moisAbs(annee, mois);
  let meilleur: { abs: number; montant: number } | null = null;
  for (const h of historiqueDeLaCharge) {
    const abs = moisAbs(h.depuisAnnee, h.depuisMois - 1);
    if (abs <= cibleAbs && (meilleur === null || abs > meilleur.abs)) {
      meilleur = { abs, montant: h.montant };
    }
  }
  return meilleur ? meilleur.montant : charge.montant;
}

/**
 * Retourne une copie de `charges` avec `.montant` remplacé par le montant
 * effectif pour le mois donné (voir `montantChargeMensuellePourMois`) — permet
 * au reste du code de continuer à lire `charge.montant` sans se soucier de
 * l'historique. Retourne `charges` tel quel si `historiqueParCharge` est vide
 * (comportement inchangé si aucun changement daté n'existe).
 */
export function withMontantResolu<T extends Pick<ChargeMensuelle, "id" | "montant">>(
  charges: T[],
  historiqueParCharge: Map<number, HistoriqueMontantCharge[]>,
  annee: number,
  mois: number // 0-11
): T[] {
  if (historiqueParCharge.size === 0) return charges;
  return charges.map((c) => ({
    ...c,
    montant: montantChargeMensuellePourMois(c, historiqueParCharge.get(c.id), annee, mois),
  }));
}

/**
 * Changement daté en vigueur pour le mois donné, ou `null` si c'est le montant
 * de base de la charge qui s'applique (aucun changement daté n'a encore pris
 * effet) — sert à savoir quelle ligne corriger depuis « Montant actuel ».
 */
export function changementEnVigueur(
  historiqueDeLaCharge: HistoriqueMontantCharge[],
  annee: number,
  mois: number // 0-11
): HistoriqueMontantCharge | null {
  const cibleAbs = moisAbs(annee, mois);
  let meilleur: HistoriqueMontantCharge | null = null;
  for (const h of historiqueDeLaCharge) {
    const abs = moisAbs(h.depuisAnnee, h.depuisMois - 1);
    if (abs <= cibleAbs && (meilleur === null || abs > moisAbs(meilleur.depuisAnnee, meilleur.depuisMois - 1))) {
      meilleur = h;
    }
  }
  return meilleur;
}

export type PeriodeMontantCharge = {
  /** `null` = montant de base de la charge (première période), sinon id du changement daté. */
  historiqueId: number | null;
  /** Premier mois de la période (0-11), `null` = depuis le début de la charge. */
  debut: { annee: number; mois: number } | null;
  /** Dernier mois inclus (0-11), `null` = sans fin connue. */
  fin: { annee: number; mois: number } | null;
  montant: number;
  enCours: boolean;
};

/**
 * Découpe l'historique d'une charge en périodes consécutives (ex : début →
 * septembre 2026 = 500 €, octobre 2026 → février 2027 = 600 €, mars 2027 → … =
 * 850 €), la première portant le montant de base de la charge.
 */
export function periodesMontantsCharge(
  charge: Pick<ChargeMensuelle, "montant">,
  historiqueDeLaCharge: HistoriqueMontantCharge[],
  aujourdhui: Date
): PeriodeMontantCharge[] {
  const tries = [...historiqueDeLaCharge].sort(
    (a, b) => moisAbs(a.depuisAnnee, a.depuisMois - 1) - moisAbs(b.depuisAnnee, b.depuisMois - 1)
  );
  const debuts = tries.map((h) => moisAbs(h.depuisAnnee, h.depuisMois - 1));
  const aujourdhuiAbs = moisAbs(aujourdhui.getFullYear(), aujourdhui.getMonth());
  const versMois = (abs: number) => ({ annee: Math.floor(abs / 12), mois: abs % 12 });

  const periodes: PeriodeMontantCharge[] = [
    {
      historiqueId: null,
      debut: null,
      fin: debuts.length > 0 ? versMois(debuts[0] - 1) : null,
      montant: charge.montant,
      enCours: debuts.length === 0 || aujourdhuiAbs < debuts[0],
    },
  ];
  tries.forEach((h, i) => {
    const suivant = debuts[i + 1];
    periodes.push({
      historiqueId: h.id,
      debut: versMois(debuts[i]),
      fin: suivant !== undefined ? versMois(suivant - 1) : null,
      montant: h.montant,
      enCours: aujourdhuiAbs >= debuts[i] && (suivant === undefined || aujourdhuiAbs < suivant),
    });
  });
  return periodes;
}

/** Charges mensuelles communes actives (compte = COMMUN), pour un mois donné */
export function chargesMensuellesCommunes(
  charges: ChargeMensuelle[],
  annee: number,
  mois: number // 0-11
): number {
  return charges
    .filter((c) => c.compte === "COMMUN" && estChargeMensuelleActive(c, annee, mois))
    .reduce((sum, c) => sum + c.montant, 0);
}

/**
 * Virement dû par chaque personne sur le compte commun, selon la clé de répartition.
 * - EGALE : le besoin est divisé à parts égales entre toutes les personnes.
 * - PRORATA_REVENUS : chacun paie au prorata de son revenu mensuel récurrent.
 */
export function virementsParPersonne(
  personnes: Personne[],
  revenus: Revenu[],
  besoin: number,
  cle: CleRepartition
): Map<number, number> {
  const result = new Map<number, number>();
  if (personnes.length === 0) return result;

  if (cle === "PRORATA_REVENUS") {
    const revenusParPersonne = personnes.map((p) => revenuMensuel(revenus, p.id));
    const totalRevenus = revenusParPersonne.reduce((a, b) => a + b, 0);
    if (totalRevenus > 0) {
      personnes.forEach((p, i) => {
        result.set(p.id, besoin * (revenusParPersonne[i] / totalRevenus));
      });
      return result;
    }
    // Pas de revenu connu : on retombe sur une répartition égale.
  }

  const part = besoin / personnes.length;
  personnes.forEach((p) => result.set(p.id, part));
  return result;
}

const MOIS_LABELS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

/** Clé "YYYY-MM" d'un mois (mois 0-11, convention JS Date). */
export function moisCle(annee: number, mois: number): string {
  return `${annee}-${String(mois + 1).padStart(2, "0")}`;
}

/** Clé technique d'un paiement (charge mensuelle/annuelle ou achat prévu) pour un mois. */
export function clePaiement(type: string, refId: number): string {
  return `${type}:${refId}`;
}

/**
 * Une charge mensuelle est-elle considérée débitée par défaut, en l'absence
 * de pointage explicite, à la date `from` ? Vrai dans tous les cas SAUF pour
 * le mois en cours (celui où tombe `from`) avec un jour de prélèvement connu
 * (`jourDebit`) pas encore atteint ce mois-ci — un mois plus court que
 * `jourDebit` (ex. 31 en février) est traité comme débité dès le dernier
 * jour du mois. Un mois déjà passé est toujours considéré débité (le mois
 * entier s'est écoulé, donc forcément déjà prélevé, quel que soit le jour) ;
 * un mois futur n'utilise de toute façon jamais ce résultat (voir
 * `chargesRestantACePayer`, seulement calculé pour le mois en cours). Sert à
 * affiner le solde projeté du mois en cours au jour près plutôt que de
 * supposer tout payé dès le 1er.
 */
export function chargeDejaDebiteeParDefaut(
  charge: Pick<ChargeMensuelle, "jourDebit">,
  annee: number,
  mois: number, // 0-11
  from: Date
): boolean {
  if (!charge.jourDebit) return true;
  if (from.getFullYear() !== annee || from.getMonth() !== mois) return true;
  const dernierJourDuMois = new Date(annee, mois + 1, 0).getDate();
  const jourCible = Math.min(charge.jourDebit, dernierJourDuMois);
  return from.getDate() >= jourCible;
}

/**
 * Montant effectivement considéré comme payé pour un élément (charge
 * mensuelle, charge annuelle ou achat prévu) d'un mois donné. Un virement
 * suffisant ayant toujours lieu, on considère un élément payé au montant de
 * référence PAR DÉFAUT, sans suivi explicite — sauf s'il a été explicitement
 * décoché (payé = false, donc 0), si un montant réel différent a été saisi
 * (charges à montant variable), ou si `defautPaye` vaut faux (voir
 * `chargeDejaDebiteeParDefaut` : jour de prélèvement pas encore atteint ce
 * mois-ci).
 */
export function montantEffectifPaye(
  paiements: Map<string, boolean>,
  montants: Map<string, number>,
  cle: string,
  reference: number,
  defautPaye = true
): number {
  const montantSaisi = montants.get(cle);
  if (montantSaisi !== undefined) return montantSaisi;
  const etat = paiements.get(cle);
  if (etat !== undefined) return etat ? reference : 0;
  return defautPaye ? reference : 0;
}

/**
 * "Payé effectif" d'une charge mensuelle pour le calcul du solde. Cas normal :
 * comportement de `montantEffectifPaye`. Cas de la charge budget « dépenses du
 * quotidien » (`budgetDepensesQuotidiennes`), deux variantes selon
 * `depensesDejaDeduitesDuSolde` :
 * - `false` (défaut, compte perso — jamais suivi en direct) : réserve au
 *   moins le montant de référence, ajusté à la hausse si les dépenses réelles
 *   le dépassent, jamais à la baisse en cours de mois.
 * - `true` (compte commun — chaque dépense du quotidien décrémente déjà
 *   `parametres.soldeCommun` en direct à la saisie, voir
 *   `ajouterDepenseQuotidienne`) : seul le reliquat du budget de référence
 *   (montant de référence − déjà dépensé) reste à réserver pour ne pas
 *   compter le réel déjà déduit une seconde fois ; 0 si déjà dépassé (le
 *   dépassement est alors déjà reflété par le solde réel).
 */
export function montantPayeEffectifCharge(
  charge: Pick<ChargeMensuelle, "id" | "montant" | "budgetDepensesQuotidiennes">,
  paiements: Map<string, boolean>,
  montants: Map<string, number>,
  depensesQuotidiennesReelTotal: number,
  depensesDejaDeduitesDuSolde = false,
  defautPaye = true
): number {
  if (charge.budgetDepensesQuotidiennes) {
    return depensesDejaDeduitesDuSolde
      ? Math.min(charge.montant, depensesQuotidiennesReelTotal)
      : charge.montant - Math.max(charge.montant, depensesQuotidiennesReelTotal);
  }
  return montantEffectifPaye(paiements, montants, clePaiement("CHARGE_MENSUELLE", charge.id), charge.montant, defautPaye);
}

/** Libellé lisible d'un mois (mois 0-11, convention JS Date). */
export function moisLabel(annee: number, mois: number): string {
  return `${MOIS_LABELS[mois]} ${annee}`;
}

function moisAbs(annee: number, mois: number): number {
  return annee * 12 + mois;
}

export type DetailChargeAnnuelleMois = {
  charge: ChargeAnnuelle;
  provision: number;
  estEcheance: boolean;
  montantDu: number;
};

export type DetailAchatMois = {
  achat: AchatPrevu;
  provision: number;
  estCollecte: boolean;
  estEcheance: boolean;
  montantDu: number;
};

/**
 * Détail d'un achat prévu pour un mois donné (provision, collecte, échéance) —
 * partagé par `detailMoisCommun` (achats communs) et
 * `detailAchatsPrevusPersonneMois` (achats perso). Retourne `null` si l'achat
 * n'est pas actif ce mois-ci (avant son début effectif, après son échéance,
 * ou déjà entièrement provisionné).
 */
function detailUnAchatMois(
  achat: AchatPrevu,
  annee: number,
  mois: number, // 0-11
  from: Date
): { provision: number; estCollecte: boolean; estEcheance: boolean; montantDu: number } | null {
  const restant = Math.max(achat.montantCible - achat.dejaProvisionne, 0);
  if (restant === 0) return null;

  const moisCourantAbs = moisAbs(annee, mois);

  if (achat.achete) {
    // Résolu : le montant a déjà été débité en direct (voir
    // `marquerAchatAchete`) au mois réellement en cours au moment du clic
    // (`dateAchat`), pas forcément le mois initialement visé — l'achat
    // n'apparaît donc plus que ce mois-là, informatif (déjà exclu de
    // `sortiesExceptionnellesTotal` pour éviter un double comptage, voir
    // `detailMoisCommun`), et disparaît de tous les autres mois, passés ou
    // futurs.
    if (!achat.dateAchat) return null;
    const dateAchatAbs = moisAbs(achat.dateAchat.getFullYear(), achat.dateAchat.getMonth());
    if (moisCourantAbs !== dateAchatAbs) return null;
    return { provision: 0, estCollecte: false, estEcheance: true, montantDu: restant };
  }

  const debutEffectif = debutProvisionnementEffectif(achat, from);
  const debutEffectifAbs = moisAbs(debutEffectif.getFullYear(), debutEffectif.getMonth());

  const dueAbs = moisAbs(achat.dateVisee.getFullYear(), achat.dateVisee.getMonth());
  // Si la date visée est déjà passée par rapport au début effectif (donc par
  // rapport à aujourd'hui dans le cas courant, `debutEffectif` valant
  // `from`), on traite l'achat comme dû "maintenant" — l'échéance affichée
  // avance donc mois après mois tant que l'achat n'est pas marqué acheté,
  // au lieu de disparaître une fois la date visée dépassée.
  const echeanceAbs = Math.max(dueAbs, debutEffectifAbs);

  // Avant le début effectif du provisionnement, l'achat n'apparaît pas et
  // ne pèse pas sur le besoin. Après l'échéance (qui suit aujourd'hui tant
  // que l'achat n'est pas acheté, voir ci-dessus), rien à afficher non plus.
  if (moisCourantAbs < debutEffectifAbs || moisCourantAbs > echeanceAbs) return null;
  // Sans provisionnement : aucune collecte mensuelle, l'achat n'apparaît
  // qu'au mois de l'échéance (montant plein d'un coup).
  if (achat.sansProvisionnement && moisCourantAbs < echeanceAbs) return null;

  // La fenêtre de collecte va du début effectif au mois d'échéance INCLUS
  // (cohérent avec `moisRestants`, qui compte les deux bornes) : le mois
  // d'échéance collecte donc aussi sa propre provision, en plus de payer le
  // montant plein restant.
  const estCollecte = moisCourantAbs >= debutEffectifAbs && moisCourantAbs <= echeanceAbs;
  const estEcheance = moisCourantAbs === echeanceAbs;

  // Cas particulier « sans provisionnement » : `provisionAchatPrevu` renvoie
  // toujours 0 (pas de lissage mensuel), y compris au mois d'échéance — mais
  // ce mois-là, le montant plein doit bien peser sur le besoin (voir le
  // texte d'aide du formulaire : « ne pèse sur le besoin qu'au mois de
  // l'échéance, montant plein d'un coup »), sans quoi le Résultat ne
  // refléterait jamais cette dépense, même quand elle tombe réellement.
  const provision = achat.sansProvisionnement && estEcheance ? restant : provisionAchatPrevu(achat, from);

  return { provision, estCollecte, estEcheance, montantDu: estEcheance ? restant : provision };
}

export type DetailMoisCommun = {
  chargesAnnuelles: DetailChargeAnnuelleMois[];
  achats: DetailAchatMois[];
  provisionAnnuellesCommunesTotal: number;
  provisionsAchatsCeMoisTotal: number;
  sortiesExceptionnellesTotal: number;
  /** Somme de tous les montants dus (provision ou plein, toutes phases confondues). */
  montantDuTotalToutesPhases: number;
};

/** Détail par charge annuelle, pour un mois donné : provision lissée (ou de rattrapage) ou montant plein à l'échéance. Les charges déjà terminées ce mois-là (voir `chargeAnnuelleTerminee`) n'y figurent pas. */
export function detailChargesAnnuellesMois(
  charges: ChargeAnnuelle[],
  annee: number,
  mois: number, // 0-11
  from: Date
): DetailChargeAnnuelleMois[] {
  return charges
    .filter((charge) => !chargeAnnuelleTerminee(charge, annee, mois))
    .map((charge) => ({ charge, ...detailUneChargeAnnuelleMois(charge, annee, mois, from) }));
}

export type DetailChargesAnnuellesPersonneMois = {
  items: DetailChargeAnnuelleMois[];
  provisionTotal: number;
  /** Part du montant dû, au-delà de la provision de ce mois, pour les charges arrivant à échéance. */
  sortiesExceptionnellesTotal: number;
  /** Somme de tous les montants dus (provision ou plein), toutes charges confondues. */
  montantDuTotalToutesPhases: number;
};

/** Détail des charges annuelles perso d'une personne, pour un mois donné. */
export function detailChargesAnnuellesPersonneMois(data: {
  chargesAnnuelles: ChargeAnnuelle[];
  personneId: number;
  annee: number;
  mois: number; // 0-11
  from: Date;
}): DetailChargesAnnuellesPersonneMois {
  const items = detailChargesAnnuellesMois(
    data.chargesAnnuelles.filter((c) => c.compte === "PERSO" && c.personneId === data.personneId),
    data.annee,
    data.mois,
    data.from
  );
  const provisionTotal = items.reduce((sum, d) => sum + d.provision, 0);
  const sortiesExceptionnellesTotal = items
    .filter((d) => d.estEcheance)
    .reduce((sum, d) => sum + (d.montantDu - d.provision), 0);
  const montantDuTotalToutesPhases = items.reduce((sum, d) => sum + d.montantDu, 0);
  return { items, provisionTotal, sortiesExceptionnellesTotal, montantDuTotalToutesPhases };
}

export type DetailAchatsPrevusPersonneMois = {
  items: DetailAchatMois[];
  provisionTotal: number;
  /** Part du montant dû, au-delà de la provision de ce mois, pour les achats arrivant à échéance (hors achats déjà marqués achetés, déjà débités directement — voir `marquerAchatAchete`). */
  sortiesExceptionnellesTotal: number;
  /** Somme de tous les montants dus (provision ou plein), tous achats confondus. */
  montantDuTotalToutesPhases: number;
};

/** Détail des achats prévus perso d'une personne, pour un mois donné (même logique que `detailMoisCommun` côté commun). */
export function detailAchatsPrevusPersonneMois(data: {
  achatsPrevus: AchatPrevu[];
  personneId: number;
  annee: number;
  mois: number; // 0-11
  from: Date;
}): DetailAchatsPrevusPersonneMois {
  const achatsPerso = data.achatsPrevus.filter(
    (a) => a.compte === "PERSO" && a.personneId === data.personneId
  );
  const items: DetailAchatMois[] = [];
  for (const achat of achatsPerso) {
    const d = detailUnAchatMois(achat, data.annee, data.mois, data.from);
    if (!d) continue;
    items.push({ achat, ...d });
  }
  const provisionTotal = items.filter((d) => d.estCollecte).reduce((sum, d) => sum + d.provision, 0);
  const sortiesExceptionnellesTotal = items
    .filter((d) => d.estEcheance && !d.achat.achete)
    .reduce((sum, d) => sum + d.montantDu, 0);
  const montantDuTotalToutesPhases = items.reduce((sum, d) => sum + d.montantDu, 0);
  return { items, provisionTotal, sortiesExceptionnellesTotal, montantDuTotalToutesPhases };
}

/**
 * Réserve actuellement accumulée pour une charge annuelle à un mois donné :
 * la part déjà mise de côté par le lissage mensuel pour la prochaine
 * échéance, distincte de l'argent librement disponible dans le solde. Remise
 * à 0 au mois d'échéance (le montant plein est alors assumé réglé, voir
 * `detailUneChargeAnnuelleMois`) ou dès que la charge est marquée payée pour
 * ce cycle (voir `dejaPayeeCeCycle`), puis reconstituée mois après mois pour
 * le cycle suivant.
 */
function reserveChargeAnnuelle(charge: ChargeAnnuelle, annee: number, mois: number, from: Date): number {
  if (dejaPayeeCeCycle(charge, annee, mois)) return 0;
  const { provision, estEcheance } = detailUneChargeAnnuelleMois(charge, annee, mois, from);
  if (estEcheance) return 0;

  const moisEcheance0 = charge.moisEcheance - 1;
  const cibleAbs = moisAbs(annee, mois);
  const echeanceMemeAnneeAbs = moisAbs(annee, moisEcheance0);
  const derniereEcheanceAbs =
    cibleAbs >= echeanceMemeAnneeAbs ? echeanceMemeAnneeAbs : moisAbs(annee - 1, moisEcheance0);
  const prochaineEcheanceAbs = derniereEcheanceAbs + 12;

  // En mode classique, le lissage est perpétuel (voir `detailUneChargeAnnuelleMois`) :
  // pas de point de départ à part la dernière échéance. En mode rattrapage en
  // revanche, le provisionnement ne démarre réellement qu'à son début effectif
  // (ex : `dateDebutProvisionnement` différée) — ne pas compter de réserve avant ça.
  let pointDeDepartAbs = derniereEcheanceAbs;
  if (charge.dejaProvisionne !== null) {
    const debutEffectif = debutProvisionnementEffectif(charge, from);
    const debutAbs = moisAbs(debutEffectif.getFullYear(), debutEffectif.getMonth());
    pointDeDepartAbs = Math.max(pointDeDepartAbs, debutAbs - 1);
  }
  const moisEcoules = Math.max(0, cibleAbs - pointDeDepartAbs);

  // Plafond = le montant réellement dû à la prochaine échéance (gère le
  // restant réduit d'un cycle de rattrapage en cours comme le montant plein
  // d'un cycle classique), pas le montant qui serait accumulé au rythme
  // actuel — évite de dépasser ce qu'il y a réellement à régler.
  const anneeProchaine = Math.floor(prochaineEcheanceAbs / 12);
  const moisProchaine0 = prochaineEcheanceAbs - anneeProchaine * 12;
  const cible = detailUneChargeAnnuelleMois(charge, anneeProchaine, moisProchaine0, from).montantDu;

  return Math.min(provision * moisEcoules, cible);
}

/**
 * Réserve actuellement accumulée pour un achat prévu à un mois donné : le
 * montant déjà saisi comme mis de côté à la création (`dejaProvisionne`) plus
 * les provisions mensuelles cumulées depuis le début du provisionnement
 * jusqu'à ce mois inclus, plafonnée au montant cible. Nulle une fois l'achat
 * marqué acheté (résolu) ou pour un achat « sans provisionnement » (rien
 * n'est mis de côté avant l'échéance, montant plein d'un coup). Nulle aussi
 * au mois d'échéance lui-même, où le montant sort déjà du solde projeté.
 * Comme `detailUnAchatMois`, ne compte plus rien au-delà de l'échéance (éventuellement
 * déjà repoussée à aujourd'hui si en retard) tant que l'achat n'est pas
 * résolu : un achat en retard, non acheté, n'est pas pour autant « déjà mis
 * de côté en entier » pour toujours — au-delà de ce point, on ne sait plus
 * dire ce qu'il en est, donc on arrête de le compter en réserve.
 */
function reserveAchatPrevu(achat: AchatPrevu, annee: number, mois: number, from: Date): number {
  if (achat.achete) return 0;
  if (achat.sansProvisionnement) return 0;
  const restant = Math.max(achat.montantCible - achat.dejaProvisionne, 0);
  if (restant === 0) return 0;

  const debutEffectif = debutProvisionnementEffectif(achat, from);
  const debutAbs = moisAbs(debutEffectif.getFullYear(), debutEffectif.getMonth());
  const cibleAbs = moisAbs(annee, mois);
  if (cibleAbs < debutAbs) return Math.min(achat.dejaProvisionne, achat.montantCible);

  const dueAbs = moisAbs(achat.dateVisee.getFullYear(), achat.dateVisee.getMonth());
  const echeanceAbs = Math.max(dueAbs, debutAbs);
  // Au mois d'échéance, le montant restant est déjà retiré du solde projeté
  // de fin de mois (sortie exceptionnelle, voir `detailUnAchatMois`) : le
  // compter aussi en réserve le ferait déduire deux fois de l'argent libre
  // (même règle que `reserveChargeAnnuelle`). Un achat en retard, non
  // acheté, a son échéance repoussée au mois en cours (début effectif =
  // aujourd'hui) : il sort alors du solde ce mois-ci, pas de la réserve, et
  // ainsi de suite chaque mois tant qu'il n'est pas marqué acheté. Un achat
  // dont la date visée est déplacée plus tard redevient une réserve en
  // cours de constitution jusqu'à sa nouvelle échéance.
  if (cibleAbs >= echeanceAbs) return 0;

  const rate = provisionAchatPrevu(achat, from);
  const moisEcoules = cibleAbs - debutAbs + 1;
  return Math.min(achat.dejaProvisionne + rate * moisEcoules, achat.montantCible);
}

/** Total des réserves (charges annuelles + achats prévus, compte commun) accumulées pour un mois donné — voir `reserveChargeAnnuelle`/`reserveAchatPrevu`. */
export function provisionReserveeCommunMois(
  chargesAnnuelles: ChargeAnnuelle[],
  achatsPrevus: AchatPrevu[],
  annee: number,
  mois: number, // 0-11
  from: Date
): number {
  const reserveCharges = chargesAnnuelles
    .filter((c) => c.compte === "COMMUN")
    .reduce((sum, c) => sum + reserveChargeAnnuelle(c, annee, mois, from), 0);
  const reserveAchats = achatsPrevus
    .filter((a) => a.compte === "COMMUN")
    .reduce((sum, a) => sum + reserveAchatPrevu(a, annee, mois, from), 0);
  return reserveCharges + reserveAchats;
}

/** Total des réserves (charges annuelles + achats prévus perso) accumulées pour une personne, à un mois donné — voir `reserveChargeAnnuelle`/`reserveAchatPrevu`. */
export function provisionReserveePersonneMois(
  chargesAnnuelles: ChargeAnnuelle[],
  achatsPrevus: AchatPrevu[],
  personneId: number,
  annee: number,
  mois: number, // 0-11
  from: Date
): number {
  const reserveCharges = chargesAnnuelles
    .filter((c) => c.compte === "PERSO" && c.personneId === personneId)
    .reduce((sum, c) => sum + reserveChargeAnnuelle(c, annee, mois, from), 0);
  const reserveAchats = achatsPrevus
    .filter((a) => a.compte === "PERSO" && a.personneId === personneId)
    .reduce((sum, a) => sum + reserveAchatPrevu(a, annee, mois, from), 0);
  return reserveCharges + reserveAchats;
}

/**
 * Détail, pour un mois donné (charges annuelles communes et achats prévus),
 * de ce qui est collecté sous forme de provision et de ce qui arrive à
 * échéance (montant plein payé). Voir `projectionCompteCommun` pour la
 * logique complète de collecte/échéance des achats prévus.
 */
export function detailMoisCommun(data: {
  chargesAnnuelles: ChargeAnnuelle[];
  achatsPrevus: AchatPrevu[];
  annee: number;
  mois: number; // 0-11
  from: Date;
}): DetailMoisCommun {
  const { annee, mois, from } = data;
  const chargesAnnuellesCommunes = data.chargesAnnuelles.filter((c) => c.compte === "COMMUN");

  const chargesAnnuelles: DetailChargeAnnuelleMois[] = detailChargesAnnuellesMois(
    chargesAnnuellesCommunes,
    annee,
    mois,
    from
  );

  const achatsCommuns = data.achatsPrevus.filter((a) => a.compte === "COMMUN");
  const achats: DetailAchatMois[] = [];
  for (const achat of achatsCommuns) {
    const d = detailUnAchatMois(achat, annee, mois, from);
    if (!d) continue;
    achats.push({ achat, ...d });
  }

  const provisionAnnuellesCommunesTotal = chargesAnnuelles.reduce(
    (sum, d) => sum + d.provision,
    0
  );
  const provisionsAchatsCeMoisTotal = achats
    .filter((d) => d.estCollecte)
    .reduce((sum, d) => sum + d.provision, 0);
  // Montant plein qui sort réellement du compte ce mois-ci, uniquement pour
  // les charges annuelles/achats arrivant à échéance (les provisions
  // mensuelles qui précèdent ne sont PAS comptées ici : elles restent dans le
  // solde jusqu'à l'échéance, comme un vrai virement bancaire). On exclut les
  // charges annuelles déjà marquées « payées » et les achats déjà marqués
  // « achetés » : leur montant a déjà été débité directement du solde au
  // moment du marquage (voir `marquerChargeAnnuellePayee`/
  // `marquerAchatAchete`) — le compter ici aussi le déduirait une seconde
  // fois du solde projeté.
  const sortiesExceptionnellesTotal =
    chargesAnnuelles
      .filter((d) => d.estEcheance && !dejaPayeeCeCycle(d.charge, annee, mois))
      .reduce((sum, d) => sum + d.montantDu, 0) +
    achats
      .filter((d) => d.estEcheance && !d.achat.achete)
      .reduce((sum, d) => sum + d.montantDu, 0);
  const montantDuTotalToutesPhases =
    chargesAnnuelles.reduce((sum, d) => sum + d.montantDu, 0) +
    achats.reduce((sum, d) => sum + d.montantDu, 0);

  return {
    chargesAnnuelles,
    achats,
    provisionAnnuellesCommunesTotal,
    provisionsAchatsCeMoisTotal,
    sortiesExceptionnellesTotal,
    montantDuTotalToutesPhases,
  };
}

/** Besoin mensuel commun détaillé pour un mois précis (voir `detailMoisCommun`). */
export function besoinMensuelPourMois(data: {
  chargesMensuelles: ChargeMensuelle[];
  chargesAnnuelles: ChargeAnnuelle[];
  achatsPrevus: AchatPrevu[];
  annee: number;
  mois: number; // 0-11
  from: Date;
}) {
  const chargesCommunesTotal = chargesMensuellesCommunes(data.chargesMensuelles, data.annee, data.mois);
  const detail = detailMoisCommun(data);
  const besoinMensuel =
    chargesCommunesTotal + detail.provisionAnnuellesCommunesTotal + detail.provisionsAchatsCeMoisTotal;
  return { chargesCommunesTotal, detail, besoinMensuel };
}

export type MoisProjection = {
  cle: string; // "2026-08"
  label: string; // "août 2026"
  entrees: number;
  sortiesRecurrentes: number;
  /** Provision lissée des charges annuelles communes ce mois-ci — déduite chaque mois de `resultatMois`, mais PAS de `solde` (voir `sortiesExceptionnelles`). */
  provisionsChargesAnnuelles: number;
  /** Montant plein des charges annuelles et achats prévus arrivant à échéance ce mois-ci (0 la plupart du temps) — déduit de `solde`, PAS de `resultatMois` (qui utilise la provision lissée à la place). */
  sortiesExceptionnelles: number;
  /** Dépenses du quotidien réellement saisies ce mois-ci (0 pour un mois sans suivi : rien à réconcilier pour du réel non survenu). */
  depensesQuotidiennes: number;
  /** Solde cumulé projeté du compte commun : trésorerie réelle, qui n'encaisse le montant plein d'une charge annuelle/d'un achat prévu qu'à son mois d'échéance (jamais de prorata déduit avant). */
  solde: number;
  /** Solde en tout début de mois : solde de fin du mois précédent + entrées de ce mois-ci (virements reçus, encaissés le 1er) — avant toute charge/sortie de ce mois. `solde` (fin de mois) = `soldeDebutMois` − charges/sorties de ce mois, sans réencaisser d'entrées. */
  soldeDebutMois: number;
  /** Effet « lissé » de ce mois sur le budget (entrées − charges mensuelles − provisions des charges annuelles et achats prévus) : indicateur de santé budgétaire mensuel, constant d'un mois à l'autre, indépendant des échéances ponctuelles. Ne correspond PAS au delta de `solde` d'un mois sur l'autre — voir `sortiesExceptionnelles`. */
  resultatMois: number;
  /**
   * Total lissé déduit pour obtenir `resultatMois` : TOUTES les charges
   * mensuelles au montant de référence (indépendant du cochage, y compris
   * pour le mois en cours) + provisions charges annuelles/achats prévus. Seule
   * exception : le budget « dépenses du quotidien » du commun, dont la
   * référence est remplacée par le réel dès qu'il la dépasse (jamais à la
   * baisse) — le réel final du mois s'y substitue donc naturellement une
   * fois le mois terminé et le budget dépassé. À ne PAS confondre avec
   * `entrees − resultatMois` : pour le mois en cours suivi, `entrees` affiche
   * le virement réel déjà reçu (informatif), qui n'est pas ce qui alimente
   * `resultatMois` (le solde de départ en tient déjà compte) — cette
   * soustraction gonflerait artificiellement les sorties du montant déjà
   * reçu.
   */
  sorties: number;
  /** Montant à ajouter aux entrées de ce mois pour que le solde cumulé ne soit pas négatif à ce stade. */
  supplementPourZero: number;
};

/** Résumé de ce qui a réellement été suivi (coché/saisi) pour un mois. */
export type SuiviMoisResume = {
  /** Somme des charges mensuelles communes cochées payées ce mois-là. */
  chargesMensuellesPayeesTotal: number;
  /** Somme des virements réellement transférés par les personnes ce mois-là. */
  virementsRecusTotal: number;
  /** Somme des dépenses du quotidien saisies pour le compte commun ce mois-là (toujours réel, informatif). */
  depensesQuotidiennesTotal: number;
  /** Vrai si une charge « budget dépenses du quotidien » existe pour le compte commun : dans ce cas, `depensesQuotidiennesTotal` est déjà pris en compte via `chargesMensuellesPayeesTotal`/`chargesRestantACePayer`, et ne doit pas être soustrait une seconde fois. */
  depensesQuotidiennesAbsorbees: boolean;
};

/**
 * Projection du solde du compte commun mois par mois sur `nbMois` mois.
 *
 * Chaque mois calcule DEUX vues distinctes, qui divergent volontairement dès
 * qu'une charge annuelle ou un achat prévu est en jeu :
 * - `resultatMois` : vue budget lissée. Les charges annuelles et achats
 *   prévus y pèsent chaque mois pour leur provision (1/12e, ou montant
 *   restant / mois restants) — un indicateur stable de la santé du budget
 *   mensuel, sans à-coup à l'échéance.
 * - `solde` (cumulé) : vue trésorerie réelle. Les provisions ne sont PAS
 *   déduites du solde : l'argent reste sur le compte jusqu'à l'échéance,
 *   où le montant plein restant est alors débité d'un coup (visible dans
 *   « dépenses exceptionnelles »). Si la date visée tombe ce mois-ci ou est
 *   déjà dépassée, le montant plein est débité ce même mois.
 *
 * Le besoin mensuel (virements collectés) est recalculé pour chaque mois.
 * Les charges mensuelles communes sont constantes (charges récurrentes).
 *
 * Le solde de départ est le solde actuel renseigné dans les paramètres
 * (`soldeInitial`, 0 par défaut) — pour le mois en cours, c'est déjà le solde
 * réel du jour, net des virements reçus et charges payées.
 *
 * Pour un mois dont on a un suivi réel (`suiviParMois`, indexé par clé
 * "YYYY-MM"), le mois en cours (le premier de la série) ne suppose PAS de
 * virement supplémentaire à venir : `soldeInitial` est déjà le solde réel du
 * jour, net de ce qui a été reçu — seul ce qui reste réellement à payer
 * (charges non cochées + charges annuelles/achats non cochés, quelle que soit
 * leur phase) est déduit du solde. Pour un mois futur suivi (ex. un virement
 * saisi à l'avance via « Déjà transféré »), le montant réellement transféré
 * est en revanche bien ajouté, faute de solde réel constaté à cette date.
 *
 * Les mois sans suivi (typiquement les mois futurs) supposent que des
 * virements sont effectués, mais PAS forcément le besoin théorique complet :
 * le virement mensuel habituel renseigné par personne
 * (`virementMensuelHabituelTotal`), sinon le besoin théorique complet — qui
 * reste affiché ailleurs comme cible du budget, mais qui ne reflète pas
 * forcément ce qui est vraiment transféré.
 *
 * Chaque mois expose aussi `supplementPourZero` : le montant à ajouter aux
 * entrées de ce mois pour que le solde cumulé, à ce stade, ne soit pas
 * négatif.
 */
export function projectionCompteCommun(data: {
  chargesMensuelles: ChargeMensuelle[];
  chargesAnnuelles: ChargeAnnuelle[];
  achatsPrevus: AchatPrevu[];
  soldeInitial?: number;
  suiviParMois?: Map<string, SuiviMoisResume>;
  virementMensuelHabituelTotal?: number;
  historiqueParCharge?: Map<number, HistoriqueMontantCharge[]>;
  nbMois?: number;
  from?: Date;
}): MoisProjection[] {
  const nbMois = data.nbMois ?? 12;
  const from = data.from ?? new Date();
  const historiqueParCharge = data.historiqueParCharge ?? new Map();

  let solde = data.soldeInitial ?? 0;
  const result: MoisProjection[] = [];

  for (let i = 0; i < nbMois; i++) {
    const date = new Date(from.getFullYear(), from.getMonth() + i, 1);
    const mois = date.getMonth();
    const annee = date.getFullYear();
    const cle = moisCle(annee, mois);
    const chargesMensuellesResolues = withMontantResolu(data.chargesMensuelles, historiqueParCharge, annee, mois);

    const { chargesCommunesTotal, detail, besoinMensuel } = besoinMensuelPourMois({
      chargesMensuelles: chargesMensuellesResolues,
      chargesAnnuelles: data.chargesAnnuelles,
      achatsPrevus: data.achatsPrevus,
      annee,
      mois,
      from,
    });

    const suivi = data.suiviParMois?.get(cle);

    // Le « payé par défaut » (un virement suffisant a toujours lieu, donc une
    // charge non décochée est considérée payée) ne s'applique qu'au mois en
    // cours (i === 0), qui est réellement en train de se dérouler. Pour un
    // mois futur, même avec du suivi (ex. un virement saisi à l'avance via
    // « Déjà transféré »), rien n'a encore été concrètement payé : les
    // charges mensuelles restent donc déduites en entier dans la projection,
    // indépendamment de leur affichage « coché/payé » par défaut sur la page
    // du mois (qui reste, lui, inchangé — voir `getSuiviParMoisMap`).
    const chargesRestantACePayer =
      suivi && i === 0
        ? Math.max(chargesCommunesTotal - suivi.chargesMensuellesPayeesTotal, 0)
        : chargesCommunesTotal;

    // Référence du budget « dépenses du quotidien » du commun (0 si aucune
    // charge de ce type n'existe) — sert à calculer l'éventuel dépassement
    // ci-dessous, seul cas où les dépenses réelles ajustent `sorties`.
    const referenceDepensesQuotidiennesCommun = chargesMensuellesResolues
      .filter((c) => c.budgetDepensesQuotidiennes && c.compte === "COMMUN")
      .reduce((sum, c) => sum + c.montant, 0);
    // Sorties (et donc résultat du mois) : vue budget lissée qui suppose
    // TOUTES les charges mensuelles payées au montant de référence (comme les
    // charges annuelles/achats prévus, indépendamment du cochage) — y
    // compris pour le mois en cours. Seule exception : le budget « dépenses
    // du quotidien », dont la référence est ajustée à la hausse dès que le
    // réel saisi la dépasse (jamais à la baisse) ; le réel final du mois
    // remplace donc naturellement la référence une fois le mois terminé et
    // le budget dépassé.
    const depensesQuotidiennesExcedent = suivi
      ? Math.max(0, suivi.depensesQuotidiennesTotal - referenceDepensesQuotidiennesCommun)
      : 0;
    const sorties =
      chargesCommunesTotal +
      depensesQuotidiennesExcedent +
      detail.provisionAnnuellesCommunesTotal +
      detail.provisionsAchatsCeMoisTotal;

    if (suivi) {
      // Le « solde actuel » (Paramètres) est un relevé live : quel que soit
      // le moment où il a été mis à jour, il reflète déjà tout ce qui s'est
      // réellement passé jusque-là, y compris une partie ou la totalité des
      // virements « Déjà transféré » de ce mois-ci — impossible de savoir
      // avec certitude laquelle. Pour le mois en cours (i === 0), on ne les
      // rajoute donc pas une seconde fois. Pour un mois futur (i > 0) en
      // revanche, il n'existe pas encore de solde réel constaté : un
      // virement renseigné via « Déjà transféré » doit bien être ajouté,
      // sans quoi le solde projeté ne bougerait jamais malgré la saisie. Les
      // charges mensuelles restantes, elles, n'utilisent le suivi réel (payé
      // par défaut) que pour le mois en cours — voir `chargesRestantACePayer`
      // ci-dessus.
      const entreesASupposer = i === 0 ? 0 : suivi.virementsRecusTotal;
      // Résultat du mois : vue budget lissée (voir `sorties` ci-dessus) — se
      // compare au virement réellement reçu ce mois-ci (`suivi.virementsRecusTotal`,
      // identique à `entreesASupposer` ci-dessus, aussi affiché dans `entrees`).
      const resultatMois = suivi.virementsRecusTotal - sorties;
      // Solde cumulé : vue trésorerie réelle — utilise, elle, le suivi réel
      // (charges restantes après cochage) et ne déduit le montant plein
      // d'une charge annuelle/d'un achat prévu qu'à son mois d'échéance (voir
      // `sortiesExceptionnellesTotal`), jamais la provision les mois d'avant.
      // Si une charge budget « dépenses du quotidien » existe pour le commun,
      // le réel est déjà pris en compte via chargesRestantACePayer (voir
      // montantPayeEffectifCharge) — ne pas le soustraire une seconde fois.
      const depensesQuotidiennesASoustraire = suivi.depensesQuotidiennesAbsorbees
        ? 0
        : suivi.depensesQuotidiennesTotal;
      // Solde en début de mois : solde de fin du mois précédent + entrées de
      // ce mois-ci (encaissées le 1er) — voir `MoisProjection.soldeDebutMois`.
      const soldeDebutMois = solde + entreesASupposer;
      solde = soldeDebutMois - chargesRestantACePayer - detail.sortiesExceptionnellesTotal - depensesQuotidiennesASoustraire;

      result.push({
        cle,
        label: moisLabel(annee, mois),
        entrees: suivi.virementsRecusTotal,
        sortiesRecurrentes: chargesRestantACePayer,
        provisionsChargesAnnuelles: detail.provisionAnnuellesCommunesTotal,
        sortiesExceptionnelles: detail.sortiesExceptionnellesTotal,
        depensesQuotidiennes: suivi.depensesQuotidiennesTotal,
        solde,
        soldeDebutMois,
        resultatMois,
        sorties,
        supplementPourZero: Math.max(0, -solde),
      });
    } else {
      // Pas de suivi (mois futur) : le virement mensuel habituel, sinon le
      // besoin théorique complet. Les charges et provisions, elles, restent
      // le montant théorique complet (elles vont bien avoir lieu).
      const entrees =
        data.virementMensuelHabituelTotal && data.virementMensuelHabituelTotal > 0
          ? data.virementMensuelHabituelTotal
          : besoinMensuel;
      const resultatMois = entrees - sorties;
      const soldeDebutMois = solde + entrees;
      solde = soldeDebutMois - chargesRestantACePayer - detail.sortiesExceptionnellesTotal;

      result.push({
        cle,
        label: moisLabel(annee, mois),
        entrees,
        sortiesRecurrentes: chargesRestantACePayer,
        provisionsChargesAnnuelles: detail.provisionAnnuellesCommunesTotal,
        sortiesExceptionnelles: detail.sortiesExceptionnellesTotal,
        depensesQuotidiennes: 0,
        solde,
        soldeDebutMois,
        resultatMois,
        sorties,
        supplementPourZero: Math.max(0, -solde),
      });
    }
  }

  return result;
}

/** Données brutes de suivi (paiements, virements) d'un mois qui a du suivi réel. */
export type MoisSuiviBrut = {
  paiements: Map<string, boolean>;
  montants: Map<string, number>;
  virements: Map<number, number>; // personneId -> montant viré vers le commun
  virementsEpargne: Map<number, number>; // personneId -> montant viré vers l'épargne
  depensesQuotidiennes: Map<number, number>; // personneId -> total des dépenses du quotidien saisies
};

export type MoisProjectionPersonne = {
  cle: string;
  label: string;
  revenus: number;
  chargesPerso: number;
  /** Montant théorique du mois pour les charges annuelles perso (toujours théorique, y compris le mois en cours — voir `sortiesExceptionnelles` côté commun). */
  chargesAnnuellesPerso: number;
  /** Montant théorique du mois pour les achats prévus perso (même logique que `chargesAnnuellesPerso`). */
  achatsPrevusPerso: number;
  /** Dépenses du quotidien réellement saisies pour cette personne ce mois-ci (0 pour un mois sans suivi). */
  depensesQuotidiennesPerso: number;
  virementCommun: number;
  virementEpargne: number;
  soldePerso: number;
  soldeEpargne: number;
};

/**
 * Projection des comptes perso et épargne de chaque personne, mois par mois.
 *
 * Le solde de départ (`personne.soldePerso`/`soldeEpargne`) est le solde réel
 * du jour, déjà net des revenus reçus, charges payées et virements envoyés ce
 * mois-ci (même logique que `parametres.soldeCommun`). Pour un mois qui a du
 * suivi réel (`suiviBrutParMois`), on ne déduit donc du solde que ce qui
 * reste réellement à régler (charges perso non payées) — les charges perso
 * et charges annuelles perso sont considérées payées par défaut au montant
 * de référence/dû (comme pour les charges mensuelles communes), sauf
 * décochage explicite ou montant variable saisi. Le virement vers le commun
 * et le virement vers l'épargne ont leur propre suivi en direct dès leur
 * saisie (voir `setVirementMois`/`setVirementEpargneMois`, qui répercutent
 * aussitôt l'écart sur les soldes) — `soldePerso`/`soldeEpargne` en tiennent
 * donc déjà compte pour le mois en cours, comme les revenus/charges déjà
 * réglés ; les colonnes affichées ici (revenus, charges perso, virements)
 * restent informatives sur ce qui s'est réellement passé ce mois-ci, 0 par
 * défaut pour un virement d'un mois futur sans saisie explicite (voir
 * `virementXASupposer` ci-dessous, qui ne redéduit jamais rien pour le mois
 * en cours, déjà reflété dans le solde réel actuel).
 *
 * Pour un mois sans suivi (futur), tout est théorique et vient s'ajouter au
 * solde du mois précédent : charges perso au montant de référence, virement
 * vers le commun au virement mensuel habituel de la personne (sinon sa part
 * théorique du besoin commun), virement vers l'épargne au virement épargne
 * mensuel habituel de la personne.
 */
export function projectionPersonnes(data: {
  personnes: Personne[];
  revenus: Revenu[];
  chargesMensuelles: ChargeMensuelle[];
  chargesAnnuelles: ChargeAnnuelle[];
  achatsPrevus: AchatPrevu[];
  cleRepartition: CleRepartition;
  suiviBrutParMois?: Map<string, MoisSuiviBrut>;
  revenuAnnuelOverrides?: Map<string, number>;
  revenuMensuelOverrides?: Map<string, number>;
  historiqueParCharge?: Map<number, HistoriqueMontantCharge[]>;
  from?: Date;
  nbMois?: number;
}): Map<number, MoisProjectionPersonne[]> {
  const nbMois = data.nbMois ?? 12;
  const from = data.from ?? new Date();
  const historiqueParCharge = data.historiqueParCharge ?? new Map();

  const soldes = new Map<number, { perso: number; epargne: number }>();
  const result = new Map<number, MoisProjectionPersonne[]>();
  for (const p of data.personnes) {
    soldes.set(p.id, { perso: p.soldePerso, epargne: p.soldeEpargne });
    result.set(p.id, []);
  }

  for (let i = 0; i < nbMois; i++) {
    const date = new Date(from.getFullYear(), from.getMonth() + i, 1);
    const annee = date.getFullYear();
    const mois = date.getMonth();
    const cle = moisCle(annee, mois);
    const label = moisLabel(annee, mois);
    const chargesMensuellesResolues = withMontantResolu(data.chargesMensuelles, historiqueParCharge, annee, mois);

    const suivi = data.suiviBrutParMois?.get(cle);

    let virementsTheoriqueParPersonne: Map<number, number> | null = null;
    if (!suivi) {
      const { besoinMensuel } = besoinMensuelPourMois({
        chargesMensuelles: chargesMensuellesResolues,
        chargesAnnuelles: data.chargesAnnuelles,
        achatsPrevus: data.achatsPrevus,
        annee,
        mois,
        from,
      });
      virementsTheoriqueParPersonne = virementsParPersonne(
        data.personnes,
        data.revenus,
        besoinMensuel,
        data.cleRepartition
      );
    }

    for (const personne of data.personnes) {
      const revenusDuMois = revenusDuMoisTotal(
        data.revenus,
        personne.id,
        annee,
        mois,
        data.revenuAnnuelOverrides ?? new Map(),
        data.revenuMensuelOverrides ?? new Map()
      );

      const chargesPersoListe = chargesMensuellesResolues.filter(
        (c) =>
          c.compte === "PERSO" && c.personneId === personne.id && estChargeMensuelleActive(c, annee, mois)
      );
      const detailAnnuellesPerso = detailChargesAnnuellesPersonneMois({
        chargesAnnuelles: data.chargesAnnuelles,
        personneId: personne.id,
        annee,
        mois,
        from,
      });
      // Toujours le montant théorique du mois, quel que soit le suivi (comme
      // « Dépenses exceptionnelles » côté commun) : un repère de
      // planification, indépendant de ce qui est coché comme réglé. Sert
      // uniquement à l'affichage (ex. barre « Où va le budget mensuel ») —
      // voir `chargesAnnuellesPersoRestantesTheorique` ci-dessous pour la
      // valeur utilisée dans le calcul du solde projeté.
      const chargesAnnuellesPerso = detailAnnuellesPerso.montantDuTotalToutesPhases;
      // Variante utilisée pour décrémenter le solde projeté (mois futurs,
      // i > 0) : exclut les charges déjà réellement débitées ce cycle via
      // « Marquer comme payé » (voir `dejaPayeeCeCycle`), sans quoi un
      // paiement anticipé serait débité une seconde fois par la projection
      // au mois d'échéance théorique, en plus du débit direct déjà effectué
      // par `marquerChargeAnnuellePayee` au moment du clic.
      const chargesAnnuellesPersoRestantesTheorique = detailAnnuellesPerso.items.reduce(
        (sum, d) => sum + (dejaPayeeCeCycle(d.charge, annee, mois) ? 0 : d.montantDu),
        0
      );

      const detailAchatsPerso = detailAchatsPrevusPersonneMois({
        achatsPrevus: data.achatsPrevus,
        personneId: personne.id,
        annee,
        mois,
        from,
      });
      // Comme pour les achats prévus communs (voir `detailMoisCommun`), la
      // case « Payé » d'un achat perso reste purement indicative : seul le
      // marquage « acheté » (`marquerAchatAchete`) débite réellement le solde
      // perso, en direct — on utilise donc `sortiesExceptionnellesTotal`
      // (qui exclut déjà les achats marqués achetés, débités une fois pour
      // toutes à ce moment-là) plutôt qu'un calcul dépendant de la case à
      // cocher, pour éviter tout double comptage.
      const achatsPrevusPerso = detailAchatsPerso.montantDuTotalToutesPhases;

      const depensesQuotidiennesPerso = suivi?.depensesQuotidiennes.get(personne.id) ?? 0;

      let chargesPerso: number;
      let virementCommun: number;
      let virementEpargne: number;
      let deltaPerso: number;
      let deltaEpargne: number;

      if (suivi) {
        // Le « payé/déjà reçu par défaut » (soldePerso/soldeEpargne déjà nets
        // des revenus reçus, charges payées et virements envoyés) ne
        // s'applique qu'au mois en cours (i === 0), qui est réellement en
        // train de se dérouler — même logique que `chargesRestantACePayer`
        // côté compte commun. Pour un mois futur, même avec du suivi (ex. un
        // virement saisi à l'avance), rien n'a encore eu lieu : revenus et
        // charges/virements sont donc comptés en entier ci-dessous (voir
        // `revenusASupposer`/`chargesPersoASupposer`/etc.).
        chargesPerso = chargesPersoListe.reduce(
          (sum, c) =>
            sum +
            montantEffectifPaye(
              suivi.paiements,
              suivi.montants,
              clePaiement("CHARGE_MENSUELLE", c.id),
              c.montant,
              chargeDejaDebiteeParDefaut(c, annee, mois, from)
            ),
          0
        );
        // depensesDejaDeduitesDuSolde = true : les dépenses du quotidien de
        // cette personne décrémentent déjà `personne.soldePerso` en direct à
        // la saisie (même logique que le compte commun, voir
        // `ajouterDepenseQuotidienne`) — ne réserver que le reliquat du
        // budget de référence.
        const chargesPersoRestantes = chargesPersoListe.reduce(
          (sum, c) =>
            sum +
            Math.max(
              c.montant -
                montantPayeEffectifCharge(
                  c,
                  suivi.paiements,
                  suivi.montants,
                  depensesQuotidiennesPerso,
                  true,
                  chargeDejaDebiteeParDefaut(c, annee, mois, from)
                ),
              0
            ),
          0
        );
        // Si une charge budget existe pour cette personne, le réel est déjà
        // pris en compte via chargesPersoRestantes ci-dessus — ne pas le
        // soustraire une seconde fois dans deltaPerso.
        const depensesQuotidiennesPersoAbsorbees = chargesPersoListe.some((c) => c.budgetDepensesQuotidiennes);
        // Un virement non explicitement saisi ce mois-ci est supposé au
        // montant habituel de la personne — même repli que le compte commun
        // (`getSuiviParMoisMap`) et que l'affichage de la page du mois. Un
        // mois peut basculer en mode suivi à cause d'une seule autre saisie
        // (ex. un virement épargne renseigné à l'avance) : sans ce repli, le
        // virement vers le commun tombait à 0 pour ce mois-là côté perso
        // alors que le commun le comptait bien comme reçu — l'argent était
        // compté deux fois et le solde perso projeté bondissait de +1 500 €.
        virementCommun = suivi.virements.get(personne.id) ?? personne.virementMensuelHabituel;
        virementEpargne =
          suivi.virementsEpargne.get(personne.id) ?? personne.virementEpargneMensuelHabituel;

        // Comme les charges mensuelles, les charges annuelles perso sont
        // considérées payées par défaut au montant dû, sauf décochage
        // explicite — sauf si déjà réellement débitée ce mois-ci via
        // « Marquer comme payé » (voir `dejaPayeeCeCycle`), auquel cas ne pas
        // la déduire une seconde fois du solde perso.
        const chargesAnnuellesPersoRestantes = detailAnnuellesPerso.items.reduce(
          (sum, d) =>
            sum +
            (dejaPayeeCeCycle(d.charge, annee, mois)
              ? 0
              : Math.max(
                  d.montantDu -
                    montantEffectifPaye(
                      suivi.paiements,
                      suivi.montants,
                      clePaiement("CHARGE_ANNUELLE", d.charge.id),
                      d.montantDu
                    ),
                  0
                )),
          0
        );

        const revenusASupposer = i === 0 ? 0 : revenusDuMois;
        // Comme les revenus, un virement vers le commun déjà saisi ce mois-ci
        // n'est pas re-déduit pour le mois en cours (déjà reflété dans le
        // solde perso réel actuel) — mais doit bien l'être pour un mois futur.
        const virementCommunASupposer = i === 0 ? 0 : virementCommun;
        const chargesPersoASupposer =
          i === 0 ? chargesPersoRestantes : chargesPersoListe.reduce((sum, c) => sum + c.montant, 0);
        const virementEpargneASupposer = i === 0 ? 0 : virementEpargne;
        const chargesAnnuellesPersoASupposer =
          i === 0 ? chargesAnnuellesPersoRestantes : chargesAnnuellesPersoRestantesTheorique;
        // Voir le commentaire sur `achatsPrevusPerso` ci-dessus : contrairement
        // aux charges annuelles perso, on ne dépend pas de la case à cocher
        // pour le mois en cours, seulement du marquage « acheté » (déjà
        // exclu de `sortiesExceptionnellesTotal`), pour rester cohérent avec
        // le débit réel effectué par `marquerAchatAchete`.
        const achatsPrevusPersoASupposer =
          i === 0 ? detailAchatsPerso.sortiesExceptionnellesTotal : achatsPrevusPerso;
        const depensesQuotidiennesASoustraire =
          i === 0 && !depensesQuotidiennesPersoAbsorbees ? depensesQuotidiennesPerso : 0;

        deltaPerso =
          revenusASupposer -
          chargesPersoASupposer -
          virementCommunASupposer -
          virementEpargneASupposer -
          chargesAnnuellesPersoASupposer -
          achatsPrevusPersoASupposer -
          depensesQuotidiennesASoustraire;
        deltaEpargne = virementEpargneASupposer;
      } else {
        chargesPerso = chargesPersoListe.reduce((sum, c) => sum + c.montant, 0);
        virementCommun =
          personne.virementMensuelHabituel > 0
            ? personne.virementMensuelHabituel
            : (virementsTheoriqueParPersonne?.get(personne.id) ?? 0);
        virementEpargne = personne.virementEpargneMensuelHabituel;

        deltaPerso =
          revenusDuMois -
          chargesPerso -
          virementCommun -
          virementEpargne -
          chargesAnnuellesPersoRestantesTheorique -
          achatsPrevusPerso;
        deltaEpargne = virementEpargne;
      }

      const soldeCourant = soldes.get(personne.id)!;
      soldeCourant.perso += deltaPerso;
      soldeCourant.epargne += deltaEpargne;

      result.get(personne.id)!.push({
        cle,
        label,
        revenus: revenusDuMois,
        chargesPerso,
        chargesAnnuellesPerso,
        achatsPrevusPerso,
        depensesQuotidiennesPerso,
        virementCommun,
        virementEpargne,
        soldePerso: soldeCourant.perso,
        soldeEpargne: soldeCourant.epargne,
      });
    }
  }

  return result;
}

/**
 * Répartit une liste de montants par nom de catégorie (via `categorieNomParId`),
 * triée par montant décroissant — "Sans catégorie" pour un `categorieId`
 * absent ou inconnu. Ignore les montants à 0 ou négatifs. Partagé entre le
 * panneau "Où va le budget" du tableau de bord et celui de la page du mois.
 */
export function calculerRepartitionCategories(
  items: { categorieId: number | null; montant: number }[],
  categorieNomParId: Map<number, string>
): { nom: string; montant: number }[] {
  const totaux = new Map<string, number>();
  for (const item of items) {
    if (item.montant <= 0) continue;
    const nom = (item.categorieId && categorieNomParId.get(item.categorieId)) || "Sans catégorie";
    totaux.set(nom, (totaux.get(nom) ?? 0) + item.montant);
  }
  return Array.from(totaux, ([nom, montant]) => ({ nom, montant })).sort((a, b) => b.montant - a.montant);
}
