import Database from "better-sqlite3";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Verrou de la base partagée via un dossier synchronisé (Google Drive,
 * OneDrive…) entre plusieurs postes. Un tel dossier synchronise des
 * fichiers, pas une base : si deux postes ont l'appli ouverte en même
 * temps, chacun écrit dans sa propre copie de compta.db et la
 * synchronisation en garde une seule (les saisies de l'autre sont perdues ou
 * reléguées dans une copie « en conflit »). Ce fichier, à côté de
 * compta.db, indique quel poste a la base ouverte, et à quelle
 * « génération » elle était à sa dernière fermeture propre.
 *
 * La génération est aussi écrite dans la base elle-même (`PRAGMA
 * user_version`, inutilisé par Prisma), incrémentée à chaque fermeture
 * propre : si le verrou reçu d'un autre poste annonce une génération plus
 * récente que celle de la base locale, c'est que la synchronisation n'a pas
 * encore livré la dernière version de compta.db — l'ouvrir ferait repartir
 * d'une version périmée et écraserait les saisies de l'autre poste.
 *
 * Tout passe par la synchronisation, avec son délai : ce verrou réduit le
 * risque, il ne le supprime pas (deux ouvertures à quelques secondes
 * d'intervalle sur deux postes peuvent encore se croiser — la surveillance
 * périodique, voir `main.ts`, le détecte alors après coup).
 */
export type Verrou = {
  etat: "ouverte" | "fermee";
  /** Nom du poste (`os.hostname()`). */
  poste: string;
  /** Compte Windows sur ce poste. */
  utilisateur: string;
  /** Identifiant unique de la session de l'appli qui a écrit ce verrou. */
  session: string;
  /** Date d'ouverture de la session (ISO). */
  ouverteLe: string;
  /** Dernière fois que la session a signalé son activité (ISO). */
  derniereActivite: string;
  /** `user_version` de compta.db à l'écriture du verrou (à la fermeture propre pour l'état « fermee »). */
  generation: number;
};

export const NOM_FICHIER_VERROU = "compta.verrou.json";

export function cheminVerrou(dossierDonnees: string): string {
  return join(dossierDonnees, NOM_FICHIER_VERROU);
}

/** Verrou présent dans le dossier, ou `null` s'il est absent ou illisible. */
export function lireVerrou(dossierDonnees: string): Verrou | null {
  const chemin = cheminVerrou(dossierDonnees);
  if (!existsSync(chemin)) return null;
  try {
    const verrou = JSON.parse(readFileSync(chemin, "utf-8")) as Partial<Verrou>;
    if (verrou.etat !== "ouverte" && verrou.etat !== "fermee") return null;
    if (typeof verrou.session !== "string" || typeof verrou.poste !== "string") return null;
    return {
      etat: verrou.etat,
      poste: verrou.poste,
      utilisateur: verrou.utilisateur ?? "",
      session: verrou.session,
      ouverteLe: verrou.ouverteLe ?? "",
      derniereActivite: verrou.derniereActivite ?? verrou.ouverteLe ?? "",
      generation: typeof verrou.generation === "number" ? verrou.generation : 0,
    };
  } catch {
    return null;
  }
}

export function ecrireVerrou(dossierDonnees: string, verrou: Verrou): void {
  writeFileSync(cheminVerrou(dossierDonnees), JSON.stringify(verrou, null, 2), "utf-8");
}

/** Génération actuelle de la base (`PRAGMA user_version`), 0 si elle n'existe pas encore, `null` si illisible. */
export function lireGeneration(dbFilePath: string): number | null {
  if (!existsSync(dbFilePath)) return 0;
  try {
    // Lecture seule : sur un poste pas encore synchronisé, ne surtout pas
    // toucher à la copie locale (Google Drive y verrait une modification et
    // créerait un conflit avec la version à jour en cours de livraison).
    const db = new Database(dbFilePath, { fileMustExist: true, readonly: true });
    try {
      return Number(db.pragma("user_version", { simple: true }));
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}

/** Incrémente la génération de la base et retourne la nouvelle valeur. À appeler une fois le serveur arrêté. */
export function incrementerGeneration(dbFilePath: string): number {
  const db = new Database(dbFilePath, { fileMustExist: true });
  try {
    const suivante = Number(db.pragma("user_version", { simple: true })) + 1;
    db.pragma(`user_version = ${suivante}`);
    return suivante;
  } finally {
    db.close();
  }
}

/** « 06/11/2026 16:42 (il y a 5 min) » */
export function formaterDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "date inconnue";
  const texte = date.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  let relatif: string;
  if (minutes < 1) relatif = "à l'instant";
  else if (minutes < 60) relatif = `il y a ${minutes} min`;
  else if (minutes < 48 * 60) relatif = `il y a ${Math.round(minutes / 60)} h`;
  else relatif = `il y a ${Math.round(minutes / 1440)} jours`;
  return `${texte} (${relatif})`;
}
