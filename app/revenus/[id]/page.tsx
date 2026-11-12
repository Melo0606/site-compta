import { notFound } from "next/navigation";
import Link from "next/link";
import { getRevenu, updateRevenu } from "@/app/actions/revenus";
import { getPersonnes } from "@/app/actions/personnes";
import { inputClass, labelClass, buttonClass, buttonSecondaryClass, sectionHeadingClass } from "@/lib/ui";
import { RevenuTypeFields } from "@/components/RevenuTypeFields";

export default async function EditRevenuPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [revenu, personnes] = await Promise.all([getRevenu(Number(id)), getPersonnes()]);
  if (!revenu) notFound();

  const updateWithId = updateRevenu.bind(null, revenu.id);
  const dateValue = revenu.date ? revenu.date.toISOString().slice(0, 10) : undefined;

  return (
    <section className="max-w-sm">
      <h2 className={sectionHeadingClass}>Modifier le revenu</h2>
      <form action={updateWithId} className="mt-3 flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label className={labelClass} htmlFor="libelle">
            Libellé
          </label>
          <input className={inputClass} type="text" id="libelle" name="libelle" defaultValue={revenu.libelle} required />
        </div>
        <div className="flex flex-col gap-1">
          <label className={labelClass} htmlFor="personneId">
            Personne
          </label>
          <select className={inputClass} id="personneId" name="personneId" defaultValue={revenu.personneId} required>
            {personnes.map((personne) => (
              <option key={personne.id} value={personne.id}>
                {personne.nom}
              </option>
            ))}
          </select>
        </div>
        <RevenuTypeFields
          defaultType={revenu.type}
          defaultDate={dateValue}
          defaultMoisRecurrence={revenu.moisRecurrence ?? undefined}
          defaultJourVersement={revenu.jourVersement ?? undefined}
        />
        <div className="flex flex-col gap-1">
          <label className={labelClass} htmlFor="montant">
            Montant (€)
          </label>
          <input
            className={inputClass}
            type="number"
            step="0.01"
            min="0"
            id="montant"
            name="montant"
            defaultValue={revenu.montant}
            required
          />
        </div>
        <div className="flex gap-2">
          <button type="submit" className={buttonClass}>
            Enregistrer
          </button>
          <Link href="/revenus" className={buttonSecondaryClass}>
            Annuler
          </Link>
        </div>
      </form>
    </section>
  );
}
