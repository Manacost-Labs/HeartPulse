/**
 * Prints, as JSON by canonical path, the text a visitor reads in the main part
 * of each text page (`/faq`, `/privacy`, `/terms`, `/developers/api`): the real
 * page components rendered to HTML, then reduced to their text by the HTML
 * parser of the project. Run it from the project root through `tsx`; see
 * `scripts/lib/public-page-texts.mjs`. The page shell (navigation, footer) is
 * left out: it is not the content of the page and changes with other pages.
 */
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createElement, type ComponentType, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import sanitizeHtml from 'sanitize-html';

const root = process.cwd();
const load = async <Exports,>(file: string): Promise<Exports> => import(pathToFileURL(join(root, file)).href);

const visibleText = (element: ReactElement): string => sanitizeHtml(renderToStaticMarkup(element), {
  allowedTags: [], allowedAttributes: {}, nonTextTags: ['style', 'script', 'textarea', 'option', 'noscript'],
}).replace(/\s+/g, ' ').trim();

const { default: HelpCenterPage } = await load<{ default: ComponentType }>('src/modules/helpCenter/public.ts');
const { default: LegalPage } = await load<{ default: ComponentType<{ kind: 'privacy' | 'terms' }> }>('src/modules/legalPages/public.ts');
const { DeveloperApiPage } = await load<{ DeveloperApiPage: ComponentType }>('src/modules/developerApi/public.ts');

process.stdout.write(JSON.stringify({
  '/faq': visibleText(createElement(HelpCenterPage)),
  '/privacy': visibleText(createElement(LegalPage, { kind: 'privacy' })),
  '/terms': visibleText(createElement(LegalPage, { kind: 'terms' })),
  '/developers/api': visibleText(createElement(DeveloperApiPage)),
}));
