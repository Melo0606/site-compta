"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function getCategories() {
  return prisma.categorie.findMany({ orderBy: { nom: "asc" } });
}

function parseForm(formData: FormData) {
  const nom = String(formData.get("nom") ?? "").trim();
  if (!nom) throw new Error("Le nom est obligatoire.");
  return { nom };
}

export async function createCategorie(formData: FormData) {
  const data = parseForm(formData);
  await prisma.categorie.create({ data });
  revalidatePath("/categories");
  redirect("/categories");
}

export async function updateCategorie(formData: FormData) {
  const id = Number(formData.get("id"));
  const data = parseForm(formData);
  await prisma.categorie.update({ where: { id }, data });
  revalidatePath("/categories");
  revalidatePath("/charges-mensuelles");
  revalidatePath("/charges-annuelles");
  revalidatePath("/achats-prevus");
  revalidatePath("/");
}

export async function deleteCategorie(formData: FormData) {
  const id = Number(formData.get("id"));
  const categorie = await prisma.categorie.findUniqueOrThrow({ where: { id } });
  if (categorie.nom === "Quotidien") {
    throw new Error(
      "La catégorie « Quotidien » est utilisée par le budget des dépenses du quotidien et ne peut pas être supprimée."
    );
  }
  await prisma.categorie.delete({ where: { id } });
  revalidatePath("/categories");
  revalidatePath("/charges-mensuelles");
  revalidatePath("/charges-annuelles");
  revalidatePath("/achats-prevus");
  revalidatePath("/");
}
