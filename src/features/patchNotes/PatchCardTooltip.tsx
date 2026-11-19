import CardPreviewTooltip, { type CardPreviewTarget } from '../CardPreviewTooltip';

/*
 * The patch page loads the shared card tooltip lazily through this route-local
 * module. Importing `../CardPreviewTooltip` with `import()` directly would make
 * webpack keep that shared module's whole namespace (unmangled exports) on every
 * route that imports it statically, growing their first-load JavaScript.
 */
export default function PatchCardTooltip({ preview }: { preview: CardPreviewTarget }) {
  return <CardPreviewTooltip preview={preview} />;
}
