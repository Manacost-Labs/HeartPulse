import type { CSSProperties } from 'react';

/** The ledger row of one class; the loading rows reuse it for their geometry. */
export const ROW_CLASS_NAME = 'arena-class-row group relative grid items-center gap-2.5 rounded-2xl overflow-hidden cursor-default sm:flex sm:gap-4';
export const ROW_STYLE: CSSProperties = {
  background: 'linear-gradient(135deg, #ede0c0 0%, #e2cfa0 50%, #d8c090 100%)',
  border: '1.5px solid #c9a86c', padding: '10px 14px',
  gridTemplateColumns: '28px 36px minmax(82px,96px) minmax(0,1fr)',
};
