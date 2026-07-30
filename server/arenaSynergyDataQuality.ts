import type {
  ArenaDataQuality,
  ArenaDataQualityCheck,
} from '../shared/arenaSynergyContract.js';

export type ArenaNormalizationProfile = {
  schemaValid: boolean;
  sourceRows: number;
  validRuns: number;
  invalidRuns: number;
  duplicateRuns: number;
  futureRuns: number;
  impossibleDecks: number;
  unknownCardReferences: number;
  totalCardReferences: number;
  maxClassShare: number;
  maxPlayerShare: number;
  sourceAgeHours: number | null;
  volumeRatioToPrevious: number | null;
};

function ratio(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

function check(
  id: string,
  label: string,
  status: ArenaDataQualityCheck['status'],
  value: number | string | null,
  threshold: string,
  message: string,
): ArenaDataQualityCheck {
  return { id, label, status, value, threshold, message };
}

export function assessArenaDataQuality(profile: ArenaNormalizationProfile): ArenaDataQuality {
  const invalidRate = ratio(profile.invalidRuns, profile.sourceRows);
  const duplicateRate = ratio(profile.duplicateRuns, profile.validRuns);
  const futureRate = ratio(profile.futureRuns, profile.sourceRows);
  const unknownRate = ratio(profile.unknownCardReferences, profile.totalCardReferences);
  const checks: ArenaDataQualityCheck[] = [
    check(
      'schema',
      'Структура источника',
      profile.schemaValid ? 'pass' : 'fail',
      profile.schemaValid ? 'decks[]' : 'missing',
      'обязателен массив decks',
      profile.schemaValid
        ? 'Структура источника распознана.'
        : 'Массив забегов отсутствует или изменил формат.',
    ),
    check(
      'minimum-valid-runs',
      'Достаточно валидных забегов',
      profile.validRuns >= 5 ? 'pass' : 'fail',
      profile.validRuns,
      'не менее 5',
      profile.validRuns >= 5
        ? 'Есть минимальная выборка для безопасного расчёта.'
        : 'Слишком мало валидных забегов для публикации нового расчёта.',
    ),
    check(
      'invalid-runs',
      'Невалидные забеги',
      invalidRate > 0.5 ? 'fail' : invalidRate > 0.1 ? 'warning' : 'pass',
      Math.round(invalidRate * 1_000) / 10,
      'предупреждение >10%, блокировка >50%',
      profile.invalidRuns
        ? `Отброшено ${profile.invalidRuns} записей с неполными или неверными полями.`
        : 'Все записи прошли обязательную нормализацию.',
    ),
    check(
      'duplicates',
      'Повторяющиеся draft_id',
      duplicateRate > 0.3 ? 'fail' : duplicateRate > 0.05 ? 'warning' : 'pass',
      Math.round(duplicateRate * 1_000) / 10,
      'предупреждение >5%, блокировка >30%',
      profile.duplicateRuns
        ? `Удалено ${profile.duplicateRuns} повторяющихся забегов.`
        : 'Повторяющиеся забеги не найдены.',
    ),
    check(
      'future-runs',
      'Будущие даты',
      futureRate > 0.1 ? 'fail' : profile.futureRuns > 0 ? 'warning' : 'pass',
      profile.futureRuns,
      '0, блокировка >10%',
      profile.futureRuns
        ? `Отброшено ${profile.futureRuns} забегов с датой из будущего.`
        : 'Будущие даты не найдены.',
    ),
    check(
      'impossible-decks',
      'Невозможные количества карт',
      profile.impossibleDecks > 0 ? 'warning' : 'pass',
      profile.impossibleDecks,
      '0',
      profile.impossibleDecks
        ? `Обнаружено ${profile.impossibleDecks} записей с невозможным размером или числом копий.`
        : 'Количество карт находится в безопасных границах.',
    ),
    check(
      'unknown-cards',
      'Карты вне справочника',
      unknownRate > 0.5 ? 'fail' : unknownRate > 0.1 ? 'warning' : 'pass',
      Math.round(unknownRate * 1_000) / 10,
      'предупреждение >10%, блокировка >50%',
      profile.unknownCardReferences
        ? `${profile.unknownCardReferences} ссылок на карты не найдены в текущем справочнике.`
        : 'Все карты найдены в текущем справочнике.',
    ),
    check(
      'class-skew',
      'Перекос по классу',
      profile.maxClassShare > 0.75 ? 'warning' : 'pass',
      Math.round(profile.maxClassShare * 1_000) / 10,
      'предупреждение >75%',
      profile.maxClassShare > 0.75
        ? 'Один класс доминирует в выборке; расчёт продолжает стратифицировать пары по классам.'
        : 'Распределение классов не превышает установленный порог.',
    ),
    check(
      'player-skew',
      'Перекос по игроку',
      profile.maxPlayerShare > 0.2 ? 'warning' : 'pass',
      Math.round(profile.maxPlayerShare * 1_000) / 10,
      'предупреждение >20%',
      profile.maxPlayerShare > 0.2
        ? 'Слишком большая доля забегов принадлежит одному игроку.'
        : 'Один игрок не доминирует в выборке.',
    ),
    check(
      'freshness',
      'Свежесть источника',
      profile.sourceAgeHours == null || profile.sourceAgeHours > 72
        ? 'fail'
        : profile.sourceAgeHours > 30
          ? 'warning'
          : 'pass',
      profile.sourceAgeHours == null ? null : Math.round(profile.sourceAgeHours * 10) / 10,
      'предупреждение >30 ч, блокировка >72 ч',
      profile.sourceAgeHours == null
        ? 'Источник не сообщил время обновления.'
        : `Источник обновлён ${Math.round(profile.sourceAgeHours * 10) / 10} ч назад.`,
    ),
  ];

  if (profile.volumeRatioToPrevious != null) {
    checks.push(check(
      'volume-drop',
      'Объём относительно прошлого расчёта',
      profile.volumeRatioToPrevious < 0.5 ? 'warning' : 'pass',
      Math.round(profile.volumeRatioToPrevious * 1000) / 10,
      'предупреждение <50%',
      profile.volumeRatioToPrevious < 0.5
        ? 'Объём входного потока резко снизился относительно прошлого расчёта этой когорты.'
        : 'Объём входного потока сопоставим с прошлым расчётом.',
    ));
  }

  const failures = checks.filter(item => item.status === 'fail').length;
  const warnings = checks.filter(item => item.status === 'warning').length;
  return {
    status: failures ? 'blocked' : warnings ? 'warning' : 'healthy',
    score: Math.max(0, 100 - failures * 30 - warnings * 8),
    metrics: {
      sourceRows: profile.sourceRows,
      validRuns: profile.validRuns,
      invalidRuns: profile.invalidRuns,
      duplicateRuns: profile.duplicateRuns,
      futureRuns: profile.futureRuns,
      impossibleDecks: profile.impossibleDecks,
      unknownCardReferences: profile.unknownCardReferences,
      totalCardReferences: profile.totalCardReferences,
      maxClassShare: profile.maxClassShare,
      maxPlayerShare: profile.maxPlayerShare,
      sourceAgeHours: profile.sourceAgeHours,
      volumeRatioToPrevious: profile.volumeRatioToPrevious,
    },
    checks,
  };
}
