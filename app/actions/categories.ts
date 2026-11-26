"use server";

import { prisma } from "@/lib/prisma";
import type { TypeCategorie } from "@/app/generated/prisma/client";
import { revalidatePath } from "next/cache";

export async function getCategories() {
  return prisma.categorie.findMany({ orderBy: { nom: "asc" }, include: { parent: true } });
}

/**
 * Lit le formulaire d'une catégorie. `parentId` vide = catégorie de premier
 * niveau. Un seul niveau de sous-catégories : la parente doit elle-même être
 * de premier niveau, et une catégorie qui a des sous-catégories ne peut pas
 * devenir sous-catégorie.
 */
async function parseForm(formData: FormData, id?: number) {
  const nom = String(formData.get("nom") ?? "").trim();
  if (!nom) throw new Error("Le nom est obligatoire.");
  const parentIdRaw = String(formData.get("parentId") ?? "").trim();
  const parentId = parentIdRaw ? Number(parentIdRaw) : null;
  let type: TypeCategorie = formData.get("type") === "REVENU" ? "REVENU" : "DEPENSE";

  if (parentId !== null) {
    if (parentId === id) throw new Error("Une catégorie ne peut pas être sa propre sous-catégorie.");
    const parent = await prisma.categorie.findUnique({ where: { id: parentId } });
    if (!parent) throw new Error("Catégorie parente introuvable.");
    if (parent.parentId !== null) {
      throw new Error(
        `« ${parent.nom} » est déjà une sous-catégorie : une sous-catégorie ne peut pas avoir de sous-catégories.`,
      );
    }
    if (id !== undefined && (await prisma.categorie.count({ where: { parentId: id } })) > 0) {
      throw new Error("Cette catégorie a des sous-catégories : elle doit rester une catégorie principale.");
    }
    // Une sous-catégorie prend toujours le type (dépense/revenu) de sa parente.
    type = parent.type;
  }
  if (nom === "Quotidien" && parentId === null && type !== "DEPENSE")
    throw new Error("La catégorie « Quotidien » doit rester une catégorie de dépenses.");

  // Unicité du nom parmi les catégories de même parente (vérifiée ici aussi pour les catégories
  // principales : SQLite ne compare pas les parentId NULL dans l'index unique).
  const homonyme = await prisma.categorie.findFirst({ where: { nom, parentId } });
  if (homonyme && homonyme.id !== id) {
    throw new Error(
      parentId === null
        ? `Une catégorie principale « ${nom} » existe déjà.`
        : `Cette catégorie a déjà une sous-catégorie « ${nom} ».`,
    );
  }
  return { nom, parentId, type };
}

/** Résultat d'une action sur une catégorie : message affiché dans le formulaire (les erreurs levées par une action serveur sont masquées en production). */
export type EtatCategorie = { erreur: string | null; ok?: number };

async function executer(action: () => Promise<void>): Promise<EtatCategorie> {
  try {
    await action();
    revaliderPagesCategories();
    return { erreur: null, ok: Date.now() };
  } catch (e) {
    return { erreur: e instanceof Error ? e.message : "Erreur inattendue." };
  }
}

function revaliderPagesCategories() {
  revalidatePath("/categories");
  revalidatePath("/charges-mensuelles");
  revalidatePath("/charges-annuelles");
  revalidatePath("/achats-prevus");
  revalidatePath("/stats");
  revalidatePath("/mois", "layout");
  revalidatePath("/");
}

export async function createCategorie(_etat: EtatCategorie, formData: FormData): Promise<EtatCategorie> {
  return executer(async () => {
    const data = await parseForm(formData);
    await prisma.categorie.create({ data });
  });
}

export async function updateCategorie(_etat: EtatCategorie, formData: FormData): Promise<EtatCategorie> {
  return executer(async () => {
    const id = Number(formData.get("id"));
    const actuelle = await prisma.categorie.findUniqueOrThrow({ where: { id } });
    const data = await parseForm(formData, id);
    if (
      actuelle.nom === "Quotidien" &&
      actuelle.parentId === null &&
      (data.nom !== "Quotidien" || data.parentId !== null)
    ) {
      throw new Error(
        "La catégorie « Quotidien » est utilisée par le budget des dépenses du quotidien : elle ne peut être ni renommée ni devenir une sous-catégorie.",
      );
    }
    await prisma.$transaction([
      prisma.categorie.update({ where: { id }, data }),
      prisma.categorie.updateMany({ where: { parentId: id }, data: { type: data.type } }),
    ]);
  });
}

export async function deleteCategorie(_etat: EtatCategorie, formData: FormData): Promise<EtatCategorie> {
  return executer(async () => {
    const id = Number(formData.get("id"));
    const categorie = await prisma.categorie.findUniqueOrThrow({ where: { id } });
    if (categorie.nom === "Quotidien" && categorie.parentId === null) {
      throw new Error(
        "La catégorie « Quotidien » est utilisée par le budget des dépenses du quotidien et ne peut pas être supprimée.",
      );
    }
    // Les sous-catégories sont supprimées avec leur parente (onDelete: Cascade) ; les éléments classés
    // dedans passent « Sans catégorie ». On les détache d'abord explicitement : le SetNull des charges et
    // dépenses ne se déclenche pas pour une ligne supprimée par cascade sous SQLite si les clés étrangères
    // sont désactivées.
    const ids = [
      id,
      ...(await prisma.categorie.findMany({ where: { parentId: id }, select: { id: true } })).map((c) => c.id),
    ];
    await prisma.$transaction([
      prisma.chargeMensuelle.updateMany({ where: { categorieId: { in: ids } }, data: { categorieId: null } }),
      prisma.chargeAnnuelle.updateMany({ where: { categorieId: { in: ids } }, data: { categorieId: null } }),
      prisma.achatPrevu.updateMany({ where: { categorieId: { in: ids } }, data: { categorieId: null } }),
      prisma.depenseQuotidienne.updateMany({ where: { categorieId: { in: ids } }, data: { categorieId: null } }),
      prisma.revenuExceptionnel.updateMany({ where: { categorieId: { in: ids } }, data: { categorieId: null } }),
      prisma.categorie.deleteMany({ where: { parentId: id } }),
      prisma.categorie.delete({ where: { id } }),
    ]);
  });
}
