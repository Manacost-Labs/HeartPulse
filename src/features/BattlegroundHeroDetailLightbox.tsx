import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { usePageScrollLock } from '../hooks/usePageScrollLock';
import { useOverlayFade } from '../hooks/useOverlayFade';
import { BattlegroundHeroImage } from './BattlegroundHeroDetailIdentity';
import { bgDetailImageSources } from './battlegroundHeroDetailMedia';
import type { BattlegroundHeroMediaItem } from './battlegroundHeroDetailTypes';

function BattlegroundHeroMediaLightboxArt({ item }: { item: BattlegroundHeroMediaItem }) {
  return (
    <div className="bg-hero-media-lightbox-art flex items-center justify-center rounded-[24px] border border-[#e2cf99] bg-[radial-gradient(circle_at_top,#fff8de,transparent_58%),linear-gradient(180deg,#fff9ef,#f0e0bf)] p-3">
      <BattlegroundHeroImage
        sources={bgDetailImageSources(item.image)}
        alt={item.title}
        className="w-full max-w-[320px]"
        imgClassName="w-full h-auto object-contain drop-shadow-[0_18px_28px_rgba(0,0,0,0.28)]"
        fallback={
          <div className="flex h-[360px] items-center justify-center rounded-2xl bg-[#f3ead3] px-4 text-center font-hs text-[#6b4c2a]">
            {item.title}
          </div>
        }
      />
    </div>
  );
}

function BattlegroundHeroMediaLightboxCopy({
  item,
  items,
  index,
  onIndexChange,
}: {
  item: BattlegroundHeroMediaItem;
  items: BattlegroundHeroMediaItem[];
  index: number;
  onIndexChange: (next: number) => void;
}) {
  return (
    <div className="bg-hero-media-lightbox-copy flex min-w-0 flex-col justify-center">
      {item.kicker && <p className="font-hs text-xs uppercase tracking-[0.18em] text-[#8b6c42]">{item.kicker}</p>}
      <h3 className="mt-2 font-hs text-2xl leading-tight text-[#3d2a1e] sm:text-3xl">{item.title}</h3>
      {item.meta && <p className="mt-3 text-sm font-semibold text-[#6b4c2a]">{item.meta}</p>}
      {item.text && <p className="mt-4 text-sm leading-relaxed text-[#4a3018]">{item.text}</p>}
      {item.link && (
        <a
          href={item.link}
          target="_blank"
          rel="noreferrer"
          className="mt-5 inline-flex items-center justify-center rounded-xl border border-[#d7b66a] bg-[#fff5d2] px-4 py-2 text-sm font-bold text-[#3d2a1e] transition-colors hover:bg-[#fff0bf]"
        >
          Открыть источник
        </a>
      )}
      {items.length > 1 && (
        <div className="mt-6 flex items-center gap-2">
          <button
            type="button"
            onClick={() => onIndexChange((index - 1 + items.length) % items.length)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#d7b66a] bg-[#fff8ea] text-[#3d2a1e] transition-colors hover:bg-[#fff1c8]"
            aria-label="Предыдущий объект"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="flex gap-1.5">
            {items.map((entry, entryIndex) => (
              <button
                key={entry.key}
                type="button"
                onClick={() => onIndexChange(entryIndex)}
                className="h-2.5 rounded-full transition-[width,background-color]"
                style={{
                  width: entryIndex === index ? 28 : 10,
                  background: entryIndex === index ? '#8b4513' : '#d7b66a',
                }}
                aria-label={`Перейти к объекту ${entryIndex + 1}`}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => onIndexChange((index + 1) % items.length)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#d7b66a] bg-[#fff8ea] text-[#3d2a1e] transition-colors hover:bg-[#fff1c8]"
            aria-label="Следующий объект"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      )}
    </div>
  );
}

/** Loaded on the first click on a hero card or art: the detail page renders without it. */
export function BattlegroundHeroMediaLightbox({
  items,
  index,
  onClose,
  onIndexChange,
}: {
  items: BattlegroundHeroMediaItem[];
  index: number;
  onClose: () => void;
  onIndexChange: (next: number) => void;
}) {
  const { ref: fadeRef, shown: visible, close } = useOverlayFade<HTMLDivElement>(onClose, 600);
  const touchOrigin = useRef<{ x: number; y: number } | null>(null);
  const item = items[index] || null;
  usePageScrollLock(Boolean(item));

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
      if (event.key === 'ArrowLeft' && items.length > 1) onIndexChange((index - 1 + items.length) % items.length);
      if (event.key === 'ArrowRight' && items.length > 1) onIndexChange((index + 1) % items.length);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [index, items.length, close, onIndexChange]);

  if (!item) return null;

  return createPortal(
    <div
      ref={fadeRef}
      className="bg-hero-media-lightbox"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.2s ease',
        WebkitTapHighlightColor: 'transparent',
      }}
      onClick={close}
      onTouchStart={event => {
        const touch = event.touches[0];
        touchOrigin.current = { x: touch.clientX, y: touch.clientY };
      }}
      onTouchEnd={event => {
        if (!touchOrigin.current) return;
        const touch = event.changedTouches[0];
        const moved = Math.hypot(touch.clientX - touchOrigin.current.x, touch.clientY - touchOrigin.current.y);
        touchOrigin.current = null;
        if (moved < 12) {
          event.preventDefault();
          close();
        }
      }}
    >
      <div
        className="bg-hero-media-lightbox-backdrop"
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(8,16,32,0.84)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
        }}
      />

      <div
        className="bg-hero-media-lightbox-panel grid gap-5 rounded-[28px] border border-[#d7b66a]/55 bg-[linear-gradient(180deg,#fffdf8,#f4ead4)] p-4 shadow-[0_28px_80px_rgba(0,0,0,0.42)] lg:grid-cols-[minmax(260px,360px)_minmax(280px,420px)] lg:p-5"
        style={{
          position: 'relative',
          zIndex: 1,
          width: 'min(96vw, 900px)',
          maxHeight: '90dvh',
          overflowY: 'auto',
          transform: visible ? 'scale(1) translateY(0)' : 'scale(0.86) translateY(20px)',
          transition: 'transform 0.24s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
        onClick={event => event.stopPropagation()}
        onTouchStart={event => event.stopPropagation()}
        onTouchEnd={event => event.stopPropagation()}
      >
        <BattlegroundHeroMediaLightboxArt item={item} />

        <BattlegroundHeroMediaLightboxCopy item={item} items={items} index={index} onIndexChange={onIndexChange} />
      </div>

      <button
        type="button"
        onClick={event => {
          event.stopPropagation();
          close();
        }}
        className="hs-lightbox-close absolute right-4 top-4 z-[2] flex h-11 w-11 items-center justify-center rounded-full border border-white/25 bg-black/20 text-white transition-colors hover:bg-black/35"
        aria-label="Закрыть"
      >
        <X className="h-5 w-5" />
      </button>
    </div>,
    document.body,
  );
}
