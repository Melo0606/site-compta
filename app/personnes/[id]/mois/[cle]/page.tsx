import { redirect } from "next/navigation";

/** Cet écran vit désormais en onglet dans la page du mois commun. */
export default async function PersonneMoisRedirectPage({
  params,
}: {
  params: Promise<{ id: string; cle: string }>;
}) {
  const { id, cle } = await params;
  redirect(`/mois/${cle}?tab=personne-${id}`);
}
