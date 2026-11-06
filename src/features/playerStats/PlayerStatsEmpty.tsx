import { Gamepad2 } from 'lucide-react';
import { EmptyState } from '../../vendor/varylo-ui/data-display/EmptyState';
import { PROFILE_STATS_TEXT, type ProfileStatsText } from '../../modules/playerStats/public';

/**
 * A mode or filter without games. The section is shown only to accounts the
 * tracker already sends games for, so this never asks to install anything.
 */
export function PlayerStatsEmpty({ filtered, text = PROFILE_STATS_TEXT.ru }: { filtered: boolean; text?: ProfileStatsText }) {
  return filtered
    ? <EmptyState size="sm" icon={<Gamepad2 aria-hidden="true" />} title={text.emptyPeriod} description={text.emptyPeriodText} />
    : <EmptyState size="sm" icon={<Gamepad2 aria-hidden="true" />} title={text.emptyMode} description={text.emptyModeText} />;
}
