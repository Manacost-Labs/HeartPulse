import type { ReactNode } from 'react';

export type AccountEmptyPreviewItem = { icon: ReactNode; title: string; text: string };

/**
 * What a tab will hold once there is data: dashed outlines like the locked
 * section tiles, so it reads as «not yet» and never as invented content.
 */
export default function AccountEmptyPreview({ items }: { items: AccountEmptyPreviewItem[] }) {
  return (
    <ul className="account-empty-preview">
      {items.map(item => (
        <li key={item.title} className="account-empty-preview__item">
          <span className="account-empty-preview__icon" aria-hidden="true">{item.icon}</span>
          <strong>{item.title}</strong>
          <span>{item.text}</span>
        </li>
      ))}
    </ul>
  );
}
