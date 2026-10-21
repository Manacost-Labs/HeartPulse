/** Russian names shared by different archetypes across the whole admin table. */
export type ArchetypeLabelDuplicate = { nameRu: string; namesEn: string[] };

export function DuplicateLabelsNotice({ duplicates, onSearch }: {
  duplicates?: ArchetypeLabelDuplicate[];
  onSearch: (value: string) => void;
}) {
  if (!duplicates?.length) return null;
  return (
    <div className="admin-translation-duplicates" role="status">
      <strong>Одинаковые русские названия у разных архетипов: {duplicates.length}</strong>
      <ul>
        {duplicates.map(duplicate => (
          <li key={duplicate.nameRu}>
            <button type="button" onClick={() => onSearch(duplicate.nameRu)}>«{duplicate.nameRu}»</button>
            {' — '}{duplicate.namesEn.join(', ')}
          </li>
        ))}
      </ul>
    </div>
  );
}
