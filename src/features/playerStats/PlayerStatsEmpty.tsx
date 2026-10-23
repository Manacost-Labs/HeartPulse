import { Gamepad2 } from 'lucide-react';
import { EmptyState } from '../../vendor/varylo-ui/data-display/EmptyState';

/**
 * A mode or filter without games. The section is shown only to accounts the
 * tracker already sends games for, so this never asks to install anything.
 */
export function PlayerStatsEmpty({ filtered }: { filtered: boolean }) {
  return filtered
    ? <EmptyState size="sm" icon={<Gamepad2 aria-hidden="true" />} title="За выбранный период игр нет"
      description="Выберите другой период или формат." />
    : <EmptyState size="sm" icon={<Gamepad2 aria-hidden="true" />} title="В этом режиме пока нет игр"
      description="Игры появятся здесь, когда Hearthpulse отправит их." />;
}
