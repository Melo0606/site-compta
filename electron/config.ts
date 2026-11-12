import { app } from "electron";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type AppConfig = {
  /** Dossier choisi par l'utilisateur pour stocker compta.db, s'il a utilisé "Ouvrir une autre base". */
  customDataDir?: string;
};

function configPath(): string {
  return join(app.getPath("userData"), "config.json");
}

export function lireConfig(): AppConfig {
  const p = configPath();
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, "utf-8")) as AppConfig;
  } catch {
    return {};
  }
}

export function ecrireConfig(config: AppConfig): void {
  writeFileSync(configPath(), JSON.stringify(config, null, 2), "utf-8");
}
