import { getCategories } from "@/app/actions/categories";
import { selectClass, labelClass } from "@/lib/ui";

/** Menu déroulant de catégorie, alimenté par la liste gérée dans /categories. */
export async function CategorieSelect({
  id,
  name = "categorieId",
  defaultValue,
  required = false,
  formHtmlId,
  hideLabel = false,
}: {
  id?: string;
  name?: string;
  defaultValue?: number | null;
  required?: boolean;
  /** Réfère un <form> externe (attribut HTML `form`), pour un champ placé hors du formulaire lui-même. */
  formHtmlId?: string;
  hideLabel?: boolean;
}) {
  const categories = await getCategories();
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
        {categories.map((categorie) => (
          <option key={categorie.id} value={categorie.id}>
            {categorie.nom}
          </option>
        ))}
      </select>
    </div>
  );
}
