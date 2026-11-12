import { app, BrowserWindow, Menu, dialog, shell, powerMonitor } from "electron";
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, createWriteStream } from "node:fs";
import { createServer } from "node:net";
import { hostname, userInfo } from "node:os";
import { join } from "node:path";
import { appliquerMigrations } from "./migrate";
import { lireConfig, ecrireConfig } from "./config";
import {
  type Verrou,
  lireVerrou,
  ecrireVerrou,
  lireGeneration,
  incrementerGeneration,
  formaterDate,
} from "./verrou";

// Force la locale de Chromium en français (avant app.whenReady) : sans ça,
// les champs <input type="date"> natifs s'affichent selon la langue du
// système, pas selon le `lang="fr"` de la page — souvent en MM/DD/AAAA sur
// une install Windows en anglais.
app.commandLine.appendSwitch("lang", "fr");

/** Chemin du fichier de log du serveur local, écrasé à chaque démarrage. */
function cheminLogServeur(): string {
  return join(app.getPath("userData"), "server.log");
}

function journaliserCrash(source: string, erreur: unknown): void {
  const message = `[${source}] ${erreur instanceof Error ? erreur.stack ?? erreur.message : String(erreur)}\n`;
  try {
    require("node:fs").appendFileSync(join(app.getPath("userData"), "crash.log"), message);
  } catch {
    // best effort
  }
  dialog.showErrorBox("Erreur fatale", message);
  app.exit(1);
}

process.on("uncaughtException", (erreur) => journaliserCrash("uncaughtException", erreur));
process.on("unhandledRejection", (erreur) => journaliserCrash("unhandledRejection", erreur));

let fenetrePrincipale: BrowserWindow | null = null;
let serveurNext: ChildProcess | null = null;
/** Vrai une fois le serveur arrêté volontairement (fermeture) : son code de sortie n'est alors pas une erreur. */
let arretServeurVolontaire = false;

/** Session de l'appli sur ce poste, inscrite dans le verrou de la base (voir `verrou.ts`). */
const session = {
  id: randomUUID(),
  poste: hostname(),
  utilisateur: userInfo().username,
  ouverteLe: new Date().toISOString(),
};
/** Base dont cette session détient le verrou (null tant qu'elle ne l'a pas pris). */
let baseVerrouillee: { dossier: string; dbFilePath: string; generation: number } | null = null;
/** Dernière écriture du verrou par cette session (limite les écritures sur focus répétés). */
let derniereEcritureVerrou = 0;
/** Vrai si un autre poste a pris la base pendant la session : on ne réécrit alors plus rien en fermant. */
let conflitDetecte = false;
let minuterieVerrou: NodeJS.Timeout | null = null;
const INTERVALLE_VERROU_MS = 2 * 60 * 1000;

function estCePoste(verrou: Verrou): boolean {
  return verrou.poste === session.poste && verrou.utilisateur === session.utilisateur;
}

function nomPoste(verrou: Verrou): string {
  return verrou.utilisateur ? `${verrou.poste} (${verrou.utilisateur})` : verrou.poste;
}

/**
 * Avant d'ouvrir la base : refuse par défaut si elle est ouverte sur un
 * autre poste, ou si la synchronisation n'a pas encore livré la version
 * enregistrée à la dernière fermeture sur un autre poste. L'utilisateur
 * peut réessayer (le temps que l'autre poste ferme / que la synchro
 * passe), forcer, ou quitter. Retourne `false` s'il quitte.
 */
async function verifierAccesBase(dossier: string, dbFilePath: string): Promise<boolean> {
  for (;;) {
    const verrou = lireVerrou(dossier);
    let message: string | null = null;
    let detail = "";

    if (verrou && verrou.etat === "ouverte" && !estCePoste(verrou)) {
      // Un verrou « ouverte » de ce même poste ne peut venir que d'une
      // session précédente qui a planté (une seule instance par poste) :
      // rien à signaler dans ce cas.
      message = `La base est ouverte sur le poste ${nomPoste(verrou)}.`;
      detail =
        `Ouverte le ${formaterDate(verrou.ouverteLe)}, dernière activité le ${formaterDate(verrou.derniereActivite)}.\n\n` +
        "L'ouvrir ici en même temps ferait perdre les saisies de l'un des deux postes. Fermez l'appli sur l'autre poste, " +
        "attendez que Google Drive ait synchronisé, puis réessayez.\n\n" +
        "« Ouvrir quand même » seulement si l'appli n'est plus ouverte là-bas (poste éteint sans fermer l'appli, plantage…).";
    } else if (verrou && verrou.etat === "fermee" && !estCePoste(verrou)) {
      const generationLocale = lireGeneration(dbFilePath);
      if (generationLocale !== null && generationLocale < verrou.generation) {
        message = "La base n'est pas encore à jour sur ce poste.";
        detail =
          `Elle a été modifiée sur le poste ${nomPoste(verrou)} (fermée le ${formaterDate(verrou.derniereActivite)}), ` +
          "mais Google Drive n'a pas encore livré cette version ici.\n\n" +
          "Attendez la fin de la synchronisation (icône Google Drive dans la barre des tâches), puis réessayez. " +
          "L'ouvrir maintenant ferait repartir d'une version périmée et écraserait les saisies faites là-bas.";
      }
    }

    if (!message) return true;

    const { response } = await dialog.showMessageBox({
      type: "warning",
      title: "Ma comptabilité",
      message,
      detail,
      buttons: ["Réessayer", "Ouvrir quand même", "Quitter"],
      defaultId: 0,
      cancelId: 2,
      noLink: true,
    });
    if (response === 1) return true;
    if (response === 2) return false;
  }
}

function prendreVerrou(dossier: string, dbFilePath: string): void {
  // Génération lue une fois, avant le démarrage du serveur : elle ne change
  // qu'à la fermeture, inutile de rouvrir la base à chaque signal d'activité.
  baseVerrouillee = { dossier, dbFilePath, generation: lireGeneration(dbFilePath) ?? 0 };
  ecrireVerrouSession();
}

function ecrireVerrouSession(): void {
  if (!baseVerrouillee) return;
  derniereEcritureVerrou = Date.now();
  ecrireVerrou(baseVerrouillee.dossier, {
    etat: "ouverte",
    poste: session.poste,
    utilisateur: session.utilisateur,
    session: session.id,
    ouverteLe: session.ouverteLe,
    derniereActivite: new Date().toISOString(),
    generation: baseVerrouillee.generation,
  });
}

/**
 * Vérifie que le verrou est toujours celui de cette session (un autre poste
 * a pu forcer l'ouverture, ou les deux ouvertures se sont croisées pendant
 * la synchro) et signale l'activité. En cas de conflit, prévient
 * l'utilisateur et ferme l'appli sans plus rien écrire.
 */
function surveillerVerrou(): void {
  if (!baseVerrouillee || conflitDetecte) return;
  const verrou = lireVerrou(baseVerrouillee.dossier);
  if (verrou && verrou.session !== session.id) {
    conflitDetecte = true;
    if (minuterieVerrou) clearInterval(minuterieVerrou);
    const options: Electron.MessageBoxOptions = {
      type: "error",
      title: "Ma comptabilité",
      message: `La base a été ouverte sur le poste ${nomPoste(verrou)} pendant qu'elle l'était ici.`,
      detail:
        `Ouverte là-bas le ${formaterDate(verrou.ouverteLe)}.\n\n` +
        "Pour ne pas écraser les saisies faites sur l'autre poste, l'appli va se fermer ici. " +
        "Une fois Google Drive synchronisé, vérifiez vos dernières saisies sur ce poste : elles ont pu être perdues.",
      buttons: ["Fermer l'appli"],
      noLink: true,
    };
    const affichage = fenetrePrincipale
      ? dialog.showMessageBox(fenetrePrincipale, options)
      : dialog.showMessageBox(options);
    affichage.finally(() => app.quit());
    return;
  }
  if (Date.now() - derniereEcritureVerrou >= 60 * 1000) ecrireVerrouSession();
}

/** Arrête le serveur Next et attend sa sortie (la base est alors libérée). */
function arreterServeur(delaiMaxMs = 5000): Promise<void> {
  const serveur = serveurNext;
  if (!serveur || serveur.exitCode !== null || serveur.signalCode !== null) return Promise.resolve();
  arretServeurVolontaire = true;
  return new Promise((resolve) => {
    const minuterie = setTimeout(resolve, delaiMaxMs);
    serveur.once("exit", () => {
      clearTimeout(minuterie);
      resolve();
    });
    serveur.kill();
  });
}

/**
 * Fermeture propre : serveur arrêté, génération de la base incrémentée,
 * verrou passé à « fermee » avec cette génération (voir `verrou.ts`). Rien
 * n'est écrit si un autre poste a pris la base entre-temps.
 */
async function fermerProprement(): Promise<void> {
  if (minuterieVerrou) clearInterval(minuterieVerrou);
  await arreterServeur();
  if (!baseVerrouillee || conflitDetecte) return;
  const verrou = lireVerrou(baseVerrouillee.dossier);
  if (verrou && verrou.session !== session.id) return;
  try {
    const generation = incrementerGeneration(baseVerrouillee.dbFilePath);
    ecrireVerrou(baseVerrouillee.dossier, {
      etat: "fermee",
      poste: session.poste,
      utilisateur: session.utilisateur,
      session: session.id,
      ouverteLe: session.ouverteLe,
      derniereActivite: new Date().toISOString(),
      generation,
    });
  } catch (erreur) {
    appendFileSync(
      join(app.getPath("userData"), "crash.log"),
      `[fermeture] ${erreur instanceof Error ? erreur.stack ?? erreur.message : String(erreur)}\n`
    );
  }
}

/**
 * Demande à l'utilisateur d'ouvrir une base de données existante ou
 * d'indiquer où en créer une vierge — il n'y a pas d'emplacement par défaut
 * choisi automatiquement, l'utilisateur décide toujours. Retourne le dossier
 * choisi, ou `null` si l'utilisateur annule (l'app doit alors se fermer).
 */
async function assistantChoixBaseDeDonnees(): Promise<string | null> {
  const { response } = await dialog.showMessageBox({
    type: "question",
    title: "Bienvenue dans Ma comptabilité",
    message: "Aucune base de données n'est configurée.",
    detail: "Voulez-vous ouvrir une base de données existante, ou démarrer avec une base vierge ?",
    buttons: ["Ouvrir une base existante…", "Créer une base vierge…", "Quitter"],
    defaultId: 0,
    cancelId: 2,
  });

  if (response === 2) return null;

  const creerVierge = response === 1;
  const resultat = await dialog.showOpenDialog({
    title: creerVierge
      ? "Choisir où enregistrer la nouvelle base de données"
      : "Choisir le dossier contenant compta.db",
    defaultPath: app.getPath("documents"),
    properties: creerVierge ? ["openDirectory", "createDirectory"] : ["openDirectory"],
  });

  if (resultat.canceled || resultat.filePaths.length === 0) return null;
  return resultat.filePaths[0];
}

/**
 * Dossier où stocker compta.db : celui choisi par l'utilisateur (config) s'il
 * existe toujours, sinon on lui redemande via `assistantChoixBaseDeDonnees`.
 * Retourne `null` si l'utilisateur annule l'assistant.
 */
async function resoudreDossierDonnees(): Promise<string | null> {
  const config = lireConfig();
  if (config.customDataDir && existsSync(config.customDataDir)) {
    return config.customDataDir;
  }

  const choisi = await assistantChoixBaseDeDonnees();
  if (!choisi) return null;
  ecrireConfig({ customDataDir: choisi });
  return choisi;
}

function dossierMigrations(): string {
  return app.isPackaged
    ? join(process.resourcesPath, "migrations")
    : join(__dirname, "..", "prisma", "migrations");
}

function dossierServeurStandalone(): string {
  return app.isPackaged
    ? join(process.resourcesPath, "standalone")
    : join(__dirname, "..", ".next", "standalone");
}

/** Trouve un port TCP libre sur 127.0.0.1. */
function portLibre(): Promise<number> {
  return new Promise((resolve, reject) => {
    const serveur = createServer();
    serveur.listen(0, "127.0.0.1", () => {
      const adresse = serveur.address();
      if (adresse && typeof adresse === "object") {
        const port = adresse.port;
        serveur.close(() => resolve(port));
      } else {
        serveur.close(() => reject(new Error("Impossible de trouver un port libre.")));
      }
    });
    serveur.on("error", reject);
  });
}

function attendreServeurPret(port: number, delaiMaxMs = 20000): Promise<void> {
  const debut = Date.now();
  return new Promise((resolve, reject) => {
    const essayer = () => {
      const requete = require("node:http").get(
        { host: "127.0.0.1", port, path: "/", timeout: 1000 },
        (res: { destroy: () => void }) => {
          res.destroy();
          resolve();
        }
      );
      requete.on("error", () => {
        if (Date.now() - debut > delaiMaxMs) {
          reject(new Error("Le serveur local n'a pas démarré à temps."));
        } else {
          setTimeout(essayer, 300);
        }
      });
    };
    essayer();
  });
}

async function demarrerServeurNext(dbFilePath: string): Promise<number> {
  const port = await portLibre();
  const dossierServeur = dossierServeurStandalone();
  const scriptServeur = join(dossierServeur, "server.js");

  if (!existsSync(scriptServeur)) {
    throw new Error(`Build serveur introuvable : ${scriptServeur}`);
  }

  const cheminLog = cheminLogServeur();
  const flotLog = createWriteStream(cheminLog, { flags: "w" });

  serveurNext = spawn(process.execPath, [scriptServeur], {
    cwd: dossierServeur,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: "production",
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
      DATABASE_URL: `file:${dbFilePath}`,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  serveurNext.stdout?.pipe(flotLog, { end: false });
  serveurNext.stderr?.pipe(flotLog, { end: false });

  serveurNext.on("exit", (code) => {
    flotLog.end();
    if (code !== 0 && code !== null && !arretServeurVolontaire) {
      dialog.showErrorBox(
        "Erreur",
        `Le serveur local s'est arrêté de façon inattendue (code ${code}).\n\nDétails : ${cheminLog}`
      );
      app.exit(1);
    }
  });

  await attendreServeurPret(port);
  return port;
}

/**
 * Choisit un dossier pour y démarrer une base de données vierge. Si le
 * dossier contient déjà un compta.db, prévient l'utilisateur (rien n'est
 * jamais écrasé, mais ce ne serait alors pas une base vierge).
 */
async function creerNouvelleBase(): Promise<void> {
  const resultat = await dialog.showOpenDialog({
    title: "Choisir où enregistrer la nouvelle base de données",
    defaultPath: app.getPath("documents"),
    properties: ["openDirectory", "createDirectory"],
  });
  if (resultat.canceled || resultat.filePaths.length === 0) return;
  const [dossierChoisi] = resultat.filePaths;

  if (existsSync(join(dossierChoisi, "compta.db"))) {
    const { response } = await dialog.showMessageBox({
      type: "warning",
      title: "Base de données déjà présente",
      message: "Ce dossier contient déjà une base de données (compta.db).",
      detail: "Elle sera ouverte telle quelle, avec toutes ses données existantes — rien n'est effacé. Pour une base réellement vierge, choisissez un dossier vide.",
      buttons: ["Ouvrir ce dossier quand même", "Annuler"],
      defaultId: 1,
      cancelId: 1,
    });
    if (response === 1) return;
  }

  ecrireConfig({ customDataDir: dossierChoisi });
  // `quit` (pas `exit`) : passe par `before-quit`, donc libère proprement le
  // verrou de la base actuelle avant de redémarrer.
  app.relaunch();
  app.quit();
}

async function ouvrirAutreBase(): Promise<void> {
  const resultat = await dialog.showOpenDialog({
    title: "Choisir le dossier contenant compta.db",
    properties: ["openDirectory"],
  });
  if (resultat.canceled || resultat.filePaths.length === 0) return;
  const [dossierChoisi] = resultat.filePaths;
  ecrireConfig({ customDataDir: dossierChoisi });
  app.relaunch();
  app.quit();
}

function construireMenu(dossierDonnees: string): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: "Fichier",
      submenu: [
        {
          label: "Ouvrir une autre base de données…",
          click: ouvrirAutreBase,
        },
        {
          label: "Créer une nouvelle base…",
          click: creerNouvelleBase,
        },
        {
          label: "Afficher le dossier de la base actuelle",
          click: () => shell.openPath(dossierDonnees),
        },
        { type: "separator" },
        { role: "quit", label: "Quitter" },
      ],
    },
    {
      label: "Affichage",
      submenu: [
        { role: "reload", label: "Recharger" },
        { role: "toggleDevTools", label: "Outils de développement" },
        { type: "separator" },
        { role: "resetZoom", label: "Zoom normal" },
        { role: "zoomIn", label: "Zoom avant" },
        { role: "zoomOut", label: "Zoom arrière" },
        { type: "separator" },
        { role: "togglefullscreen", label: "Plein écran" },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function demarrer(): Promise<void> {
  const dossierDonnees = await resoudreDossierDonnees();
  if (!dossierDonnees) {
    app.exit(0);
    return;
  }
  mkdirSync(dossierDonnees, { recursive: true });
  const dbFilePath = join(dossierDonnees, "compta.db");

  if (!(await verifierAccesBase(dossierDonnees, dbFilePath))) {
    app.exit(0);
    return;
  }

  appliquerMigrations(dbFilePath, dossierMigrations());
  prendreVerrou(dossierDonnees, dbFilePath);
  minuterieVerrou = setInterval(() => surveillerVerrou(), INTERVALLE_VERROU_MS);
  // Au réveil d'une veille, l'autre poste a pu prendre la base entre-temps :
  // le vérifier tout de suite plutôt qu'au prochain tick.
  powerMonitor.on("resume", () => surveillerVerrou());

  construireMenu(dossierDonnees);

  let port: number;
  try {
    port = await demarrerServeurNext(dbFilePath);
  } catch (erreur) {
    dialog.showErrorBox("Erreur au démarrage", String(erreur));
    app.exit(1);
    return;
  }

  fenetrePrincipale = new BrowserWindow({
    width: 1280,
    height: 860,
    title: "Ma comptabilité",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  // Retour sur la fenêtre : vérifier que la base n'a pas été prise
  // ailleurs entre-temps, avant toute nouvelle saisie.
  fenetrePrincipale.on("focus", () => surveillerVerrou());
  fenetrePrincipale.loadURL(`http://127.0.0.1:${port}`);
}

// Une seule instance par poste : deux fenêtres sur la même base se
// marcheraient dessus, et le verrou suppose qu'un verrou « ouverte » de ce
// poste vient forcément d'une session précédente qui a planté.
if (!app.requestSingleInstanceLock()) {
  app.exit(0);
} else {
  app.on("second-instance", () => {
    if (!fenetrePrincipale) return;
    if (fenetrePrincipale.isMinimized()) fenetrePrincipale.restore();
    fenetrePrincipale.focus();
  });
  app.whenReady().then(demarrer);
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

let fermetureTerminee = false;
let fermetureEnCours = false;
app.on("before-quit", (event) => {
  if (fermetureTerminee) return;
  event.preventDefault();
  if (fermetureEnCours) return;
  fermetureEnCours = true;
  fermerProprement().finally(() => {
    fermetureTerminee = true;
    app.quit();
  });
});
