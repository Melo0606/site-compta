import { getCategories } from "@/app/actions/categories";
import { selectClass, labelClass } from "@/lib/ui";
import { categoriesEnArbre } from "@/lib/categories";

/** Menu déroulant de catégorie, alimenté par la liste gérée dans /categories (chaque catégorie en gras, suivie de ses sous-catégories en retrait). */
export async function CategorieSelect({
  id,
  name = "categorieId",
  defaultValue,
  required = false,
  formHtmlId,
  hideLabel = false,
  type = "DEPENSE",
}: {
  id?: string;
  name?: string;
  defaultValue?: number | null;
  required?: boolean;
  /** Réfère un <form> externe (attribut HTML `form`), pour un champ placé hors du formulaire lui-même. */
  formHtmlId?: string;
  hideLabel?: boolean;
  /** Ne propose que les catégories de ce type (dépenses par défaut). */
  type?: "DEPENSE" | "REVENU";
}) {
  const categories = (await getCategories()).filter((c) => c.type === type);
  const selectId = id ?? name;

  return (
    <div className="flex flex-col gap-1">
      {!hideLabel && (
        <label className={labelClass} htmlFor={selectId}>
          Catégorie
        </label>
      )}
      <select
        className={selectClass}
        id={selectId}
        name={name}
        form={formHtmlId}
        defaultValue={defaultValue ?? ""}
        required={required}
      >
        {required ? (
          <option value="" disabled>
            Choisir une catégorie
          </option>
        ) : (
          <option value="">Sans catégorie</option>
        )}
        {categoriesEnArbre(categories).map(({ categorie, parent }) =>
          parent ? (
            // Sous-catégorie : en retrait sous sa catégorie (espaces insécables, seuls conservés dans une option).
            <option key={categorie.id} value={categorie.id} style={{ fontWeight: "normal" }}>
              {"    "}
              {categorie.nom}
            </option>
          ) : (
            <option key={categorie.id} value={categorie.id} style={{ fontWeight: "bold" }}>
              {categorie.nom}
            </option>
          ),
        )}
      </select>
    </div>
  );
}
