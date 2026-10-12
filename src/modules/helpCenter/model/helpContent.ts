import { accountHelp } from './accountHelp';
import { gameHelp } from './gameHelp';

import type { HelpSection } from './helpTypes';
export type { HelpQuestion, HelpSection } from './helpTypes';

export const HELP_SECTIONS: HelpSection[] = [...accountHelp, ...gameHelp];
