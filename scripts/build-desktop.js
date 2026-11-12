// Orchestration du build de l'application de bureau (Electron) :
// 1. remise à plat de better-sqlite3 pour l'ABI Node normal (une exécution
//    précédente de ce script laisse le module recompilé pour l'ABI Electron,
//    ce qui casse `next build` : la génération des pages statiques exécute
//    le code serveur sous Node normal, pas sous Electron)
// 2. build Next.js en sortie "standalone"
// 3. copie des assets statiques/publics dans le bundle standalone (non
//    inclus automatiquement par Next en mode standalone)
// 4. recompilation des modules natifs (better-sqlite3) pour l'ABI Electron
// 5. dé-symlinkage de .next/standalone/.next/node_modules : la sortie
//    Turbopack y laisse des symlinks pointant vers le node_modules absolu du
//    poste de build (ex. better-sqlite3-<hash> -> C:\...\node_modules\
//    better-sqlite3), que le serveur require() par ce nom haché. Ces
//    symlinks ne survivent pas au packaging sur une autre machine/poste, il
//    faut donc les remplacer par de vraies copies du contenu ciblé — fait
//    après l'étape 4 pour que la copie capture bien le binaire recompilé
//    pour l'ABI Electron, pas l'ABI Node de l'étape 1.
// 6. propagation du module recompilé dans le node_modules de premier niveau
//    du bundle standalone, pour que le serveur Next (lancé sous le runtime
//    Electron via ELECTRON_RUN_AS_NODE) utilise le même binaire natif que
//    le processus principal Electron
// 7. compilation TypeScript du processus principal Electron
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const racine = path.join(__dirname, "..");
const standalone = path.join(racine, ".next", "standalone");

function executer(commande, args) {
  console.log(`\n$ ${commande} ${args.join(" ")}`);
  execFileSync(commande, args, { cwd: racine, stdio: "inherit", shell: process.platform === "win32" });
}

function copierDossier(source, destination) {
  if (!fs.existsSync(source)) return;
  fs.rmSync(destination, { recursive: true, force: true });
  fs.cpSync(source, destination, { recursive: true });
}

/**
 * Remplace récursivement, dans `dossier`, tout symlink par une copie réelle
 * du contenu vers lequel il pointe (résolu via realpathSync).
 */
function deresolveSymlinks(dossier) {
  if (!fs.existsSync(dossier)) return;
  for (const entree of fs.readdirSync(dossier)) {
    const cheminEntree = path.join(dossier, entree);
    const stat = fs.lstatSync(cheminEntree);
    if (stat.isSymbolicLink()) {
      const cible = fs.realpathSync(cheminEntree);
      fs.rmSync(cheminEntree, { recursive: true, force: true });
      fs.cpSync(cible, cheminEntree, { recursive: true });
      console.log(`Dé-symlinké : ${cheminEntree} (était -> ${cible})`);
    } else if (stat.isDirectory()) {
      deresolveSymlinks(cheminEntree);
    }
  }
}

console.log("=== 1/7 : remise à plat de better-sqlite3 pour Node normal ===");
executer("npm", ["rebuild", "better-sqlite3"]);

console.log("\n=== 2/7 : next build (standalone) ===");
executer("npx", ["next", "build"]);

if (!fs.existsSync(standalone)) {
  throw new Error(`Sortie standalone introuvable : ${standalone} (vérifier next.config.ts: output "standalone").`);
}

console.log("\n=== 3/7 : copie des assets statiques/publics ===");
copierDossier(path.join(racine, ".next", "static"), path.join(standalone, ".next", "static"));
copierDossier(path.join(racine, "public"), path.join(standalone, "public"));

console.log("\n=== 4/7 : recompilation de better-sqlite3 pour l'ABI Electron ===");
executer("npx", ["electron-rebuild", "-f", "-w", "better-sqlite3"]);

console.log("\n=== 5/7 : dé-symlinkage de .next/standalone/.next/node_modules ===");
deresolveSymlinks(path.join(standalone, ".next", "node_modules"));

console.log("\n=== 6/7 : propagation du module natif recompilé dans le bundle standalone ===");
const sourceModule = path.join(racine, "node_modules", "better-sqlite3");
const cibleModule = path.join(standalone, "node_modules", "better-sqlite3");
if (fs.existsSync(cibleModule)) {
  copierDossier(sourceModule, cibleModule);
  console.log(`Copié : ${sourceModule} -> ${cibleModule}`);
} else {
  console.warn(
    `Attention : ${cibleModule} n'existe pas (better-sqlite3 non tracé par Next standalone) — ` +
      `copie directe du module à la racine du bundle standalone.`
  );
  copierDossier(sourceModule, path.join(standalone, "node_modules", "better-sqlite3"));
}

console.log("\n=== 7/7 : compilation du processus principal Electron ===");
executer("npx", ["tsc", "-p", "tsconfig.electron.json"]);

console.log("\nBuild desktop terminé.");
