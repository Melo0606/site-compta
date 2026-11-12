"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { CleRepartition } from "@/app/generated/prisma/client";

/** Paramètres est un singleton : on récupère la première ligne, ou on la crée. */
export async function getParametres() {
  const existing = await prisma.parametres.findFirst();
  if (existing) return existing;
  return prisma.parametres.create({ data: { cleRepartition: "EGALE" } });
}

export async function updateParametres(formData: FormData) {
  const cleRepartition = String(formData.get("cleRepartition") ?? "EGALE") as CleRepartition;
  const soldeCommun = Number(formData.get("soldeCommun") ?? 0);
  if (!Number.isFinite(soldeCommun)) throw new Error("Solde du compte commun invalide.");

  const current = await getParametres();
  await prisma.parametres.update({
    where: { id: current.id },
    data: { cleRepartition, soldeCommun },
  });
  revalidatePath("/parametres");
  revalidatePath("/");
  redirect("/parametres");
}
