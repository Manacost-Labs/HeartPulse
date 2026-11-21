import { INLINE_SCRIPTS, type InlineScriptId } from '@/apps/public-web/lib/inlineScripts';

/** A registered inline script; the Content-Security-Policy allows exactly these sources by hash. */
export function InlineScript({ id }: { id: InlineScriptId }) {
  return <script dangerouslySetInnerHTML={{ __html: INLINE_SCRIPTS[id] }} />;
}
