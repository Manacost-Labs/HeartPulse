import { useMemo, useState } from 'react';
import '../vendor/varylo-ui/styles/index.css';
import { MatchupMatrix, type MatchupMatrixLabels } from '../vendor/varylo-ui/gaming/MatchupMatrix';
import { PortalContainerContext } from '../vendor/varylo-ui/primitives/Portal';
import {
  confidenceOfRank, gamesConfidence, standardMatrix, type StandardMatchupsData,
} from '../modules/standardMatchups/public';
import { standardMetaPeriodLabel } from './standardMetaFilterModel';
import type { StandardMetaPeriod } from '../../shared/standardMetaContract';
import './StandardMatchupMatrix.css';

const CONFIDENCE_LABEL = { low: 'точность низкая', medium: 'точность средняя', high: 'надёжно' };

function matrixLabels(minSample: number | null, counted: boolean): Partial<MatchupMatrixLabels> {
  const sample = minSample ? `от ${minSample} игр` : '';
  return {
    title: 'Ваш архетип',
    picker: 'Ваш архетип',
    corner: 'Архетип против',
    overall: 'Против меты',
    best: 'Лучше всего против',
    worst: 'Хуже всего против',
    listTitle: archetype => `${archetype} против соперников`,
    cell: (archetype, opponent, rate, games) => `${archetype} против ${opponent}: ${rate}, ${games}`,
    noData: (archetype, opponent) => `${archetype} против ${opponent}: ${minSample
      ? `меньше ${minSample} игр${counted ? '' : ', источник не публикует винрейт'}` : 'нет данных'}`,
    mirror: archetype => `${archetype} в зеркале: 50% по определению`,
    overallCell: (archetype, rate) => `${archetype} против меты: ${rate}`,
    versus: (archetype, opponent) => `${archetype} — ${opponent}`,
    // `games` is the pair's games, or its confidence rank in payloads without them (see model/matrix.ts).
    games: value => counted
      ? `${value} игр · ${CONFIDENCE_LABEL[gamesConfidence(Number(value.replace(/\D/g, '')))]}`
      : [sample, CONFIDENCE_LABEL[confidenceOfRank(Number(value))]].filter(Boolean).join(' · '),
    lowSample: 'редкая пара',
    favoured: 'Выгодно',
    unfavoured: 'Невыгодно',
    even: 'Ровно',
    better: 'Лучше',
    worse: 'Хуже',
    pick: 'Наведите на клетку или пройдите по таблице стрелками, чтобы прочитать матчап.',
    instructions: 'Стрелки переходят между клетками, Home и End — к краям строки. Название строки выбирает ваш архетип.',
  };
}

export type StandardMatchupMatrixProps = {
  data: StandardMatchupsData;
  /** Russian name of an archetype: the API label, else the page's fallback dictionary. */
  labelOf: (name: string, label?: string) => string;
  /** Archetype name of the reader's deck. */
  selected: string;
  onSelectedChange: (archetype: string) => void;
};

/**
 * The VaryloUI matchup matrix on the parchment: class icons, Russian names and
 * the reader's archetype. Pairs below the source's sample stay empty; pairs of
 * two rare archetypes are muted and left out of the best/worst summary.
 */
export default function StandardMatchupMatrix({ data, labelOf, selected, onSelectedChange }: StandardMatchupMatrixProps) {
  const matrix = useMemo(() => standardMatrix(data, labelOf), [data, labelOf]);
  const champions = useMemo(() => matrix.archetypes.map(archetype => ({
    id: archetype.id,
    name: archetype.name,
    share: archetype.share,
    image: archetype.classKey ? `/class_icon/ui/${archetype.classKey}-64.webp` : undefined,
  })), [matrix.archetypes]);
  const labels = useMemo(() => matrixLabels(matrix.minSample, matrix.counted), [matrix.minSample, matrix.counted]);
  const periodLabel = data.period ? standardMetaPeriodLabel(data.period as StandardMetaPeriod) : '';
  // Picker options open inside this scope, so they read the parchment tokens.
  const [layer, setLayer] = useState<HTMLDivElement | null>(null);

  return <div className="standard-matchup-matrix">
    <PortalContainerContext.Provider value={layer}>
      <MatchupMatrix champions={champions} matchups={matrix.pairs} selected={selected}
        onSelectedChange={onSelectedChange} minGames={matrix.minGames} headingLevel={3} locale="ru-RU"
        labels={labels}
        subtitle={[data.formatLabel, data.rankLabel, periodLabel].filter(Boolean).join(' · ') + (matrix.counted
          ? `. Пустые клетки — меньше ${matrix.minSample ?? 1} игр, приглушены пары, где меньше 100 игр.`
          : '. Пустые клетки — мало игр, приглушены пары редких архетипов.')} />
    </PortalContainerContext.Provider>
    <div ref={setLayer} className="standard-matchup-matrix__layer" />
  </div>;
}
