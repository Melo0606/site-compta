/** Catégorie telle que chargée avec sa parente éventuelle (sous-catégorie). */
export type CategorieNommee = { nom: string; parent?: { nom: string } | null };
export type CategorieArbre = { id: number; nom: string; parentId: number | null };

/** « Auto/Moto › Carburant » pour une sous-catégorie, le nom seul sinon. */
export function nomCompletCategorie(categorie: CategorieNommee | null | undefined): string | null {
  if (!categorie) return null;
  return categorie.parent ? `${categorie.parent.nom} › ${categorie.nom}` : categorie.nom;
}

/** Pour chaque catégorie, la catégorie de premier niveau qui la regroupe (elle-même si ce n'est pas une sous-catégorie). */
export function categorieRacineParId(categories: CategorieArbre[]): Map<number, CategorieArbre> {
  const parId = new Map(categories.map((c) => [c.id, c]));
  return new Map(categories.map((c) => [c.id, (c.parentId !== null && parId.get(c.parentId)) || c]));
}

/** Nom complet (« Parente › Sous-catégorie ») de chaque catégorie, par id. */
export function nomCompletParId(categories: CategorieArbre[]): Map<number, string> {
  const parId = new Map(categories.map((c) => [c.id, c]));
  return new Map(
    categories.map((c) => {
      const parent = c.parentId !== null ? parId.get(c.parentId) : undefined;
      return [c.id, parent ? `${parent.nom} › ${c.nom}` : c.nom];
    })
  );
}

/** Catégories triées pour un menu : chaque catégorie de premier niveau suivie de ses sous-catégories, par ordre alphabétique. */
export function categoriesEnArbre<T extends CategorieArbre>(categories: T[]): { categorie: T; parent: T | null }[] {
  const tri = (a: T, b: T) => a.nom.localeCompare(b.nom, "fr");
  const racines = categories.filter((c) => c.parentId === null).sort(tri);
  const ids = new Set(racines.map((r) => r.id));
  const orphelines = categories.filter((c) => c.parentId !== null && !ids.has(c.parentId));
  return [
    ...racines.flatMap((r) => [
      { categorie: r, parent: null },
      ...categories
        .filter((c) => c.parentId === r.id)
        .sort(tri)
        .map((c) => ({ categorie: c, parent: r })),
    ]),
    ...orphelines.map((c) => ({ categorie: c, parent: null })),
  ];
}
