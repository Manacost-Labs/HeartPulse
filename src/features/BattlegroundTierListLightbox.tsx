import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { usePageScrollLock } from '../hooks/usePageScrollLock';
import { publicResourceUrl } from '../publicResourceUrl';
import type { BattlegroundLightboxItem } from './battlegroundTierListItems';

/**
 * The enlarged card of a Battlegrounds tier list, over the page: art, title, metric line and text, with
 * the previous and next entry of the list. `index` -1 is closed. Escape closes it, the arrows step.
 */
export function BattlegroundTierListLightbox({ items, index, onIndex, trinkets }: {
  items: BattlegroundLightboxItem[];
  index: number;
  onIndex: (index: number) => void;
  trinkets: boolean;
}) {
  const item = index >= 0 ? items[index] ?? null : null;
  usePageScrollLock(Boolean(item));
  useEffect(() => {
    if (!item) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onIndex(-1);
      if (event.key === 'ArrowLeft') onIndex(Math.max(0, index - 1));
      if (event.key === 'ArrowRight') onIndex(Math.min(items.length - 1, index + 1));
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [item, index, items.length, onIndex]);
  if (!item) return null;
  const onClose = () => onIndex(-1);
  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="bg-lightbox-title">
      <button className="bg-tier-lightbox-backdrop absolute inset-0 bg-black/72 backdrop-blur-sm" type="button" aria-label="Закрыть" onClick={() => onClose()} />
      <div className={`bg-tier-lightbox-frame relative grid max-h-[92vh] w-full gap-4 overflow-y-auto rounded-lg border border-[#d7b66a]/70 bg-[#18100a] p-4 text-[#f8ead0] shadow-2xl ${trinkets
        ? 'max-w-2xl md:grid-cols-[minmax(190px,280px)_1fr]'
        : 'max-w-4xl md:grid-cols-[minmax(220px,340px)_1fr]'}`}>
        <button
          type="button"
          aria-label="Закрыть"
          onClick={() => onClose()}
          className="absolute right-3 top-3 z-10 rounded-full border border-[#d7b66a]/50 bg-[#2a1a0f] p-2 text-[#f8ead0] transition-colors hover:bg-[#4a2a13]"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="bg-tier-lightbox-art flex items-center justify-center">
          <img
            src={publicResourceUrl(item.image)}
            alt={item.title}
            className={`max-h-[70vh] w-full object-contain drop-shadow-[0_12px_28px_rgba(0,0,0,0.65)] ${trinkets ? 'max-w-[288px]' : 'max-w-[360px]'}`}
          />
        </div>
        <div className="bg-tier-lightbox-copy flex min-w-0 flex-col justify-center pr-8">
          <p className="font-hs text-xs uppercase tracking-[0.18em] text-[#d7b66a]">{item.kicker}</p>
          <h3 id="bg-lightbox-title" className="mt-2 font-hs text-2xl leading-tight text-[#fff3c4] sm:text-3xl">{item.title}</h3>
          {item.meta && <p className="mt-3 text-sm font-semibold text-[#d9c287]">{item.meta}</p>}
          {item.text && <p className="mt-4 text-sm leading-relaxed text-[#f8ead0]/88">{item.text}</p>}
          {item.detailHref && (
            <a
              href={item.detailHref}
              className="mt-5 inline-flex w-fit items-center justify-center rounded-lg border border-[#d7b66a]/70 bg-[#f2d27a] px-4 py-2.5 font-hs text-sm text-[#24160c] shadow-[0_8px_18px_rgba(0,0,0,0.28)] transition-colors hover:bg-[#ffe29a] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#fff3c4]"
            >
              Подробнее о существе
            </a>
          )}
          {items.length > 1 && (
            <div className="mt-6 flex items-center gap-2">
              <button
                type="button"
                onClick={() => onIndex(Math.max(0, index - 1))}
                disabled={index <= 0}
                className="rounded-md border border-[#d7b66a]/50 px-3 py-2 text-sm font-bold text-[#fff3c4] transition-colors hover:bg-[#3d2a1e] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Назад
              </button>
              <span className="text-xs text-[#d9c287]">{index + 1} / {items.length}</span>
              <button
                type="button"
                onClick={() => onIndex(Math.min(items.length - 1, index + 1))}
                disabled={index >= items.length - 1}
                className="rounded-md border border-[#d7b66a]/50 px-3 py-2 text-sm font-bold text-[#fff3c4] transition-colors hover:bg-[#3d2a1e] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Вперед
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
