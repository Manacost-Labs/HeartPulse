import { ASSEMBLE_PLAYER_CLASSES } from '../model/cardAssemblePool';

/** «За какой класс играете?»: the pool of F3TCH3R depends on it. A second tap on the chosen class clears it. */
export function ClassChooser({ value, onChange }: { value: string | null; onChange: (next: string | null) => void }) {
  return (
    <div className="assemble-classes">
      <h3 className="assemble-title">За какой класс играете?</h3>
      <p className="assemble-classes__hint">У РЕ-3-ВЕР пул доноров зависит от класса. От выбора зависят основы в ленте и доноры в «Мне предложили».</p>
      <ul className="assemble-classes__list" aria-label="Класс игрока">
        {ASSEMBLE_PLAYER_CLASSES.map(item => (
          <li key={item.key}>
            <button type="button" aria-pressed={value === item.key} onClick={() => onChange(value === item.key ? null : item.key)}>
              <img src={`/class_icon/ui/${item.key.toLowerCase()}-96.webp`} alt="" loading="lazy" decoding="async" width={56} height={56} />
              <span>{item.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
