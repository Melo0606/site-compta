"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assurerChargeBudgetDepensesQuotidiennes } from "@/app/actions/charges-mensuelles";

export async function getPersonnes() {
  return prisma.personne.findMany({ orderBy: { nom: "asc" } });
}

export async function getPersonne(id: number) {
  return prisma.personne.findUnique({ where: { id } });
}

function parsePersonneForm(formData: FormData) {
  const nom = String(formData.get("nom") ?? "").trim();
  const soldePerso = Number(formData.get("soldePerso") ?? 0);
  const soldeEpargne = Number(formData.get("soldeEpargne") ?? 0);
  const virementMensuelHabituel = Number(formData.get("virementMensuelHabituel") ?? 0);
  const virementEpargneMensuelHabituel = Number(formData.get("virementEpargneMensuelHabituel") ?? 0);

  if (!nom) throw new Error("Le nom est obligatoire.");
  if (!Number.isFinite(soldePerso)) throw new Error("Solde perso invalide.");
  if (!Number.isFinite(soldeEpargne)) throw new Error("Solde épargne invalide.");
  if (!Number.isFinite(virementMensuelHabituel) || virementMensuelHabituel < 0) {
    throw new Error("Virement mensuel habituel invalide.");
  }
  if (!Number.isFinite(virementEpargneMensuelHabituel)) {
    throw new Error("Virement épargne mensuel habituel invalide.");
  }

  return { nom, soldePerso, soldeEpargne, virementMensuelHabituel, virementEpargneMensuelHabituel };
}

export async function createPersonne(formData: FormData) {
  const data = parsePersonneForm(formData);
  const personne = await prisma.personne.create({ data });
  await assurerChargeBudgetDepensesQuotidiennes(personne.id);
  revalidatePath("/personnes");
  revalidatePath("/charges-mensuelles");
  revalidatePath("/");
  redirect("/personnes");
}

export async function updatePersonne(id: number, formData: FormData) {
  const data = parsePersonneForm(formData);
  await prisma.personne.update({ where: { id }, data });
  revalidatePath("/personnes");
  revalidatePath("/");
  redirect("/personnes");
}

export async function deletePersonne(formData: FormData) {
  const id = Number(formData.get("id"));
  await prisma.personne.delete({ where: { id } });
  revalidatePath("/personnes");
  revalidatePath("/");
}
