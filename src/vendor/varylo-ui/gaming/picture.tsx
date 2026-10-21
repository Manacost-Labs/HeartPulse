'use client';

import { isValidElement, useState, type CSSProperties, type ReactNode } from 'react';
import { cx } from '../primitives';
import type { GameImageSource, GameRole } from './game';
import { gameToneColor, type GameTone } from './tone';
import './game.css';

/** One or two letters for a name: the first letters of two words, else the first two letters ("Кай'Са" → КС, "Ари" → Ар). */
export function gameInitials(name: string): string {
  const words = name.trim().split(/[\s'’.\-_]+/u).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length > 1) return (Array.from(words[0])[0] + Array.from(words[1])[0]).toLocaleUpperCase();
  const letters = Array.from(words[0]);
  return letters[0].toLocaleUpperCase() + (letters[1] ?? '').toLocaleLowerCase();
}

const isNode = (src: GameImageSource): src is ReactNode => src != null && src !== false && src !== '' && typeof src !== 'string';

interface GameImageProps {
  /** Image URL or node; empty shows the initials plate. */
  src?: GameImageSource;
  /** Alt text of the image. Empty (default) when the name is written next to the picture. */
  alt?: string;
  /** Source of the fallback initials. */
  name: string;
  /** Fallback text instead of the initials of `name`, e.g. a team tag. */
  initials?: string;
  /** Hue of the fallback plate. */
  color?: GameTone | (string & {});
  /** Intrinsic size of an image URL in px, so the box is reserved before it loads. The CSS sets the shown size. */
  size: number;
  shape?: 'square' | 'circle';
  className?: string;
  style?: CSSProperties;
}

/**
 * A fixed-size picture box: a lazily loaded image, any node, or — without a source or when the image fails —
 * the initials on a plate tinted with `color`.
 */
export function GameImage({ src, alt = '', name, initials, color, size, shape = 'square', className, style }: GameImageProps) {
  const [failed, setFailed] = useState<string | null>(null);
  const url = typeof src === 'string' && src !== '' && failed !== src ? src : null;
  const node = !url && src !== undefined && isNode(src) ? src : null;
  const fallback = !url && !node;
  return (
    <span
      className={cx('ui-game-image', className)}
      data-shape={shape === 'circle' ? 'circle' : undefined}
      data-fallback={fallback || undefined}
      role={fallback && alt ? 'img' : undefined}
      aria-label={fallback && alt ? alt : undefined}
      aria-hidden={fallback && !alt ? true : undefined}
      style={{ '--_hue': gameToneColor(color), ...style } as CSSProperties}
    >
      {url ? (
        <img src={url} alt={alt} width={size} height={size} loading="lazy" decoding="async" draggable={false} onError={() => setFailed(url)} />
      ) : node ? (
        isValidElement(node) ? node : <span className="ui-game-image__node">{node}</span>
      ) : (
        <span className="ui-game-image__initials" data-long={(initials ?? '').length > 2 || undefined}>
          {initials || gameInitials(name)}
        </span>
      )}
    </span>
  );
}

/** The role badge on a portrait: the role icon, else its short letters on the role colour. Decorative. */
export function GameRoleBadge({ role, className }: { role: GameRole; className?: string }) {
  const icon = role.icon;
  return (
    <span
      className={cx('ui-game-role', className)}
      data-icon={icon ? true : undefined}
      aria-hidden="true"
      style={{ '--_hue': gameToneColor(role.color ?? 'gray') } as CSSProperties}
    >
      {typeof icon === 'string' ? <img src={icon} alt="" width={16} height={16} loading="lazy" decoding="async" draggable={false} /> : icon || (role.short ?? Array.from(role.label)[0] ?? '')}
    </span>
  );
}

/** Options of a role filter: "all", then every role with its icon. */
export function roleFilterOptions(roles: readonly GameRole[], allLabel: string) {
  return [
    { value: '', label: allLabel },
    ...roles.map((role) => ({
      value: role.id,
      label: role.label,
      icon:
        typeof role.icon === 'string' ? (
          <img className="ui-game-role-icon" src={role.icon} alt="" width={16} height={16} loading="lazy" decoding="async" draggable={false} />
        ) : (
          role.icon || undefined
        ),
    })),
  ];
}
