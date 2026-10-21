import type { CSSProperties, ReactNode } from 'react';
import type { PageTourMediaKind } from './pageTourModel';

type Delay = CSSProperties & { '--ptm-index'?: number; '--ptm-strength'?: string };

/** Position in the entrance; PageTour.css multiplies it by `--motion-stagger`. */
const delay = (index: number): Delay => ({ '--ptm-index': index });

function Frame({ children, label }: { children: ReactNode; label: string }) {
  return (
    <svg className="page-tour-media" viewBox="0 0 320 120" aria-hidden="true" focusable="false" data-media={label}>
      {children}
    </svg>
  );
}

function Filters() {
  const chips = [['Формат', 12, 70], ['Ранг', 88, 58], ['Период', 152, 70], ['Игр ≥ 100', 228, 80]] as const;
  return (
    <Frame label="filters">
      {chips.map(([text, x, width], index) => (
        <g key={text} className="ptm-fade" style={delay(index)}>
          <rect x={x} y="22" width={width} height="28" rx="14" className="ptm-chip" />
          <text x={x + width / 2} y="40" textAnchor="middle" className="ptm-label">{text}</text>
        </g>
      ))}
      <rect x="12" y="22" width="70" height="28" rx="14" className="ptm-chip-active ptm-slide" />
      <path d="M40 66v14h240V66" className="ptm-guide" />
      <path d="M160 80v12" className="ptm-guide" />
      <g className="ptm-fade" style={delay(5)}>
        <rect x="98" y="94" width="124" height="20" rx="3" className="ptm-panel" />
        <text x="160" y="108" textAnchor="middle" className="ptm-label">все цифры ниже</text>
      </g>
    </Frame>
  );
}

function Views() {
  return (
    <Frame label="views">
      <g className="ptm-cycle">
        <rect x="10" y="14" width="92" height="80" rx="4" className="ptm-panel" />
        {[0, 1, 2, 3].map(index => <rect key={index} x={18 + (index % 2) * 42} y={22 + Math.floor(index / 2) * 34} width="36" height="28" rx="3" className="ptm-chip" />)}
        <text x="56" y="110" textAnchor="middle" className="ptm-label">Карточки</text>
      </g>
      <g className="ptm-cycle is-second">
        <rect x="114" y="14" width="92" height="80" rx="4" className="ptm-panel" />
        {['S', 'A', 'B', 'C'].map((tier, index) => (
          <g key={tier}>
            <text x="126" y={33 + index * 18} textAnchor="middle" className="ptm-label is-strong">{tier}</text>
            <rect x="136" y={23 + index * 18} width={60 - index * 10} height="12" rx="2" className={index < 2 ? 'ptm-good' : 'ptm-even'} />
          </g>
        ))}
        <text x="160" y="110" textAnchor="middle" className="ptm-label">Тиры</text>
      </g>
      <g className="ptm-cycle is-third">
        <rect x="218" y="14" width="92" height="80" rx="4" className="ptm-panel" />
        {[0, 1, 2, 3, 4].map(index => <path key={index} d={`M226 ${28 + index * 14}h76`} className="ptm-row" />)}
        <text x="264" y="110" textAnchor="middle" className="ptm-label">Таблица</text>
      </g>
    </Frame>
  );
}

function Interval() {
  const rows = [
    { name: 'много игр', center: 214, half: 10, y: 30, low: false },
    { name: 'средне', center: 186, half: 26, y: 62, low: false },
    { name: 'мало', center: 200, half: 56, y: 94, low: true },
  ];
  return (
    <Frame label="interval">
      <path d="M160 14v96" className="ptm-guide is-dashed" />
      <text x="160" y="10" textAnchor="middle" className="ptm-caption">50%</text>
      {rows.map((row, index) => (
        <g key={row.name} className={row.low ? 'ptm-faded' : undefined}>
          <text x="12" y={row.y + 4} className="ptm-label">{row.name}</text>
          <rect x={row.center - row.half} y={row.y - 5} width={row.half * 2} height="10" rx="5"
            className={`ptm-band ptm-grow ${row.center > 160 ? 'is-good' : ''}`} style={delay(index)} />
          <circle cx={row.center} cy={row.y} r="5" className="ptm-dot ptm-fade" style={delay(index + 2)} />
          {row.low && <g className="ptm-fade" style={delay(5)}><rect x="270" y={row.y - 10} width="40" height="20" rx="10" className="ptm-tag" /><text x="290" y={row.y + 4} textAnchor="middle" className="ptm-label is-tag">мало</text></g>}
        </g>
      ))}
    </Frame>
  );
}

function Scatter() {
  const dots = [[70, 78, 6], [118, 52, 10], [176, 40, 16], [232, 66, 12], [270, 30, 8], [96, 90, 5]] as const;
  return (
    <Frame label="scatter">
      <path d="M30 10v96h280" className="ptm-axis" />
      <path d="M30 60h280" className="ptm-guide is-dashed" />
      <text x="304" y="56" textAnchor="end" className="ptm-caption">50%</text>
      <text x="304" y="118" textAnchor="end" className="ptm-caption">популярность →</text>
      <text x="36" y="18" className="ptm-caption">↑ винрейт</text>
      {dots.map(([x, y, r], index) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r={r} className={`ptm-bubble ptm-fade ${index === 2 ? 'ptm-pulse is-picked' : ''}`} style={delay(index)} />
      ))}
    </Frame>
  );
}

const HEAT = [
  [0.9, 0.3, -0.4, 0.6, -0.8],
  [-0.2, 0.7, 0.1, -0.6, 0.4],
  [0.5, -0.9, 0.8, 0.2, -0.3],
  [-0.7, 0.4, -0.1, 0.9, 0.6],
];

function Heat() {
  return (
    <Frame label="heat">
      {HEAT.flatMap((row, rowIndex) => row.map((value, column) => (
        <rect key={`${rowIndex}-${column}`} x={12 + column * 38} y={12 + rowIndex * 24} width="34" height="20" rx="2"
          className={`ptm-heat ptm-fade ${value >= 0 ? 'is-good' : 'is-bad'} ${rowIndex === 2 && column === 1 ? 'is-faint' : ''}`}
          style={{ ...delay(rowIndex + column), '--ptm-strength': Math.abs(value).toFixed(2) } as Delay} />
      )))}
      <text x="222" y="30" className="ptm-label">цвет клетки</text>
      {[-1, -0.5, 0, 0.5, 1].map((value, index) => (
        <rect key={value} x={222 + index * 18} y="40" width="18" height="12"
          className={`ptm-heat ${value >= 0 ? 'is-good' : 'is-bad'}`} style={{ '--ptm-strength': Math.abs(value).toFixed(2) } as Delay} />
      ))}
      <text x="222" y="66" className="ptm-caption">хуже</text>
      <text x="312" y="66" textAnchor="end" className="ptm-caption">лучше</text>
      <text x="267" y="80" textAnchor="middle" className="ptm-caption">50% — нейтрально</text>
    </Frame>
  );
}

function Band() {
  return (
    <Frame label="band">
      <path d="M20 60h290" className="ptm-guide is-dashed" />
      <path d="M20 26C70 36 100 30 140 46S220 62 300 48V72C220 82 190 74 140 66S70 92 20 98Z" className="ptm-band-area ptm-fade" />
      <path d="M20 62C70 64 100 60 140 56S220 66 300 60" className="ptm-line ptm-fade" style={delay(2)} />
      <path d="M180 12v100" className="ptm-guide is-dashed is-period ptm-fade" style={delay(4)} />
      <text x="184" y="22" className="ptm-caption">новый период</text>
      <text x="24" y="114" className="ptm-caption">мало игр — полоса шире</text>
    </Frame>
  );
}

function Impact() {
  const rows = [['Муллиган', 46], ['Добор', -30], ['Оставлена', 22]] as const;
  return (
    <Frame label="impact">
      <path d="M190 8v104" className="ptm-axis" />
      <text x="190" y="118" textAnchor="middle" className="ptm-caption">средний винрейт колоды</text>
      {rows.map(([name, value], index) => (
        <g key={name}>
          <text x="12" y={26 + index * 32} className="ptm-label">{name}</text>
          <rect x={value >= 0 ? 190 : 190 + value} y={16 + index * 32} width={Math.abs(value)} height="14" rx="2"
            className={`ptm-grow ${value >= 0 ? 'ptm-good is-from-start' : 'ptm-bad is-from-end'}`} style={delay(index)} />
          <text x={value >= 0 ? 196 + value : 184 + value} y={27 + index * 32} textAnchor={value >= 0 ? 'start' : 'end'} className="ptm-caption ptm-fade" style={delay(index + 2)}>
            {value >= 0 ? '+' : '−'}{(Math.abs(value) / 10).toFixed(1).replace('.', ',')} п.
          </text>
        </g>
      ))}
    </Frame>
  );
}

function Sankey() {
  const flows = [
    ['M64 22C150 22 170 30 256 30', 10, 'is-nerf'], ['M64 26C150 26 170 70 256 70', 4, 'is-nerf'],
    ['M64 60C150 60 170 36 256 36', 6, 'is-buff'], ['M64 64C150 64 170 96 256 96', 8, 'is-buff'],
    ['M64 98C150 98 170 76 256 76', 5, 'is-rework'],
  ] as const;
  return (
    <Frame label="sankey">
      {flows.map(([d, width, kind], index) => (
        <path key={d} d={d} strokeWidth={width} className={`ptm-flow ptm-fade ${kind}`} style={delay(index)} />
      ))}
      {[[16, 'нерф', 'is-nerf'], [56, 'баф', 'is-buff'], [94, 'иначе', 'is-rework']].map(([y, text, kind]) => (
        <g key={String(text)}><rect x="54" y={Number(y) - 4} width="10" height="16" className={`ptm-node ${kind}`} /><text x="48" y={Number(y) + 8} textAnchor="end" className="ptm-caption">{text}</text></g>
      ))}
      {[22, 64, 90].map((y, index) => (
        <g key={y}><rect x="256" y={y} width="10" height={index === 0 ? 20 : 14} className="ptm-node" /><text x="272" y={y + 11} className="ptm-caption">архетип</text></g>
      ))}
    </Frame>
  );
}

function Trend() {
  return (
    <Frame label="trend">
      <rect x="20" y="16" width="130" height="88" rx="4" className="ptm-panel" />
      <text x="32" y="38" className="ptm-caption">Винрейт</text>
      <text x="32" y="66" className="ptm-value">53,4%</text>
      <text x="32" y="88" className="ptm-label is-good">▲ 1,2 п. за сутки</text>
      <path d="M176 84l22-10 22 6 22-24 22 4 22-22 22 6" className="ptm-line ptm-fade" style={delay(1)} />
      <circle cx="308" cy="44" r="4" className="ptm-dot ptm-pulse" />
      <text x="176" y="108" className="ptm-caption">7 дней</text>
    </Frame>
  );
}

const MEDIA: Record<PageTourMediaKind, () => ReactNode> = {
  filters: Filters,
  views: Views,
  interval: Interval,
  scatter: Scatter,
  heat: Heat,
  band: Band,
  impact: Impact,
  sankey: Sankey,
  trend: Trend,
};

/** Decorative explainer: the step text says everything, the drawing shows how the number looks on the page. */
export default function PageTourMedia({ kind }: { kind: PageTourMediaKind }) {
  const Media = MEDIA[kind];
  return <Media />;
}
