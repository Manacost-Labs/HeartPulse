import { useState } from 'react';
import { plotPoints, type ProfilePoint } from '../model/playerProfile';

const WIDTH = 320;
const HEIGHT = 72;
const PAD = 8;

/**
 * Мини-график карточки игрока: линия места (первое место сверху, шкала
 * логарифмическая) или рейтинга. Выбранная точка — последняя или та, на
 * которую навели или нажали; её подпись видна без наведения, поэтому
 * подсказка не единственный источник числа.
 */
export function LeaderboardPlayerChart({ points, rating, title }: {
  points: ProfilePoint[];
  /** Рисуется рейтинг; иначе место. */
  rating: boolean;
  title: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const coords = plotPoints(points.map(point => point.value), { width: WIDTH, height: HEIGHT, pad: PAD, rank: !rating });
  const selected = active !== null && active < points.length ? active : points.length - 1;
  const current = points[selected];
  if (!current) return null;
  const line = coords.map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ');

  return <figure className="leaderboards-spark">
    <figcaption className="leaderboards-spark__head">
      <span className="leaderboards-label">{title}</span>
      <span className="leaderboards-spark__value">
        <strong>{current.detail}</strong> <span className="leaderboards-muted">{current.label}</span>
      </span>
    </figcaption>
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="leaderboards-spark__plot" role="img"
      aria-label={`${title}: ${points.map(point => `${point.label} — ${point.detail}`).join('; ')}`}
      onPointerLeave={() => setActive(null)}>
      <line x1={0} x2={WIDTH} y1={HEIGHT - 1} y2={HEIGHT - 1} className="leaderboards-spark__axis" />
      <path d={line} className="leaderboards-spark__line" />
      {coords.map((point, index) => <g key={points[index].key}>
        <circle cx={point.x} cy={point.y} r={index === selected ? 4.5 : 2.5}
          className={index === selected ? 'leaderboards-spark__dot is-selected' : 'leaderboards-spark__dot'} />
        {/* Широкая невидимая полоса — цель наведения и касания для точки. */}
        <rect x={point.x - Math.max(6, WIDTH / points.length / 2)} y={0} width={Math.max(12, WIDTH / points.length)} height={HEIGHT}
          className="leaderboards-spark__hit" onPointerEnter={() => setActive(index)} onPointerDown={() => setActive(index)}>
          <title>{`${points[index].label}: ${points[index].detail}`}</title>
        </rect>
      </g>)}
    </svg>
    <div className="leaderboards-spark__ticks" aria-hidden="true">
      <span>{points[0].tick}</span><span>{points[points.length - 1].tick}</span>
    </div>
  </figure>;
}
