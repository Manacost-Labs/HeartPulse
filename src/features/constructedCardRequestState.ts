export type ConstructedCardSurface = 'list' | 'detail';

export type ConstructedCardRequestErrorCopy = {
  title: string;
  message: string;
  retry: boolean;
  notFound: boolean;
};

export function constructedCardRequestError(
  surface: ConstructedCardSurface,
  status: number,
  _serverMessage: string,
): ConstructedCardRequestErrorCopy {
  if (surface === 'detail' && status === 404) {
    return {
      title: 'Карта не найдена',
      message: 'Проверьте адрес карты или вернитесь в библиотеку.',
      retry: false,
      notFound: true,
    };
  }
  return {
    title: surface === 'detail'
      ? 'Данные карты временно недоступны'
      : 'Библиотека карт временно недоступна',
    message: status === 503
      ? 'Сервис обновляется. Повторите попытку через минуту.'
      : 'Не удалось получить данные. Проверьте соединение и повторите попытку.',
    retry: true,
    notFound: false,
  };
}

export function constructedCardDataNotice(value: {
  dataStatus?: unknown;
  partial?: unknown;
  warning?: unknown;
}): string | null {
  const warning = typeof value.warning === 'string' ? value.warning.trim() : '';
  const notices: string[] = [];
  if (value.partial === true && !/часть подробной информации/i.test(warning)) {
    notices.push('Часть подробной информации временно недоступна. Основные данные карты восстановлены из библиотеки.');
  } else if (value.dataStatus === 'stale' && !/последн\w* сохран[её]нн/i.test(warning)) {
    notices.push('Показываем последнюю сохранённую версию данных. Новое обновление уже запрашивается.');
  }
  if (warning) notices.push(warning);
  return notices.filter((notice, index, values) => values.indexOf(notice) === index).join(' ') || null;
}
