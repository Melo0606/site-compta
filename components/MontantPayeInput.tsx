import { setMontantPayeCharge } from "@/app/actions/mois";
import { inputClass, buttonSecondarySmallClass } from "@/lib/ui";

export function MontantPayeInput({
  annee,
  mois,
  chargeId,
  montantActuel,
}: {
  annee: number;
  /** Format stocké en base : 1-12 (janvier = 1). */
  mois: number;
  chargeId: number;
  montantActuel: number;
}) {
  const setMontantWithId = setMontantPayeCharge.bind(null, annee, mois, chargeId);

  return (
    <form action={setMontantWithId} className="flex items-center gap-1">
      <input
        className={`${inputClass} w-24`}
        type="number"
        step="0.01"
        min="0"
        name="montant"
        defaultValue={montantActuel || undefined}
        placeholder="0"
      />
      <button type="submit" className={buttonSecondarySmallClass}>
        OK
      </button>
    </form>
  );
}
