import { net } from "electron";
import { createHash } from "node:crypto";
import { createWriteStream, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

/**
 * Recherche et téléchargement des nouvelles versions publiées dans les
 * releases GitHub du dépôt (lues sans authentification : le dépôt doit être
 * public — tant qu'il est privé, l'API répond 404 et aucune mise à jour
 * n'est proposée). Pas d'electron-updater : le processus principal n'embarque
 * que quelques modules listés dans `build.files`, et l'installateur NSIS
 * « one-click » sait déjà s'installer par-dessus la version en place.
 */

export const URL_DERNIERE_RELEASE = "https://api.github.com/repos/Melo0606/site-compta/releases/latest";

export interface Installateur {
  nom: string;
  url: string;
  taille: number;
  /** Empreinte SHA-256 en hexadécimal, si GitHub la fournit. */
  sha256: string | null;
}

export interface MiseAJour {
  version: string;
  notes: string;
  installateur: Installateur;
}

/** Compare deux versions « x.y.z » : négatif si a < b, 0 si égales, positif si a > b. */
export function comparerVersions(a: string, b: string): number {
  const decouper = (v: string) => v.replace(/^v/, "").split("-")[0].split(".").map((n) => Number(n) || 0);
  const pa = decouper(a);
  const pb = decouper(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const ecart = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (ecart !== 0) return ecart;
  }
  return 0;
}

interface ReleaseGitHub {
  tag_name?: string;
  body?: string | null;
  draft?: boolean;
  prerelease?: boolean;
  assets?: { name: string; browser_download_url: string; size: number; digest?: string | null }[];
}

/**
 * Dernière release publiée si elle est plus récente que `versionActuelle`
 * et contient un installateur Windows, sinon `null`. Lève une erreur si
 * GitHub est injoignable ou répond autre chose que 200/404.
 */
export async function chercherMiseAJour(versionActuelle: string, url = URL_DERNIERE_RELEASE): Promise<MiseAJour | null> {
  const reponse = await net.fetch(url, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "ma-comptabilite", "Cache-Control": "no-cache" },
  });
  // 404 : aucune release publiée, ou dépôt privé.
  if (reponse.status === 404) return null;
  if (!reponse.ok) throw new Error(`GitHub a répondu ${reponse.status}.`);

  const release = (await reponse.json()) as ReleaseGitHub;
  if (!release.tag_name || release.draft || release.prerelease) return null;
  if (comparerVersions(release.tag_name, versionActuelle) <= 0) return null;

  const asset = release.assets?.find((a) => /setup.*\.exe$/i.test(a.name));
  if (!asset) return null;
  const empreinte = asset.digest?.startsWith("sha256:") ? asset.digest.slice("sha256:".length).toLowerCase() : null;

  return {
    version: release.tag_name.replace(/^v/, ""),
    notes: release.body ?? "",
    installateur: { nom: asset.name, url: asset.browser_download_url, taille: asset.size, sha256: empreinte },
  };
}

/**
 * Télécharge l'installateur dans `dossier` et vérifie sa taille et son
 * empreinte. Retourne le chemin du fichier ; rien n'est laissé sur le
 * disque en cas d'échec.
 */
export async function telechargerInstallateur(
  installateur: Installateur,
  dossier: string,
  progression?: (fraction: number) => void
): Promise<string> {
  mkdirSync(dossier, { recursive: true });
  const chemin = join(dossier, installateur.nom);
  try {
    const reponse = await net.fetch(installateur.url, { headers: { "User-Agent": "ma-comptabilite" } });
    if (!reponse.ok || !reponse.body) throw new Error(`Téléchargement refusé (${reponse.status}).`);

    const hash = createHash("sha256");
    let recu = 0;
    const compteur = new Transform({
      transform(morceau: Buffer, _encodage, suite) {
        recu += morceau.length;
        hash.update(morceau);
        if (installateur.taille > 0) progression?.(Math.min(1, recu / installateur.taille));
        suite(null, morceau);
      },
    });
    await pipeline(
      Readable.fromWeb(reponse.body as import("node:stream/web").ReadableStream),
      compteur,
      createWriteStream(chemin)
    );

    if (installateur.taille > 0 && recu !== installateur.taille) {
      throw new Error(`Téléchargement incomplet (${recu} octets reçus sur ${installateur.taille}).`);
    }
    if (installateur.sha256 && hash.digest("hex") !== installateur.sha256) {
      throw new Error("Le fichier téléchargé ne correspond pas à celui publié (empreinte différente).");
    }
    return chemin;
  } catch (erreur) {
    rmSync(chemin, { force: true });
    throw erreur;
  }
}

/**
 * Notes de release (Markdown) ramenées à du texte lisible dans une boîte de
 * dialogue native, sans la signature finale et tronquées si trop longues.
 */
export function resumerNotes(notes: string, longueurMax = 900): string {
  const texte = notes
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((ligne) => !/generated with \[claude code\]/i.test(ligne))
    .map((ligne) =>
      ligne
        .replace(/^#{1,6}\s*/, "")
        .replace(/^\s*[-*]\s+/, "• ")
        .replace(/\*\*(.+?)\*\*/g, "$1")
        .replace(/`([^`]+)`/g, "$1")
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    )
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return texte.length > longueurMax ? `${texte.slice(0, longueurMax).trimEnd()}…` : texte;
}
