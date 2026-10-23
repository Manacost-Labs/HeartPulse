import { useId, type CSSProperties, type ReactNode, type SyntheticEvent } from 'react';
import './CardVariantSwitch.css';

export type CardVariantOption = {
  id: string;
  label: string;
  /** Short note next to the label, e.g. the golden stats «2/2». */
  note?: string;
  icon?: ReactNode;
};

/**
 * One row of card versions (Обычная · Золотая · Сигнатурная) with a thumb
 * that glides to the chosen one. Transform only, so it never moves layout;
 * reduced motion jumps.
 */
export function CardVariantSwitch({ options, value, onChange, label = 'Версия карты', tone = 'parchment' }: {
  options: CardVariantOption[];
  value: string;
  onChange: (id: string) => void;
  label?: string;
  /** `plate` on a dark header, `parchment` on a light page. */
  tone?: 'parchment' | 'plate';
}) {
  const labelId = useId();
  const index = Math.max(0, options.findIndex(option => option.id === value));
  const style = { '--variant-count': options.length, '--variant-index': index } as CSSProperties;
  return (
    <div className="card-variant-switch" data-tone={tone} style={style}>
      <span id={labelId} className="sr-only">{label}</span>
      <div role="radiogroup" aria-labelledby={labelId} className="card-variant-switch__track"
        onKeyDown={event => {
          const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
          if (!step) return;
          event.preventDefault();
          const next = options[(index + step + options.length) % options.length];
          onChange(next.id);
          (event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')[options.indexOf(next)])?.focus();
        }}>
        <span className="card-variant-switch__thumb" aria-hidden="true" />
        {options.map(option => {
          const selected = option.id === value;
          return (
            <button key={option.id} type="button" role="radio" aria-checked={selected} tabIndex={selected ? 0 : -1}
              className="card-variant-switch__option" onClick={() => onChange(option.id)}>
              {option.icon}
              <span>{option.label}</span>
              {option.note ? <small>{option.note}</small> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Every version of a card stacked in one box: all load up front, and a switch
 * only cross-fades opacity, so the new version is there at once and the box
 * keeps its size. The first image sizes the box; the others cover it.
 */
export function CardVariantImages({ images, value, alt, className, onError }: {
  /** `fallbacks` are tried in order by the caller's `onError` (as `data-fallbacks`). */
  images: Array<{ id: string; src: string; fallbacks?: string[] }>;
  value: string;
  alt: string;
  className?: string;
  onError?: (event: SyntheticEvent<HTMLImageElement>) => void;
}) {
  return (
    <span className={`card-variant-images${className ? ` ${className}` : ''}`}>
      {images.map((image, index) => {
        const active = image.id === value || (!images.some(item => item.id === value) && index === 0);
        return (
          <img key={image.id} src={image.src} alt={active ? alt : ''} aria-hidden={active ? undefined : true}
            data-active={active || undefined} data-sizer={index === 0 || undefined}
            data-fallbacks={image.fallbacks?.length ? image.fallbacks.join('|') : undefined}
            decoding="async" fetchPriority={index === 0 ? 'high' : 'low'}
            onError={onError} />
        );
      })}
    </span>
  );
}
