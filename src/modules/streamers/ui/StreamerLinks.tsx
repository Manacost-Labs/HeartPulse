import { Send, Twitch, Twitter, Youtube, type LucideIcon } from 'lucide-react';
import type { StreamerLink } from '../model/types';

const SHOWN: Partial<Record<StreamerLink['kind'], { icon: LucideIcon; label: string }>> = {
  twitch: { icon: Twitch, label: 'Twitch' },
  youtube: { icon: Youtube, label: 'YouTube' },
  x: { icon: Twitter, label: 'X' },
  telegram: { icon: Send, label: 'Telegram' },
};

/** Каналы стримера: Twitch, YouTube, X и Telegram, если они указаны на Twitch. */
export function StreamerLinks({ links, name }: { links: StreamerLink[]; name: string }) {
  const shown = links.flatMap(link => {
    const look = SHOWN[link.kind];
    return look ? [{ ...link, ...look }] : [];
  });
  if (!shown.length) return null;
  return <ul className="streamers-links" aria-label={`Каналы ${name}`}>
    {shown.map(({ icon: Icon, label, ...link }) => {
      return <li key={link.kind}>
        <a href={link.url} target="_blank" rel="noopener noreferrer nofollow" className="streamers-link" data-kind={link.kind}
          aria-label={`${name} в ${label}`} title={label}>
          <Icon aria-hidden="true" />
        </a>
      </li>;
    })}
  </ul>;
}
