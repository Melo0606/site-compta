// Utilitaires de manipulation de mois abstraits, partagés entre le tableau de
// bord et les statistiques (sélecteur Depuis/Jusqu'à).

export const MOIS_LABELS_COURTS = [
  "Janvier",
  "Février",
  "Mars",
  "Avril",
  "Mai",
  "Juin",
  "Juillet",
  "Août",
  "Septembre",
  "Octobre",
  "Novembre",
  "Décembre",
];

/** Mois abstrait en un entier comparable : `annee * 12 + mois0` (mois0 : 0-11). */
export function moisEnAbs(annee: number, mois0: number): number {
  return annee * 12 + mois0;
}

/** Parse une paire de champs mois (0-11)/année en valeur absolue, ou `null` si absents/invalides. */
export function parseMoisAbs(mois0Str: string | undefined, anneeStr: string | undefined): number | null {
  const mois0 = Number(mois0Str);
  const annee = Number(anneeStr);
  if (!Number.isInteger(mois0) || mois0 < 0 || mois0 > 11 || !Number.isInteger(annee)) return null;
  return moisEnAbs(annee, mois0);
}
