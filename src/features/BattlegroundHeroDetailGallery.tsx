import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, Pause, Play, Volume2 } from 'lucide-react';
import { BattlegroundHeroImage } from './BattlegroundHeroDetailIdentity';
import { bgDetailImageSources } from './battlegroundHeroDetailMedia';
import type { BattlegroundHeroMediaItem, BattlegroundHeroSoundClip, BattlegroundHeroSoundGroup } from './battlegroundHeroDetailTypes';

function BattlegroundHeroSoundBoard({ soundGroups }: { soundGroups: BattlegroundHeroSoundGroup[] }) {
  const clips = useMemo(() => soundGroups.reduce<Array<BattlegroundHeroSoundClip & { heading: string; url: string }>>((acc, group) => {
    (group.clips || []).forEach(clip => {
      const url = String(clip.file_url || '').trim();
      if (!url) return;
      acc.push({
        ...clip,
        heading: group.heading || clip.group || 'Голос',
        url,
      });
    });
    return acc;
  }, []), [soundGroups]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [activeUrl, setActiveUrl] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => () => {
    audioRef.current?.pause();
    audioRef.current = null;
  }, []);

  const toggleClip = useCallback((clip: BattlegroundHeroSoundClip & { heading: string; url: string }) => {
    if (!clip.url) return;
    const currentAudio = audioRef.current;
    if (currentAudio && activeUrl === clip.url && isPlaying) {
      currentAudio.pause();
      setIsPlaying(false);
      return;
    }

    const audio = currentAudio || new Audio();
    audioRef.current = audio;
    if (audio.src !== clip.url) {
      audio.src = clip.url;
      audio.currentTime = 0;
    }
    audio.onended = () => setIsPlaying(false);
    audio.onpause = () => setIsPlaying(false);
    audio.onplay = () => setIsPlaying(true);
    setActiveUrl(clip.url);
    void audio.play().catch(() => setIsPlaying(false));
  }, [activeUrl, isPlaying]);

  if (!clips.length) return null;

  return (
    <div className="mt-5 rounded-2xl border border-[#e2cf99] bg-[#fff8ea]/78 p-3">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-hs text-xs uppercase tracking-[0.16em] text-[#8b6c42]">Голоса компаньона</p>
          <h4 className="font-hs text-lg text-[#3d2a1e]">Реплики и звуки</h4>
        </div>
        <p className="text-xs font-bold text-[#6b4c2a]">{clips.length} клипов</p>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-3">
        {clips.map(clip => {
          const active = activeUrl === clip.url;
          const playing = active && isPlaying;
          return (
            <div
              key={clip.url}
              className={`rounded-2xl border p-3 transition-colors ${
                active
                  ? 'border-[#b58a2f] bg-[linear-gradient(180deg,#fff4c8,#fffdf7)] shadow-[0_10px_22px_rgba(61,42,30,0.08)]'
                  : 'border-[#d7b66a]/70 bg-[#fffdf7]'
              }`}
            >
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  onClick={() => toggleClip(clip)}
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border text-[#3d2a1e] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#b58a2f] ${
                    playing
                      ? 'border-[#8b4513] bg-[#f6ce68]'
                      : 'border-[#d7b66a] bg-[#fff8ea] hover:bg-[#fff1c8]'
                  }`}
                  aria-label={`${playing ? 'Пауза' : 'Воспроизвести'}: ${clip.heading}`}
                >
                  {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 translate-x-px" />}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Volume2 className="h-4 w-4 shrink-0 text-[#8b6c42]" />
                    <p className="font-hs text-sm text-[#3d2a1e]">{clip.heading}</p>
                  </div>
                  <p className="mt-1 text-xs font-bold leading-snug text-[#6b4c2a]">{clip.description || clip.file_title || 'Звук'}</p>
                  {clip.file_title && (
                    <p className="mt-1 truncate text-[11px] font-semibold text-[#8b6c42]">{clip.file_title}</p>
                  )}
                </div>
              </div>
              <a
                href={clip.url}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-[#bfdbfe] bg-[#dbeafe] px-3 py-1.5 text-xs font-black text-[#1e3a8a] transition-colors hover:bg-[#c7dfff]"
              >
                Открыть WAV
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function BattlegroundHeroGallery({
  heroName,
  items,
  soundGroups,
  onOpen,
  tourId,
}: {
  heroName: string;
  items: BattlegroundHeroMediaItem[];
  soundGroups: BattlegroundHeroSoundGroup[];
  onOpen: (index: number) => void;
  tourId?: string;
}) {
  if (!items.length && !soundGroups.length) return null;
  return (
    <section className="bg-hero-ledger-panel rounded-2xl border border-[#d7b66a]/65 bg-[linear-gradient(180deg,#fffef9,#f4ead4)] p-4 shadow-[0_12px_28px_rgba(61,42,30,0.08)]">
      <div
        className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between"
        data-tour-id={tourId}
      >
        <div>
          <p className="font-hs text-xs uppercase tracking-[0.16em] text-[#8b6c42]">Галерея</p>
          <h3 className="font-hs text-xl text-[#3d2a1e]">{heroName}</h3>
        </div>
        <p className="text-xs font-bold text-[#6b4c2a]">{items.length} арта</p>
      </div>

      {items.length > 0 && (
        <div className="bg-hero-gallery mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {items.map((item, index) => (
            <button
              key={item.key}
              type="button"
              onClick={() => onOpen(index)}
              className="group rounded-2xl border border-[#e2cf99] bg-[#fff9ed] p-3 text-left shadow-sm transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_24px_rgba(61,42,30,0.08)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#b58a2f]"
            >
              <div className="aspect-[4/3] overflow-hidden rounded-xl bg-[radial-gradient(circle_at_top,#fff5d2,transparent_60%),linear-gradient(180deg,#fffdf8,#f2e1bc)]">
                <BattlegroundHeroImage
                  sources={bgDetailImageSources(item.image)}
                  alt={item.title}
                  className="h-full w-full"
                  imgClassName="h-full w-full object-cover drop-shadow-[0_10px_14px_rgba(61,42,30,0.16)] transition-transform duration-200 group-hover:scale-[1.025]"
                />
              </div>
              <p className="mt-2 font-hs text-xs uppercase tracking-[0.14em] text-[#8b6c42]">{item.kicker || 'Арт'}</p>
              <h4 className="mt-1 text-sm font-bold leading-tight text-[#3d2a1e]">{item.title}</h4>
            </button>
          ))}
        </div>
      )}

      <BattlegroundHeroSoundBoard soundGroups={soundGroups} />
    </section>
  );
}
