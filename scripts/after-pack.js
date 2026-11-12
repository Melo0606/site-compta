// electron-builder exclut automatiquement, sans possibilité de dérogation via
// `filter`, tout dossier nommé exactement "node_modules" à la racine d'un
// extraResources (node_modules/app-builder-lib/out/util/filter.js:
// `if (relative === "node_modules") return false`). La copie de
// .next/standalone/node_modules vers resources/standalone/node_modules
// (nécessaire au démarrage de server.js) doit donc se faire manuellement ici,
// après le packaging.
const fs = require("node:fs");
const path = require("node:path");

exports.default = async function (context) {
  const src = path.join(context.packager.projectDir, ".next", "standalone", "node_modules");
  const dest = path.join(context.appOutDir, "resources", "standalone", "node_modules");
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(src, dest, { recursive: true });
  console.log(`[after-pack] node_modules copié : ${src} -> ${dest}`);
};
