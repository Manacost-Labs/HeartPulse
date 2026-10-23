import { Download, Gamepad2 } from 'lucide-react';
import { Button } from '../../vendor/valyro-ui/basic/Button';
import { EmptyState } from '../../vendor/valyro-ui/data-display/EmptyState';
import { DESKTOP_DOWNLOAD_URL } from '../../modules/playerStats/public';

/**
 * No games yet: the way to get them is the desktop tracker. With a narrower
 * filter the games may exist elsewhere, so only the filter is mentioned.
 */
export function PlayerStatsEmpty({ filtered }: { filtered: boolean }) {
  if (filtered) {
    return <EmptyState size="sm" icon={<Gamepad2 aria-hidden="true" />} title="За выбранный период игр нет"
      description="Выберите другой период или формат." />;
  }
  return (
    <EmptyState
      size="md"
      icon={<Gamepad2 aria-hidden="true" />}
      title="Пока нет игр"
      description="Установите Hearthpulse и войдите, чтобы игры появились здесь."
      primaryAction={(
        <Button asChild variant="primary" size="sm" leftIcon={<Download size={15} aria-hidden="true" />}>
          <a href={DESKTOP_DOWNLOAD_URL} target="_blank" rel="noopener noreferrer">Скачать Hearthpulse</a>
        </Button>
      )}
    />
  );
}
