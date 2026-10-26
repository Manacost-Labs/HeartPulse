import { useEffect, useRef, useState, type RefObject } from 'react';
import { ArrowLeftRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { publicResourceImageUrl } from '../publicResourceUrl';
import { cachedDeckRender, requestDeckRender } from './deckrender/deckRenderClient';

export type Build = { deckCode: string; games: number | null; winrate: number | null };
export type Side = 'left' | 'right';

const number = (value: number, digits = 0) => value.toLocaleString('ru-RU', { maximumFractionDigits: digits, minimumFractionDigits: digits });
export const percent = (value: number | null) => value === null || !Number.isFinite(value) ? '—' : `${number(value, 1)}%`;
export const count = (value: number | null) => value === null || !Number.isFinite(value) ? '—' : number(Math.round(value));
/** The gallery renders each build under this name, so the picker reuses its cached render. */
const renderName = (archetype: string, index: number) => `${archetype} — сборка ${index + 1}`;

/** The build's parchment render, requested once the picker card scrolls near the viewport. */
function useDeckThumbnail(deckCode: string, deckName: string) {
  const ref = useRef<HTMLSpanElement>(null);
  const [url, setUrl] = useState(() => cachedDeckRender(deckCode, deckName)?.previewImageUrl ?? '');
  useEffect(() => {
    const target = ref.current;
    if (url || !target) return undefined;
    let active = true;
    const load = () => requestDeckRender(deckCode, deckName).then(asset => { if (active) setUrl(asset.previewImageUrl); }).catch(() => undefined);
    if (typeof IntersectionObserver === 'undefined') { void load(); return () => { active = false; }; }
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      void load();
    }, { rootMargin: '200px' });
    observer.observe(target);
    return () => { active = false; observer.disconnect(); };
  }, [deckCode, deckName, url]);
  return { ref, src: url ? publicResourceImageUrl(url, { width: 240 }) : '' };
}

function BuildPickCard({ build, index, archetype, side, onPick }: {
  build: Build; index: number; archetype: string; side: Side | null; onPick: (side: Side) => void;
}) {
  const thumbnail = useDeckThumbnail(build.deckCode, renderName(archetype, index));
  const label = `Сборка #${index + 1}`;
  return <li className="build-pick" data-side={side ?? undefined}>
    <button type="button" className="build-pick__body" aria-label={`${label}: сравнить справа`} aria-pressed={side === 'right'}
      disabled={side === 'left'} onClick={() => onPick('right')}>
      <span ref={thumbnail.ref} className="build-pick__thumb">
        {thumbnail.src ? <img src={thumbnail.src} alt="" width="120" height="80" loading="lazy" decoding="async" /> : null}
      </span>
      <span className="build-pick__number">#{index + 1}</span>
      <span className="build-pick__stats"><b>{percent(build.winrate)}</b><small>{count(build.games)} игр</small></span>
    </button>
    <span className="build-pick__sides" role="group" aria-label={`${label}: сторона сравнения`}>
      <button type="button" data-side="left" aria-pressed={side === 'left'} aria-label={`${label} слева (A)`} onClick={() => onPick('left')}>A</button>
      <button type="button" data-side="right" aria-pressed={side === 'right'} aria-label={`${label} справа (Б)`} onClick={() => onPick('right')}>Б</button>
    </span>
  </li>;
}

/** Whether the strip hides cards before or after the visible ones. */
function useHiddenCards(ref: RefObject<HTMLOListElement | null>) {
  const [hidden, setHidden] = useState({ before: false, after: false });
  useEffect(() => {
    const list = ref.current;
    if (!list) return undefined;
    const measure = () => {
      const before = list.scrollLeft > 4;
      const after = list.scrollLeft < list.scrollWidth - list.clientWidth - 4;
      setHidden(previous => previous.before === before && previous.after === after ? previous : { before, after });
    };
    measure();
    list.addEventListener('scroll', measure, { passive: true });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(list);
    return () => { list.removeEventListener('scroll', measure); observer?.disconnect(); };
  }, [ref]);
  return hidden;
}

/**
 * The builds as a strip of cards, A and Б marked by their colour. The strip fades where cards
 * are hidden; the arrows page it with a mouse, while keyboard focus and touch scroll it natively.
 */
export function BuildPicker({ builds, archetype, sides, onPick, onSwap }: {
  builds: readonly Build[]; archetype: string; sides: [number, number];
  onPick: (index: number, side: Side) => void; onSwap: () => void;
}) {
  const listRef = useRef<HTMLOListElement>(null);
  const hidden = useHiddenCards(listRef);
  const page = (direction: -1 | 1) => {
    const list = listRef.current;
    if (!list) return;
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    list.scrollBy({ left: direction * Math.max(160, list.clientWidth * 0.8), behavior: still ? 'auto' : 'smooth' });
  };
  const [left, right] = sides;
  return <div className="build-picker-block">
    <div className="build-picker-bar">
      <span className="build-picker-bar__pair" aria-live="polite">
        <b data-side="left">A · #{left + 1}</b>
        <button type="button" className="build-picker-bar__swap" onClick={onSwap} aria-label="Поменять A и Б местами" title="Поменять A и Б местами">
          <ArrowLeftRight size={16} aria-hidden="true" />
        </button>
        <b data-side="right">Б · #{right + 1}</b>
      </span>
    </div>
    <div className="build-picker-frame" data-before={hidden.before || undefined} data-after={hidden.after || undefined}>
      <ol ref={listRef} className="build-picker" aria-label="Выберите сборки: A — слева, Б — справа">
        {builds.map((build, index) => <BuildPickCard key={build.deckCode} build={build} index={index} archetype={archetype}
          side={index === left ? 'left' : index === right ? 'right' : null} onPick={side => onPick(index, side)} />)}
      </ol>
      {hidden.before ? <button type="button" className="build-picker__page" data-direction="before" tabIndex={-1} aria-hidden="true"
        onClick={() => page(-1)}><ChevronLeft size={20} /></button> : null}
      {hidden.after ? <button type="button" className="build-picker__page" data-direction="after" tabIndex={-1} aria-hidden="true"
        onClick={() => page(1)}><ChevronRight size={20} /></button> : null}
    </div>
  </div>;
}
