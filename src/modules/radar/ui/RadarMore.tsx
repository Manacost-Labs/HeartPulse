import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

/** «Подробнее»: раскрывающийся остаток текста или блока, одна и та же кнопка по всей странице. */
export function RadarMore({ label = 'Подробнее', className, children }: { label?: string; className?: string; children: ReactNode }) {
  return <details className={['radar-more', className].filter(Boolean).join(' ')}>
    <summary><span>{label}</span><ChevronDown aria-hidden="true" /></summary>
    <div className="radar-more__body">{children}</div>
  </details>;
}
