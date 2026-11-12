import Database from "better-sqlite3";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Migrations déjà appliquées à la base mais absentes de `migrationsDir` :
 * la base a été mise à jour par une version plus récente de l'appli (sur un
 * autre poste, la base étant partagée), dont cette version ne connaît pas le
 * schéma. Liste vide si la base n'existe pas encore ou n'est pas lisible
 * (l'ouverture normale signalera alors le problème).
 */
export function migrationsInconnues(dbFilePath: string, migrationsDir: string): string[] {
  if (!existsSync(dbFilePath)) return [];
  let appliquees: string[];
  try {
    const db = new Database(dbFilePath, { readonly: true, fileMustExist: true });
    try {
      const table = db
        .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = '_prisma_migrations'`)
        .get();
      if (!table) return [];
      appliquees = db
        .prepare(`SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`)
        .all()
        .map((r: unknown) => (r as { migration_name: string }).migration_name);
    } finally {
      db.close();
    }
  } catch {
    return [];
  }
  const connues = new Set(
    readdirSync(migrationsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
  );
  return appliquees.filter((nom) => !connues.has(nom));
}

/**
 * Applique les migrations Prisma (fichiers migration.sql sous
 * `migrationsDir`) directement via better-sqlite3, sans dépendre du CLI
 * Prisma à l'exécution. La table `_prisma_migrations` créée/lue est celle du
 * format Prisma standard : une base migrée par cette fonction reste
 * compatible avec `prisma migrate deploy` si on l'ouvre plus tard depuis
 * l'environnement de développement, et inversement une base déjà migrée par
 * Prisma est reconnue telle quelle (aucune migration déjà appliquée n'est
 * rejouée).
 */
export function appliquerMigrations(dbFilePath: string, migrationsDir: string): void {
  const db = new Database(dbFilePath);
  try {
    // Journal classique (un seul fichier compta.db au repos) plutôt que WAL :
    // la base est partagée entre plusieurs postes via un dossier synchronisé
    // (Google Drive…), qui synchroniserait compta.db, -wal et -shm
    // indépendamment les uns des autres — un poste pourrait alors recevoir
    // une base sans les dernières écritures restées dans le -wal. Le passage
    // d'une base WAL existante en DELETE réintègre le -wal et le supprime.
    db.pragma("journal_mode = DELETE");
    db.exec(`
      CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
        "id" TEXT PRIMARY KEY NOT NULL,
        "checksum" TEXT NOT NULL,
        "finished_at" DATETIME,
        "migration_name" TEXT NOT NULL,
        "logs" TEXT,
        "rolled_back_at" DATETIME,
        "started_at" DATETIME NOT NULL DEFAULT current_timestamp,
        "applied_steps_count" INTEGER UNSIGNED NOT NULL DEFAULT 0
      );
    `);

    const dejaAppliquees = new Set(
      db
        .prepare(
          `SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`
        )
        .all()
        .map((r: unknown) => (r as { migration_name: string }).migration_name)
    );

    const dossiers = readdirSync(migrationsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();

    const insert = db.prepare(
      `INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, started_at, applied_steps_count)
       VALUES (?, ?, current_timestamp, ?, current_timestamp, 1)`
    );

    for (const nom of dossiers) {
      if (dejaAppliquees.has(nom)) continue;
      const sqlPath = join(migrationsDir, nom, "migration.sql");
      if (!existsSync(sqlPath)) continue;
      const sql = readFileSync(sqlPath, "utf-8");
      const checksum = createHash("sha256").update(sql).digest("hex");

      db.exec(sql);
      insert.run(randomUUID(), checksum, nom);
    }
  } finally {
    db.close();
  }
}
