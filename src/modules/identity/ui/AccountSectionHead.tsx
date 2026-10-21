import type { ReactNode } from 'react';

/** The site's three-part section heading: eyebrow with an icon, display title, one line of description. */
export default function AccountSectionHead({ id, icon, eyebrow, title, description, aside }: {
  id: string;
  icon: ReactNode;
  eyebrow: string;
  title: string;
  description?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <header className="account-section__head">
      <div className="account-section__heading">
        <p className="account-section__eyebrow">{icon}{eyebrow}</p>
        <h2 id={id}>{title}</h2>
        {description && <p className="account-section__description">{description}</p>}
      </div>
      {aside && <div className="account-section__aside">{aside}</div>}
    </header>
  );
}
