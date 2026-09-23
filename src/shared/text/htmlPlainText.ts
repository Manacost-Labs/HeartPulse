import { decodeHTML } from 'entities';

/** Decode catalog text consistently in server rendering and browser presentation. */
export function htmlPlainText(value: string | null | undefined): string {
  if (!value) return '';
  return decodeHTML(value.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')).trim();
}
