"use client";

import { useActionState, useEffect, useRef } from "react";
import { createCategorie, type EtatCategorie } from "@/app/actions/categories";
import { inputClass, selectClass, labelClass, buttonClass, mutedClass } from "@/lib/ui";

/** Formulaire d'ajout d'une catégorie ou d'une sous-catégorie (si une catégorie parente est choisie). */
export function CategorieAjout({
  parentsPossibles,
}: {
  parentsPossibles: { id: number; nom: string; type: "DEPENSE" | "REVENU" }[];
}) {
  const [etat, creer, enCours] = useActionState(createCategorie, { erreur: null } as EtatCategorie);
  const formRef = useRef<HTMLFormElement>(null);

  // Vide le formulaire après un ajout réussi (on garde la parente choisie pour enchaîner les sous-catégories).
  useEffect(() => {
    if (etat.ok && formRef.current) {
      const nom = formRef.current.elements.namedItem("nom") as HTMLInputElement | null;
      if (nom) {
        nom.value = "";
        nom.focus();
      }
    }
  }, [etat.ok]);

  return (
    <form ref={formRef} action={creer} className="mt-3 flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label className={labelClass} htmlFor="nom">
          Nom
        </label>
        <input className={inputClass} type="text" id="nom" name="nom" required />
      </div>
      <div className="flex flex-col gap-1">
        <label className={labelClass} htmlFor="type">
          Type
        </label>
        <select className={selectClass} id="type" name="type" defaultValue="DEPENSE">
          <option value="DEPENSE">Dépenses (charges, achats, dépenses du quotidien)</option>
          <option value="REVENU">Revenus exceptionnels (ventes, cadeaux…)</option>
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className={labelClass} htmlFor="parentId">
          Catégorie parente
        </label>
        <select className={selectClass} id="parentId" name="parentId" defaultValue="">
          <option value="">Aucune (catégorie principale)</option>
          {(["DEPENSE", "REVENU"] as const).map((type) => (
            <optgroup key={type} label={type === "DEPENSE" ? "Dépenses" : "Revenus"}>
              {parentsPossibles
                .filter((p) => p.type === type)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nom}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
        <p className={`text-xs ${mutedClass}`}>
          Choisis une parente pour créer une sous-catégorie, par exemple « Carburant » dans « Auto/Moto ». Une
          sous-catégorie prend le type de sa parente.
        </p>
      </div>
      {etat.erreur && <p className="text-sm text-neg">{etat.erreur}</p>}
      <button type="submit" className={`${buttonClass} self-start`} disabled={enCours}>
        Ajouter
      </button>
    </form>
  );
}
