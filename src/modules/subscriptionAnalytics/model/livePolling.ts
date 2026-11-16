/** Всё, что опросу нужно от окружения; в тестах подменяется. */
export interface LivePollingEnvironment {
  document: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>;
  setInterval: (callback: () => void, ms: number) => unknown;
  clearInterval: (handle: unknown) => void;
}

/**
 * Опрос раз в `intervalMs`, пока вкладка видна. Скрытая вкладка запросов не делает; при возврате
 * запрос уходит сразу и интервал начинается заново. Первый запрос при запуске не делается:
 * его делает загрузчик ресурса. Возвращает функцию остановки.
 */
export function startLivePolling(
  poll: () => void,
  intervalMs: number,
  environment: LivePollingEnvironment = {
    document,
    setInterval: (callback, ms) => window.setInterval(callback, ms),
    clearInterval: handle => window.clearInterval(handle as number),
  },
): () => void {
  const { document: doc } = environment;
  let handle: unknown = null;
  const stop = () => {
    if (handle !== null) environment.clearInterval(handle);
    handle = null;
  };
  const start = () => {
    stop();
    handle = environment.setInterval(poll, intervalMs);
  };
  const onVisibility = () => {
    if (doc.visibilityState === 'visible') {
      if (handle === null) {
        poll();
        start();
      }
    } else {
      stop();
    }
  };
  if (doc.visibilityState === 'visible') start();
  doc.addEventListener('visibilitychange', onVisibility);
  return () => {
    doc.removeEventListener('visibilitychange', onVisibility);
    stop();
  };
}
