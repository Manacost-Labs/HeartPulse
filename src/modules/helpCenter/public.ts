import type { HelpQuestion, HelpSection } from './model/helpTypes';

export { default } from './ui/HelpCenterPage';
export { HELP_SECTIONS as FAQ_PAGE_SECTIONS } from './model/helpContent';

/** Existing FAQ callers can still author a question without a permalink ID. */
export type FAQPageItem = Omit<HelpQuestion, 'id'> & { id?: string };
export type FAQPageSection = Omit<HelpSection, 'items'> & { items: FAQPageItem[] };
